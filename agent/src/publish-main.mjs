#!/usr/bin/env node
/**
 * review ブランチを main へ反映する（本番push）専用スクリプト。
 * 自然文解釈ではなく決定的な手順のみで実行する（Telegram /publish コマンドから呼ばれる）。
 *
 * 手順: fetch → main checkout/merge origin/main → merge review → build確認 → push origin main
 * 失敗時は main を汚さず（コンフリクト時は merge --abort）、pushもしない。
 *
 * 実行は主worktree（このファイルの2階層上 = リポジトリ直下）で行う。
 */

import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function fail(reason) {
  console.log(`❌ FAILED: ${reason}`);
  process.exit(1);
}

try {
  run('git fetch origin');
} catch (e) {
  fail(`git fetch失敗: ${(e.stderr || e.message).toString().slice(-400)}`);
}

try {
  run('git checkout main');
  // 【重要】ここは reset --hard origin/main にしてはいけない。
  // このリポジトリの主worktreeには、このスクリプトの管理下にない曲動画生成の
  // 作業中ファイル（agent/配下のmp3・html等）が常時未コミットのまま置かれている。
  // reset --hard は「分岐の解消」に確実だが、未コミットのローカル変更を無条件かつ
  // 無警告で全て破棄してしまう（過去に実際にこれをやろうとして曲動画WIPを消しかけた）。
  // 明示的な git merge なら、ローカル専用コミット(例: 過去の失敗試行で main に残った
  // マージ済みcommit)とorigin/mainを安全に統合しつつ、無関係な未コミット変更は
  // 触れない範囲であれば保持される。真にコンフリクトする場合は例外を投げて
  // fail()するだけで、何も破壊しない。
  run('git merge --no-edit origin/main');
} catch (e) {
  fail(`main checkout/merge失敗: ${(e.stderr || e.message).toString().slice(-400)}`);
}

// 「公開すべき新規分」はorigin/main基準で判定する（マージ直前のローカルHEAD基準だと、
// 前回試行がビルド/pushで失敗してmainがローカルにマージ済みのまま残っているケースで
// 「マージしても新規コミットが増えない＝反映なし」と誤判定し、pushすべき分を永遠に
// 取りこぼす）。
const remoteMainBeforeMerge = run('git rev-parse origin/main').trim();

try {
  run('git merge --no-edit origin/review');
} catch (e) {
  try { run('git merge --abort'); } catch {}
  fail(`review マージ失敗（コンフリクトの可能性）: ${(e.stderr || e.message).toString().slice(-400)}`);
}

const afterMergeHead = run('git rev-parse HEAD').trim();

if (remoteMainBeforeMerge === afterMergeHead) {
  console.log('ℹ️ NOTHING_TO_PUBLISH: reviewに新しい変更はありません');
  process.exit(0);
}

try {
  run('npm run build');
} catch (e) {
  // ビルド失敗時は main を pushしない。マージ済みcommitはローカルに残す（次回修正して再実行できるように）。
  fail(`ビルド失敗（pushしていません。mainはローカルにマージ済みのまま残置）: ${(e.stderr || e.message).toString().slice(-800)}`);
}

try {
  run('git push origin main');
} catch (e) {
  fail(`git push失敗: ${(e.stderr || e.message).toString().slice(-400)}`);
}

const subjects = run(`git log --pretty=format:%s ${remoteMainBeforeMerge}..${afterMergeHead}`)
  .split('\n')
  .filter(Boolean);

console.log('✅ PUBLISHED');
console.log('COMMITS:');
for (const s of subjects) console.log(`- ${s}`);
console.log('URL: https://waxthink.com');
