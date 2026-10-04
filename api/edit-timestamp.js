// Vercel Serverless Function（Node.js）。review プレビューでのみ動作し、
// 学習ユニットの頭出し秒(manualSec)を GitHub Git Data API で
// agent/{slug}/assets/units.json と units-timestamps.json へ同一コミットとして焼く。
// スキーマ・優先順位は docs/timestamp-override.md（manualSec最優先）に準拠。
//
// unit は「ページ内の .learning-unit 出現順インデックス」で特定する（id文字列はDOMに
// 出ないため）。units.json と units-timestamps.json の並びは記事執筆時から同一という
// 既存運用の前提に乗るが、念のため両ファイルの該当indexの id が一致するか、かつ
// クライアントが送ってきた「編集前に表示されていた秒(expectedT)」が現在値と一致するかを
// 検証してから書き込む（ズレていれば409で拒否＝サイレントな誤爆を防ぐ）。

const OWNER = 'darazuware';
const REPO = 'hiphop';
const BRANCH = 'review';
const MAX_CHANGES = 10;

async function gh(path, token, init) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'waxthink-edit-overlay',
      ...(init?.headers || {}),
    },
  });
  return res;
}

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
    if (
      typeof c?.index !== 'number' || c.index < 0 ||
      typeof c?.expectedT !== 'number' ||
      typeof c?.newSec !== 'number' || c.newSec < 0 || c.newSec > 36000
    ) {
      res.status(400).json({ ok: false, error: 'invalid change entry' });
      return;
    }
  }

  const unitsPath = `agent/${slug}/assets/units.json`;
  const tsPath = `agent/${slug}/assets/units-timestamps.json`;

  const [unitsRes, tsRes] = await Promise.all([
    gh(`/repos/${OWNER}/${REPO}/contents/${unitsPath}?ref=${BRANCH}`, token),
    gh(`/repos/${OWNER}/${REPO}/contents/${tsPath}?ref=${BRANCH}`, token),
  ]);
  if (!unitsRes.ok || !tsRes.ok) {
    res.status(502).json({ ok: false, error: `タイムスタンプファイルの取得に失敗しました (units:${unitsRes.status} ts:${tsRes.status})` });
    return;
  }
  const unitsFile = await unitsRes.json();
  const tsFile = await tsRes.json();
  const units = JSON.parse(Buffer.from(unitsFile.content, 'base64').toString('utf-8'));
  const ts = JSON.parse(Buffer.from(tsFile.content, 'base64').toString('utf-8'));

  for (let i = 0; i < changes.length; i++) {
    const { index, expectedT, newSec } = changes[i];
    if (index >= units.length || index >= ts.length) {
      res.status(409).json({ ok: false, error: `変更${i + 1}件目: ユニットindexが範囲外です。ページを再読み込みしてください。` });
      return;
    }
    if (units[index].id !== ts[index].id) {
      res.status(409).json({ ok: false, error: `変更${i + 1}件目: units.jsonとunits-timestamps.jsonの並びが一致しません（手動での既存不整合の疑い）。直接確認してください。` });
      return;
    }
    const currentT = typeof ts[index].t === 'number' ? ts[index].t : null;
    if (currentT === null || Math.round(currentT * 10) !== Math.round(expectedT * 10)) {
      res.status(409).json({ ok: false, error: `変更${i + 1}件目: 表示中の秒数とファイルの現在値がズレています。ページを再読み込みしてやり直してください。` });
      return;
    }
  }

  for (const { index, newSec } of changes) {
    units[index].manualSec = newSec;
    ts[index].manualSec = newSec;
    ts[index].t = newSec;
    ts[index].source = 'manual';
    ts[index].approx = false;
  }

  // Git Data API で units.json + units-timestamps.json を1コミットに atomic にまとめる
  const refRes = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`, token);
  if (!refRes.ok) {
    res.status(502).json({ ok: false, error: `ブランチ参照の取得に失敗しました (${refRes.status})` });
    return;
  }
  const refData = await refRes.json();
  const baseCommitSha = refData.object.sha;

  const commitRes = await gh(`/repos/${OWNER}/${REPO}/git/commits/${baseCommitSha}`, token);
  if (!commitRes.ok) {
    res.status(502).json({ ok: false, error: `ベースコミットの取得に失敗しました (${commitRes.status})` });
    return;
  }
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree.sha;

  const blobs = {};
  for (const [path, obj] of [[unitsPath, units], [tsPath, ts]]) {
    const blobRes = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: Buffer.from(JSON.stringify(obj, null, 2), 'utf-8').toString('base64'), encoding: 'base64' }),
    });
    if (!blobRes.ok) {
      res.status(502).json({ ok: false, error: `blob作成に失敗しました (${path}, ${blobRes.status})` });
      return;
    }
    blobs[path] = (await blobRes.json()).sha;
  }

  const treeRes = await gh(`/repos/${OWNER}/${REPO}/git/trees`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [
        { path: unitsPath, mode: '100644', type: 'blob', sha: blobs[unitsPath] },
        { path: tsPath, mode: '100644', type: 'blob', sha: blobs[tsPath] },
      ],
    }),
  });
  if (!treeRes.ok) {
    res.status(502).json({ ok: false, error: `tree作成に失敗しました (${treeRes.status})` });
    return;
  }
  const newTreeSha = (await treeRes.json()).sha;

  const newCommitRes = await gh(`/repos/${OWNER}/${REPO}/git/commits`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `edit(review): ${slug} タイムスタンプ修正（編集オーバーレイ・${changes.length}件）`,
      tree: newTreeSha,
      parents: [baseCommitSha],
    }),
  });
  if (!newCommitRes.ok) {
    res.status(502).json({ ok: false, error: `コミット作成に失敗しました (${newCommitRes.status})` });
    return;
  }
  const newCommitSha = (await newCommitRes.json()).sha;

  const updateRefRes = await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: newCommitSha }),
  });
  if (!updateRefRes.ok) {
    const body = await updateRefRes.text();
    res.status(409).json({ ok: false, error: `ブランチ更新に失敗しました（他の変更と競合した可能性）。再読み込みして再実行してください。 (${updateRefRes.status}: ${body.slice(0, 200)})` });
    return;
  }

  res.status(200).json({ ok: true, changedCount: changes.length, commitSha: newCommitSha });
}
