#!/usr/bin/env node
/**
 * units.json から units-timestamps.json を決定的に生成する（whisper/音源DL不使用）。
 *
 * 2026-07-03確定方針: 新規曲の頭出し秒数はAI音源解析を使わない。
 * 生成時は units.json の fallbackT（隣接ユニットからの線形補間・1行≈2.5〜3秒の概算）を
 * そのまま t に使い、正確な秒数は運営者がプレビュー実測で指示したものを
 * set-manual-timestamp.mjs で manualSec に焼く（docs/timestamp-override.md）。
 * units.json に manualSec が既に入っていれば最優先で採用する（再生成しても実測が消えない）。
 *
 * Usage:
 *   node agent/src/gen-fallback-timestamps.mjs --slug {slug}
 */
import fs from "fs";

function getArg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const slug = getArg("slug");
if (!slug) { console.error("Usage: node agent/src/gen-fallback-timestamps.mjs --slug <slug>"); process.exit(1); }

const unitsPath = `agent/${slug}/assets/units.json`;
const outPath = `agent/${slug}/assets/units-timestamps.json`;

if (!fs.existsSync(unitsPath)) { console.error(`[ts-fallback] ${unitsPath} が無い`); process.exit(2); }
const units = JSON.parse(fs.readFileSync(unitsPath, "utf8"));

// 既存の units-timestamps.json に whisperSec/manualSec があれば保持する（過去曲の資産を壊さない）
const prev = fs.existsSync(outPath)
  ? Object.fromEntries(JSON.parse(fs.readFileSync(outPath, "utf8")).map((r) => [r.id, r]))
  : {};

const results = units.map((u) => {
  const old = prev[u.id] || {};
  const manualSec = u.manualSec ?? old.manualSec ?? null;
  const whisperSec = old.whisperSec ?? null;
  const fallbackT = u.fallbackT ?? old.fallbackT ?? null;
  let t, source;
  if (manualSec != null)       { t = manualSec;  source = "manual"; }
  else if (old.source === "whisper" && old.t != null) { t = old.t; source = "whisper"; }
  else if (fallbackT != null)  { t = fallbackT;  source = "fallback"; }
  else                         { t = null;       source = "none"; }
  return {
    id: u.id,
    whisperSec,
    manualSec,
    fallbackT,
    t,
    source,
    approx: source !== "manual",
    score: old.score ?? null,
  };
});

fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

for (const r of results) {
  const mm = r.t == null ? " --:-- " : `${String(Math.floor(r.t / 60)).padStart(2, "0")}:${String(Math.floor(r.t % 60)).padStart(2, "0")}`;
  const icon = r.source === "manual" ? "🔧" : r.source === "whisper" ? "♻️" : r.source === "fallback" ? "🛟" : "❌";
  console.log(`  ${icon} ${r.id.padEnd(24)} t=${r.t == null ? "null" : r.t + "s"} (${mm}) src=${r.source}`);
}
const missing = results.filter((r) => r.source === "none").length;
console.log(`[ts-fallback] ${slug}: ${results.length - missing}/${results.length} units → ${outPath}`);
if (missing) console.log(`[warn] fallbackT未設定のユニットが${missing}件（units.jsonにfallbackTを入れる）`);
process.exit(missing ? 1 : 0);
