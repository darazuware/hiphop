#!/usr/bin/env node
/**
 * 運営者が実機(PV)で測った実測秒を manualSec に焼く。whisper を再実行しない。
 * units.json と units-timestamps.json の両方を更新するので、その後 build すれば
 * 記事の頭出しリンクが実測値（PV絶対秒）に切り替わる。
 *
 * Usage:
 *   node agent/src/set-manual-timestamp.mjs --slug ny-state-of-mind \
 *     crime-side=23 lo-goose=33 g-off=41
 *
 * 引数は `ユニットID=秒` の並び（複数可）。秒は公式PVで実測した絶対秒。
 * manualSec は offset補正を受けない（whisperSec とは別レイヤの最優先値）。
 */
import fs from "fs";

function getArg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const slug = getArg("slug");
if (!slug) { console.error("Usage: --slug <slug> id=sec [id=sec ...]"); process.exit(1); }

const unitsPath = `agent/${slug}/assets/units.json`;
const tsPath = `agent/${slug}/assets/units-timestamps.json`;

const pairs = process.argv
  .filter(a => /^[\w-]+=\d+(\.\d+)?$/.test(a))
  .map(a => { const [id, sec] = a.split("="); return [id, parseFloat(sec)]; });

if (pairs.length === 0) { console.error("実測秒の指定がありません (例: crime-side=23)"); process.exit(1); }
const setMap = Object.fromEntries(pairs);

// units.json に manualSec を保存（永続化）
const units = JSON.parse(fs.readFileSync(unitsPath, "utf8"));
for (const u of units) if (u.id in setMap) u.manualSec = setMap[u.id];
fs.writeFileSync(unitsPath, JSON.stringify(units, null, 2));

// units-timestamps.json を即時更新（rebuild なしでも値が正）
const ts = JSON.parse(fs.readFileSync(tsPath, "utf8"));
let applied = 0, missing = [];
for (const r of ts) {
  if (r.id in setMap) {
    r.manualSec = setMap[r.id];
    r.t = setMap[r.id];
    r.source = "manual";
    r.approx = false;
    applied++;
  }
}
const known = new Set(ts.map(r => r.id));
for (const id of Object.keys(setMap)) if (!known.has(id)) missing.push(id);
fs.writeFileSync(tsPath, JSON.stringify(ts, null, 2));

console.log(`[set-manual] ${slug}: applied ${applied} manualSec → ${tsPath}`);
for (const [id, sec] of pairs) {
  const mm = `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(Math.floor(sec%60)).padStart(2,"0")}`;
  console.log(`  🔧 ${id.padEnd(24)} manualSec=${sec}s (${mm})`);
}
if (missing.length) console.log(`[warn] unknown unit id(s): ${missing.join(", ")}`);
console.log("→ npm run build で記事に反映");
