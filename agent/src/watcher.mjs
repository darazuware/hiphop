#!/usr/bin/env node
/**
 * HipHop Article Watcher
 *
 * Terminalで1回起動しておくスクリプト。
 * LaunchAgentが /tmp/hiphop-trigger-*.txt を書くと検知し、
 * Claude Code CLI で記事生成・デプロイを実行する。
 *
 * 起動方法:
 *   node /Users/ktamatzmoto/Desktop/hiphop/agent/src/watcher.mjs
 */

import { readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const CLAUDE_BIN = '/Users/ktamatzmoto/.local/bin/claude';
const HIPHOP_CWD = '/Users/ktamatzmoto/Desktop/hiphop';
const POLL_MS = 3000;

console.log('═══════════════════════════════════════');
console.log('  🎵 HipHop Article Watcher 起動');
console.log('  Telegramで曲名を送ると自動で記事生成します');
console.log('  終了: Ctrl+C');
console.log('═══════════════════════════════════════\n');

async function processTrigger(triggerFile) {
  const ts = triggerFile.match(/hiphop-trigger-(\d+)\.txt$/)?.[1];
  if (!ts) return;

  const doneFile = `/tmp/hiphop-done-${ts}.txt`;
  const promptFile = (await readFile(triggerFile, 'utf-8')).trim();

  console.log(`\n📝 記事生成開始... (${new Date().toLocaleTimeString()})`);

  try {
    const exitCode = await new Promise((resolve) => {
      const cmd = `cat "${promptFile}" | ${CLAUDE_BIN} --print --permission-mode acceptEdits --dangerously-skip-permissions 2>&1 | tee /tmp/hiphop-claude.log`;
      const child = spawn('/bin/bash', ['-c', cmd], {
        cwd: HIPHOP_CWD,
        stdio: 'inherit', // ターミナルにそのまま出力
      });

      child.on('close', resolve);
      child.on('error', (e) => {
        console.error(`  エラー: ${e.message}`);
        resolve(1);
      });
    });

    await writeFile(doneFile, String(exitCode), 'utf-8');
    console.log(exitCode === 0 ? '\n✅ 完了！' : `\n❌ エラー (exit: ${exitCode})`);
  } finally {
    unlink(triggerFile).catch(() => {});
    unlink(promptFile).catch(() => {});
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
