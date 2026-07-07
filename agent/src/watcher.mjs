#!/usr/bin/env node
/**
 * HipHop Article Watcher
 *
 * Terminalで1回起動しておくスクリプト。
 * index.mjs が /tmp/hiphop-trigger-*.txt を書くと検知し、
 * Claude Code CLI で記事生成 → 歌詞チェック → ビルド → git push を実行する。
 */

import { readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const CLAUDE_BIN = '/Users/ktamatzmoto/.local/bin/claude';
// モデルは trigger の meta.model で切り替える（既定 opus）。
// 記事生成・自由指示は事実チェック＋長文構成が重いので Opus 既定。
// トーン修正（修正依頼）は三稿制（初稿→疑う→仕上げ）で品質をシステム側に持たせるため Sonnet で回してトークンを節約する。
const DEFAULT_MODEL = 'opus';
const CLAUDE_FLAGS_TAIL = '--print --permission-mode acceptEdits --dangerously-skip-permissions';
const claudeFlags = (model) => `--model ${model || DEFAULT_MODEL} ${CLAUDE_FLAGS_TAIL}`;

// 課金方針: API従量課金を避け、Claude サブスク（OAuth）で動かす。
// CLAUDE_CODE_OAUTH_TOKEN（`claude setup-token` で発行）があればそれを使い、
// ANTHROPIC_API_KEY は claude に渡さない（API_KEY があるとCLIがそちらを優先＝課金されるため）。
if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  delete process.env.ANTHROPIC_API_KEY;
  console.log('  [auth] CLAUDE_CODE_OAUTH_TOKEN を検出 → サブスク(OAuth)で実行（API課金なし）');
} else {
  console.warn('  [auth] CLAUDE_CODE_OAUTH_TOKEN 未設定 → API_KEY 経路（従量課金）。`claude setup-token` 推奨');
}
// review運用（2026-07-02〜）: 記事の実作業は常設worktree hiphop-review（reviewブランチ）で行い、
// mainへは agent/src/publish-main.mjs（/publishコマンド）経由でのみ反映する。
const HIPHOP_CWD = '/Users/ktamatzmoto/Desktop/hiphop-review';
const POLL_MS = 3000;

console.log('═══════════════════════════════════════');
console.log('  HipHop Article Watcher 起動');
console.log('  Telegramで曲名を送ると自動で記事生成します');
console.log('  終了: Ctrl+C');
console.log('═══════════════════════════════════════\n');

function run(cmd, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn('/bin/bash', ['-c', cmd], {
      cwd: HIPHOP_CWD,
      stdio: opts.silent ? 'pipe' : 'inherit',
      ...opts,
    });
    let stdout = '';
    if (opts.silent) {
      child.stdout?.on('data', d => { stdout += d; });
      child.stderr?.on('data', d => { stdout += d; });
    }
    child.on('close', code => resolve({ code, stdout }));
    child.on('error', e => resolve({ code: 1, stdout: e.message }));
  });
}

/** claude を JSON出力で実行し、結果テキストと session_id を返す。resumeId 指定で会話継続。 */
async function runClaudeJson(promptFile, resumeId, model) {
  const outJson = '/tmp/hiphop-claude.json';
  const errLog = '/tmp/hiphop-claude.log';
  const resumeFlag = resumeId ? `--resume ${resumeId}` : '';
  // stdout=JSON / stderr=エラーログ に分離（JSONを汚さない）。pipeline末尾がclaudeなのでcodeはclaudeの終了コード。
  const r = await run(
    `set -o pipefail; cat "${promptFile}" | ${CLAUDE_BIN} ${claudeFlags(model)} --output-format json ${resumeFlag} >"${outJson}" 2>"${errLog}"`,
    { silent: true }
  );
  let json = null;
  try { json = JSON.parse(await readFile(outJson, 'utf-8')); } catch {}
  const errText = await readFile(errLog, 'utf-8').catch(() => '');
  return { code: r.code, json, errText };
}

/** Claude CLI 失敗ログから人間が読める原因を1行抽出する（歌詞は載らない運用前提のログ末尾を見る） */
function extractErrorReason(log) {
  const known = [
    /Credit balance is too low/i,
    /rate limit/i,
    /usage limit/i,
    /Invalid API key|authentication|OAuth|not logged in/i,
    /quota/i,
  ];
  const lines = log.split('\n').map(l => l.trim()).filter(Boolean);
  for (const re of known) {
    const hit = lines.find(l => re.test(l));
    if (hit) return hit.slice(0, 200);
  }
  // 既知パターンが無ければ末尾の非空行を返す
  return (lines[lines.length - 1] || '').slice(0, 200);
}

/** SUMMARY 行に加え、実際にコミットされた成果物（件名・変更ファイル）を本文化して返す */
async function buildDeliverableReport(summary, headBefore, headAfter) {
  const parts = [];
  if (summary) parts.push(summary);

  const committed = headAfter && headBefore && headAfter !== headBefore;
  if (committed) {
    const subject = (await run(`git log -1 --format=%s`, { silent: true })).stdout.trim();
    const files = (await run(`git show --stat --format= --name-only HEAD`, { silent: true }))
      .stdout.split('\n').map(s => s.trim()).filter(Boolean);
    const fileLine = files.length
      ? `変更: ${files.slice(0, 6).join(', ')}${files.length > 6 ? ` ほか${files.length - 6}件` : ''}`
      : '';
    // SUMMARY が空でも、コミット件名を成果物として必ず返す（「完了」のみ防止）
    if (!summary && subject) parts.push(subject);
    parts.push(`📦 commit: ${subject}`.trim());
    if (fileLine) parts.push(fileLine);
  } else if (!summary) {
    // コミットも SUMMARY も無い＝調査/変更なし。空通知を防ぐフォールバック
    parts.push('（変更なし・調査のみ完了。詳細はSUMMARY未出力）');
  }
  return parts.join('\n').slice(0, 1500);
}

async function processTrigger(triggerFile) {
  const ts = triggerFile.match(/hiphop-trigger-(\d+)\.txt$/)?.[1];
  if (!ts) return;

  const doneFile = `/tmp/hiphop-done-${ts}.txt`;

  // triggerファイルをJSONとして読む
  let meta = {};
  try {
    meta = JSON.parse(await readFile(triggerFile, 'utf-8'));
  } catch {
    // 旧フォーマット（plain text = promptFileパス）
    meta.promptFile = (await readFile(triggerFile, 'utf-8')).trim();
  }
  const { promptFile, slug } = meta;

  const writeDone = (exitCode, error = null) =>
    writeFile(doneFile, JSON.stringify({ exitCode, error }), 'utf-8');

  // 自由指示モード: Claude 自身に build/git まで行わせ、記事用の後処理はスキップする
  if (meta.mode === 'freeform') {
    console.log(`\n[freeform] Claude実行中（model=${meta.model || DEFAULT_MODEL}）...${meta.resumeId ? ' (継続 resume)' : ''}`);
    // 実行前後の HEAD を記録し、コミットの有無＝成果物を後で判定する
    const headBefore = (await run(`git rev-parse HEAD`, { silent: true })).stdout.trim();

    let res = await runClaudeJson(promptFile, meta.resumeId || null, meta.model);
    // resume指定が無効（古い/壊れたセッション）なら新規セッションで1回だけリトライ
    if (meta.resumeId && (res.code !== 0 || !res.json)) {
      console.warn('[freeform] resume失敗 → 新規セッションでリトライ');
      res = await runClaudeJson(promptFile, null, meta.model);
    }

    // 失敗時: stderr から実際の理由（例: Credit balance is too low）を抽出して返す
    if (res.code !== 0 || !res.json || res.json.is_error) {
      const errLine = extractErrorReason(res.errText || (res.json && res.json.result) || '');
      console.log(`[freeform] 失敗 (exit: ${res.code}) — ${errLine}`);
      await writeFile(
        doneFile,
        JSON.stringify({ exitCode: res.code || 1, error: errLine || `Claude exit ${res.code}`, summary: '' }),
        'utf-8'
      );
      cleanup(triggerFile, promptFile);
      return;
    }

    // 成功時: SUMMARY に加えて、実際にコミットされた成果物（件名・変更ファイル）を添える
    const resultText = String(res.json.result || '');
    const m = resultText.match(/SUMMARY:\s*(.+?)\s*$/m);
    const summary = m ? m[1].trim() : '';
    const sessionId = res.json.session_id || null;

    const headAfter = (await run(`git rev-parse HEAD`, { silent: true })).stdout.trim();
    const report = await buildDeliverableReport(summary, headBefore, headAfter);
    console.log(`[freeform] 完了 — ${report.replace(/\n/g, ' / ')}`);
    await writeFile(
      doneFile,
      JSON.stringify({ exitCode: 0, error: null, summary: report, sessionId }),
      'utf-8'
    );
    cleanup(triggerFile, promptFile);
    return;
  }

  console.log(`\n[1/4] Claude記事生成中... slug=${slug || '(unknown)'}`);

  // Step 1: Claude CLI実行（記事生成は事実チェックが重いので既定モデル＝Opus）
  const claudeResult = await run(
    `cat "${promptFile}" | ${CLAUDE_BIN} ${claudeFlags(meta.model)} 2>&1 | tee /tmp/hiphop-claude.log`
  );

  if (claudeResult.code !== 0) {
    console.error(`Claude失敗 (exit: ${claudeResult.code})`);
    await writeDone(1, `Claude exit ${claudeResult.code}`);
    cleanup(triggerFile, promptFile);
    return;
  }

  // Step 2: profanityをcensor
  if (slug) {
    console.log(`\n[2/6] censor-lyrics...`);
    await run(`node agent/src/censor-lyrics.mjs ${slug}`, { silent: true });
  }

  // Step 3: 歌詞カバレッジチェック
  if (slug) {
    console.log(`\n[3/6] 歌詞カバレッジチェック...`);
    const checkResult = await run(
      `node agent/src/check-lyrics-coverage.mjs ${slug}`,
      { silent: true }
    );
    const output = checkResult.stdout;
    console.log(output);

    if (output.includes('❌') || checkResult.code !== 0) {
      console.error('歌詞チェック失敗 — pushをスキップ');
      await writeDone(1, `歌詞カバレッジ不足: ${slug}`);
      cleanup(triggerFile, promptFile);
      return;
    }
  }

  // Step 3: カバー画像チェック
  if (slug) {
    console.log(`\n[4/6] カバー画像チェック...`);
    const imgResult = await run(
      `node agent/src/check-cover-image.mjs ${slug}`,
      { silent: true }
    );
    console.log(imgResult.stdout);
    if (imgResult.code !== 0) {
      console.warn('カバー画像NG — 警告のみ（続行）');
    }
  }

  // Step 4: artists.ts 整合性チェック
  if (slug) {
    console.log(`\n[5/6] artists.ts チェック...`);
    try {
      const songsSrc = readFileSync(`${HIPHOP_CWD}/src/data/songs.ts`, 'utf-8');
      const songLine = songsSrc.split('\n').find(l => l.includes(`slug: '/songs/${slug}'`));
      const artistSlug = songLine?.match(/artistSlug: '([^']+)'/)?.[1];
      if (artistSlug) {
        const artistsSrc = readFileSync(`${HIPHOP_CWD}/src/data/artists.ts`, 'utf-8');
        if (artistsSrc.includes(`slug: '${artistSlug}'`)) {
          console.log(`✅ artists.ts: ${artistSlug} 登録済み`);
        } else {
          console.error(`❌ artists.ts: ${artistSlug} が未登録 — pushをスキップ`);
          await writeDone(1, `artists.ts未登録: ${artistSlug}`);
          cleanup(triggerFile, promptFile);
          return;
        }
      } else {
        console.warn(`⚠ songs.tsに ${slug} が見つからない — songs.tsの追記を確認してください`);
      }
    } catch (e) {
      console.warn(`artists.tsチェックエラー: ${e.message}`);
    }
  }

  // Step 5.5: learning型の頭出し秒数を units.json の fallbackT から決定的に生成（units.jsonが在る曲のみ）
  // 2026-07-03確定: whisper/音源DLは使わない（AI不使用）。正確な秒数は運営者がプレビュー実測で
  // 指示し set-manual-timestamp.mjs で焼く（docs/timestamp-override.md）。
  if (slug) {
    const hasUnits = (() => {
      try { return readFileSync(`${HIPHOP_CWD}/agent/${slug}/assets/units.json`, 'utf-8').length > 0; }
      catch { return false; }
    })();
    if (hasUnits) {
      console.log(`\n[6/8] 頭出し秒数生成 (fallbackT・whisper不使用)...`);
      const tsResult = await run(`node agent/src/gen-fallback-timestamps.mjs --slug ${slug}`, { silent: true });
      console.log(tsResult.stdout);
      // 低信頼でも file が出来ていれば続行。生成自体に失敗(exit2)した時のみブロック
      // （.astroが units-timestamps.json を import するため不在だとビルド/クリーンビルドで落ちる）。
      try {
        readFileSync(`${HIPHOP_CWD}/agent/${slug}/assets/units-timestamps.json`, 'utf-8');
      } catch {
        console.error('❌ units-timestamps.json 生成失敗 — pushをスキップ');
        await writeDone(1, `units-timestamps.json生成失敗: ${slug}`);
        cleanup(triggerFile, promptFile);
        return;
      }
    }
  }

  // Step 6: ビルド確認（作業ツリー）
  console.log(`\n[7/8] npm run build...`);
  const buildResult = await run('npm run build', { silent: true });
  if (buildResult.code !== 0) {
    console.error('ビルド失敗');
    console.log(buildResult.stdout.slice(-2000));
    await writeDone(1, 'ビルド失敗');
    cleanup(triggerFile, promptFile);
    return;
  }
  console.log('ビルド OK');

  // git add → commit（pushはクリーンビルド通過後）
  // ※ "git add ." は使わず生成slugに対応するパスのみ明示列挙する（ユーザーのローカル作業と競合防止）。
  //   learning型は .astro が import する units-timestamps.json が必須。これに加え
  //   入力の units.json と whisper入力 audio.mp3 も同梱し、クリーンcloneで再現可能にする。
  console.log('\n[8/8] git commit...');
  const existing = (rel) => { try { return readFileSync(`${HIPHOP_CWD}/${rel}`) && rel; } catch { return null; } };
  const files = [
    slug ? `src/pages/songs/${slug}.astro` : null,
    'src/data/songs.ts',
    'src/data/artists.ts',
    slug ? existing(`public/images/covers/${slug}.jpg`) : null,
    // learning型の参照データ（commit漏れ＝werdz型ビルド落ちの原因）
    slug ? existing(`agent/${slug}/assets/units-timestamps.json`) : null,
    slug ? existing(`agent/${slug}/assets/units.json`) : null,
    slug ? existing(`agent/${slug}/assets/audio.mp3`) : null,
  ].filter(Boolean).join(' ');

  const commitResult = await run(
    `git add ${files} && git commit -m "feat(songs): add ${slug || 'new song'}"`,
    { silent: true }
  );
  if (commitResult.code !== 0) {
    console.error('git commit失敗');
    console.log(commitResult.stdout);
    await writeDone(1, 'git commit失敗');
    cleanup(triggerFile, promptFile);
    return;
  }

  // クリーンビルド検証（作業ツリー非依存）— commit済みのみでビルドが通るか＝commit漏れ検知
  console.log('\nクリーンビルド検証（commit漏れ検知）...');
  const cleanResult = await run('node agent/src/clean-build-check.mjs', { silent: true });
  console.log(cleanResult.stdout.slice(-2000));
  if (cleanResult.code !== 0) {
    console.error('❌ クリーンビルド失敗 — 参照ファイルのcommit漏れの可能性。pushを中止（commitはローカルに残置）。');
    await writeDone(1, `クリーンビルド失敗(commit漏れの可能性): ${slug}`);
    cleanup(triggerFile, promptFile);
    return;
  }

  // push抑止ゲート（人間確認フロー用）: /tmp/hiphop-no-push が在れば push せず commit を残置
  try {
    readFileSync('/tmp/hiphop-no-push', 'utf-8');
    console.log('\n⏸ push抑止ゲート有効（/tmp/hiphop-no-push）— commit＋クリーンビルドのみ完了。pushは保留。');
    await writeDone(0, 'PUSH_HELD');
    cleanup(triggerFile, promptFile);
    return;
  } catch {
    // ゲート無し → 通常push
  }

  // push（クリーンビルド通過後のみ）— reviewブランチへのみpush。mainへはpublish-main.mjs経由。
  console.log('\ngit push origin review...');
  const gitResult = await run('git push origin review', { silent: true });
  if (gitResult.code !== 0) {
    console.error('git push失敗');
    console.log(gitResult.stdout);
    await writeDone(1, 'git push失敗');
    cleanup(triggerFile, promptFile);
    return;
  }
  console.log('push 完了');

  // push成功後: レビュー依頼をTelegramへ決定的に送る（プレビューURL付き・失敗しても処理は止めない）
  if (slug) {
    const notifyResult = await run(`node agent/src/notify-review.mjs ${slug}`, { silent: true });
    if (notifyResult.code !== 0) {
      console.warn(`⚠ レビュー通知失敗（処理は続行）: ${notifyResult.stdout.slice(-200)}`);
    } else {
      console.log(notifyResult.stdout.trim());
    }
  }

  await writeDone(0);
  cleanup(triggerFile, promptFile);
}

function cleanup(...files) {
  for (const f of files) {
    if (f) unlink(f).catch(() => {});
  }
}

// メインループ
let processing = false;
setInterval(async () => {
  if (processing) return;
  try {
    const files = await readdir('/tmp');
    const triggers = files
      .filter(f => f.startsWith('hiphop-trigger-') && f.endsWith('.txt'))
      .map(f => `/tmp/${f}`)
      .sort();

    if (triggers.length === 0) return;

    processing = true;
    for (const trigger of triggers) {
      await processTrigger(trigger);
    }
  } catch (e) {
    console.error(`ループエラー: ${e.message}`);
  } finally {
    processing = false;
  }
}, POLL_MS);
