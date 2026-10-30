#!/usr/bin/env node
/**
 * reviewへの安全なpush（fetch → rebase → build → push origin HEAD:review）
 * どのworktreeからでも実行可。コミット済みの変更を origin/review の先頭へ載せ替えてpushする。
 * Usage: node agent/src/review-push.mjs [--no-build]
 */
import { execSync } from 'node:child_process';

const run = (c) => execSync(c, { stdio: 'inherit' });
const out = (c) => execSync(c, { encoding: 'utf8' }).trim();
const fail = (m) => { console.error(`❌ ${m}`); process.exit(1); };

if (out('git status --porcelain --untracked-files=no')) fail('未コミットの変更があります。先にcommitしてください');
run('git fetch origin review');
try { run('git rebase origin/review'); } catch { run('git rebase --abort'); fail('rebaseでコンフリクト。手動で解消してください'); }
if (!process.argv.includes('--no-build')) {
  try { run('npm run build'); } catch { fail('buildに失敗。pushしません'); }
}
run('git push origin HEAD:review');
const branch = out('git rev-parse --abbrev-ref HEAD');
if (branch === 'review') run('git branch --set-upstream-to=origin/review review');
console.log('✅ review へpush完了');
