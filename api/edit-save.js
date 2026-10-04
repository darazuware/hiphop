// Vercel Serverless Function（Node.js）。review プレビューでのみ動作し、
// GitHub Contents API 経由で曲ページ(.astro)の本文テキストを一意な文字列置換として
// review ブランチへ直接コミットする。編集オーバーレイ（EditOverlay.astro）専用の保存先。
//
// 安全弁: VERCEL_ENV / VERCEL_GIT_COMMIT_REF が review プレビュー以外なら常に403。
// 本番(main/waxthink.com)デプロイでは絶対に書き込みを実行しない。

const OWNER = 'darazuware';
const REPO = 'hiphop';
const BRANCH = 'review';
const MAX_CHANGES = 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }

  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== BRANCH) {
    res.status(403).json({ ok: false, error: 'この機能は review プレビューでのみ利用できます' });
    return;
  }

  const token = process.env.GITHUB_EDIT_TOKEN;
  if (!token) {
    res.status(500).json({ ok: false, error: 'GITHUB_EDIT_TOKEN が未設定です（Vercel環境変数）' });
    return;
  }

  const { slug, changes } = req.body ?? {};
  if (typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
    res.status(400).json({ ok: false, error: 'invalid slug' });
    return;
  }
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > MAX_CHANGES) {
    res.status(400).json({ ok: false, error: 'invalid changes' });
    return;
  }
  for (const c of changes) {
    if (typeof c?.oldText !== 'string' || typeof c?.newText !== 'string' || c.oldText.length === 0) {
      res.status(400).json({ ok: false, error: 'invalid change entry' });
      return;
    }
  }

  const path = `src/pages/songs/${slug}.astro`;
  const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'waxthink-edit-overlay',
  };

  let getRes;
  try {
    getRes = await fetch(`${apiBase}?ref=${BRANCH}`, { headers: ghHeaders });
  } catch {
    res.status(502).json({ ok: false, error: 'GitHubへの接続に失敗しました' });
    return;
  }
  if (!getRes.ok) {
    res.status(getRes.status === 404 ? 404 : 502).json({ ok: false, error: `ファイル取得に失敗しました (${getRes.status})` });
    return;
  }
  const fileData = await getRes.json();
  const sha = fileData.sha;
  let content = Buffer.from(fileData.content, 'base64').toString('utf-8');

  for (let i = 0; i < changes.length; i++) {
    const { oldText, newText } = changes[i];
    const count = content.split(oldText).length - 1;
    if (count !== 1) {
      res.status(409).json({
        ok: false,
        error: `変更${i + 1}件目: 元テキストがファイル内で一意に特定できません（${count}箇所ヒット）。ページを再読み込みしてやり直してください。`,
        failedIndex: i,
      });
      return;
    }
    content = content.replace(oldText, newText);
  }

  let putRes;
  try {
    putRes = await fetch(apiBase, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `edit(review): ${slug} 文言修正（編集オーバーレイ・${changes.length}件）`,
        content: Buffer.from(content, 'utf-8').toString('base64'),
        sha,
        branch: BRANCH,
      }),
    });
  } catch {
    res.status(502).json({ ok: false, error: 'コミットに失敗しました（接続エラー）' });
    return;
  }
  if (!putRes.ok) {
    const body = await putRes.text();
    res.status(409).json({ ok: false, error: `コミットに失敗しました (${putRes.status}): ${body.slice(0, 300)}` });
    return;
  }

  const putData = await putRes.json();
  res.status(200).json({ ok: true, changedCount: changes.length, commitUrl: putData.commit?.html_url ?? null });
}
