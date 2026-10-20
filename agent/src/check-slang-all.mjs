import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

// 語ページの事実ガード一括実行。入口: node agent/src/check-slang-all.mjs
// 1) 構造・量・文体  2) 歌詞引用・曲名・統計をコーパスと照合  3) 年の記述を出典本文と照合
const corpus = [process.env.CORPUS, 'agent/corpus', '../hiphop/agent/corpus', '/Users/ktamatzmoto/Desktop/hiphop/agent/corpus'].find(p => p && fs.existsSync(p));
const steps = [
  ['構造・量・文体', ['agent/src/check-slang-page.mjs']],
  ['歌詞引用・統計の照合', corpus ? ['agent/src/check-slang-facts.mjs', '--corpus', corpus] : null],
  ['年の出典照合', ['agent/src/check-slang-sources.mjs']]
];
let fail = 0;
for (const [name, cmd] of steps) {
  if (!cmd) { console.log(`❌ ${name}: コーパスが見つかりません（CORPUS=パス で指定）`); fail++; continue; }
  const r = spawnSync('node', cmd, { encoding: 'utf8' });
  const lines = (r.stdout || '').split('\n').filter(l => !l.startsWith('✅') && l.trim());
  console.log(`${r.status === 0 ? '✅' : '❌'} ${name}`);
  if (r.status !== 0) { fail++; console.log(lines.slice(0, 30).map(l => '   ' + l).join('\n')); }
}
process.exit(fail ? 1 : 0);
