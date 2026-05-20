#!/usr/bin/env node
/**
 * HipHop Article Watcher
 *
 * Terminalで1回起動しておくスクリプト。
 * index.mjs が /tmp/hiphop-trigger-*.txt を書くと検知し、
 * Claude Code CLI で記事生成 → 歌詞チェック → ビルド → git push を実行する。
 */

import { readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import { spawn, execSync } from 'node:child_process';

const CLAUDE_BIN = '/Users/ktamatzmoto/.local/bin/claude';
const HIPHOP_CWD = '/Users/ktamatzmoto/Desktop/hiphop';
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

  console.log(`\n[1/4] Claude記事生成中... slug=${slug || '(unknown)'}`);

  // Step 1: Claude CLI実行
  const claudeResult = await run(
    `cat "${promptFile}" | ${CLAUDE_BIN} --print --permission-mode acceptEdits --dangerously-skip-permissions 2>&1 | tee /tmp/hiphop-claude.log`
  );

  if (claudeResult.code !== 0) {
    console.error(`Claude失敗 (exit: ${claudeResult.code})`);
    await writeDone(1, `Claude exit ${claudeResult.code}`);
    cleanup(triggerFile, promptFile);
    return;
  }

  // Step 2: 歌詞カバレッジチェック
  if (slug) {
    console.log(`\n[2/4] 歌詞カバレッジチェック...`);
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

  // Step 3: ビルド確認
  console.log(`\n[3/4] npm run build...`);
  const buildResult = await run('npm run build', { silent: true });
  if (buildResult.code !== 0) {
    console.error('ビルド失敗');
    console.log(buildResult.stdout.slice(-2000));
    await writeDone(1, 'ビルド失敗');
    cleanup(triggerFile, promptFile);
    return;
  }
  console.log('ビルド OK');

  // Step 4: git add → commit → push
  console.log(`\n[4/4] git push...`);
  const files = [
    slug ? `src/pages/songs/${slug}.astro` : null,
    'src/data/songs.ts',
    'src/data/artists.ts',
    slug ? `public/images/covers/${slug}.jpg` : null,
  ].filter(Boolean).join(' ');

  const gitResult = await run(
    `git add ${files} && git commit -m "feat(songs): add ${slug || 'new song'}" && git push`,
    { silent: true }
  );
  if (gitResult.code !== 0) {
    console.error('git push失敗');
    console.log(gitResult.stdout);
    await writeDone(1, 'git push失敗');
    cleanup(triggerFile, promptFile);
    return;
  }
  console.log('push 完了');

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
