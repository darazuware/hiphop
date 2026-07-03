#!/usr/bin/env node
/**
 * review ブランチを main へ反映する（本番push）専用スクリプト。
 * 自然文解釈ではなく決定的な手順のみで実行する（Telegram /publish コマンドから呼ばれる）。
 *
 * 手順: fetch → main checkout/reset --hard origin/main → merge review → build確認 → push origin main
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
  // pullではなくreset --hardでorigin/mainへ強制同期する。このスクリプトの実行順序上、
  // ローカルmainはこの直後にmergeしてbuild確認後すぐpushする一時的な作業台に過ぎず、
  // 実行間で保持すべきローカル専用コミットは存在しない前提。にもかかわらず、過去に
  // ビルド/push失敗でローカルmainだけがマージ済みのまま取り残されたことがあり、その
  // 状態でorigin/main側が別途進む（例: このファイル自体の修正コミット）とローカルと
  // リモートが分岐し、`git pull`が「reconcile方法未指定」で失敗する事故が起きた。
  // reset --hardなら分岐の有無に関わらず常にorigin/mainへ確実に揃う。
  run('git reset --hard origin/main');
} catch (e) {
  fail(`main checkout/reset失敗: ${(e.stderr || e.message).toString().slice(-400)}`);
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
