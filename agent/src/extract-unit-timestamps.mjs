#!/usr/bin/env node
/**
 * 学習ユニットのアンカー語句を whisper 単語トークンにマッチし、start秒を付与する。
 * 歌詞テキストは出力しない（ユニットID・秒数・マッチ精度のみ）。
 *
 * Usage:
 *   node agent/src/extract-unit-timestamps.mjs --slug cream \
 *     --whisper /tmp/cream_whisper.json --units agent/cream/assets/units.json \
 *     --out agent/cream/assets/units-timestamps.json [--offset 0]
 *
 * units.json: [{ "id": "lo-goose", "anchor": ["rockin","the","gold","tooth"] }, ...]
 *
 * ── PVオフセット補正（標準工程・必須）────────────────────────────────────
 * whisper は album音源（曲頭=0s）を解析するため、出力秒は album相対時間。
 * これを記事の頭出しリンク先＝公式PV(YouTube) の時間に合わせるには、PVの
 * イントロ尺（曲が始まるまでの遅れ）を加算する必要がある。t = startSec - offset
 * なので、PVが album より N秒遅いなら --offset -N（マイナス）で N秒ぶん前に出す。
 * 【標準手順】生成後に主要ユニットのリンクをPVで実地確認し、ズレ幅を測って
 *   --offset を一度入れ直す。±1〜2秒に収まれば確定。歌詞テキストは確認に使わない。
 *   例: cream は album→PV で +5s ズレていたため --offset -5 で確定。
 * fallbackT（手動推定）は offset の影響を受けないので、補正後のPV時間で直接書く。
 */
import fs from "fs";

function getArg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const slug = getArg("slug");
const whisperPath = getArg("whisper", `/tmp/${slug}_whisper.json`);
const unitsPath = getArg("units", `agent/${slug}/assets/units.json`);
const outPath = getArg("out", `agent/${slug}/assets/units-timestamps.json`);
const offset = parseFloat(getArg("offset", "0"));

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9']/g, "");

// ── whisper サブワードトークンを「単語」へ再構成 ──────────────────────────
// whisper-cpp は BPE サブワードを返す。先頭スペース付きトークンが新しい単語の
// 始まり、スペースなしトークンは前の単語に連結。start秒 = 先頭サブワードのoffset。
const data = JSON.parse(fs.readFileSync(whisperPath).toString("latin1"));
const tokens = [];
let cur = null;
const flush = () => { if (cur && cur.text) tokens.push(cur); cur = null; };
for (const seg of (data.transcription || [])) {
  for (const tok of (seg.tokens || [])) {
    const raw = tok.text || "";
    if (raw.includes("[_") || raw.includes("♪") || raw.startsWith("[")) { flush(); continue; }
    const startSec = tok.offsets?.from != null ? tok.offsets.from / 1000 : null;
    const startsWord = /^\s/.test(raw) || cur == null;
    const piece = norm(raw);
    if (startsWord) {
      flush();
      cur = { text: piece, startSec: startSec ?? 0 };
    } else if (cur) {
      cur.text += piece;
    } else {
      cur = { text: piece, startSec: startSec ?? 0 };
    }
  }
  flush();
}

// ── アンカー列マッチ（順方向スキャン、前ユニットの後ろから探す）──────────
const units = JSON.parse(fs.readFileSync(unitsPath, "utf8"));
const results = [];
let wIdx = 0;

for (const u of units) {
  const anchor = u.anchor.map(norm).filter(Boolean);
  let bestIdx = -1, bestScore = 0;
  for (let i = wIdx; i < tokens.length - 1; i++) {
    let matches = 0;
    for (let j = 0; j < anchor.length && i + j < tokens.length; j++) {
      if (tokens[i + j].text === anchor[j]) matches++;
    }
    const score = matches / anchor.length;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
    if (bestScore === 1) break;
  }
  if (bestScore >= 0.5 && bestIdx >= 0) {
    const t = Math.max(0, tokens[bestIdx].startSec - offset);
    results.push({ id: u.id, t: Math.round(t * 10) / 10, score: Math.round(bestScore * 100) / 100, matched: "auto" });
    wIdx = bestIdx + 1;
  } else if (u.fallbackT != null) {
    results.push({ id: u.id, t: u.fallbackT, score: Math.round(bestScore * 100) / 100, matched: "manual" });
  } else {
    results.push({ id: u.id, t: null, score: Math.round(bestScore * 100) / 100, matched: false });
  }
}

fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

// ── レポート（歌詞テキストなし）───────────────────────────────────────────
console.log(`[tokens] ${tokens.length}  [span] 0~${(tokens[tokens.length-1]?.startSec||0).toFixed(0)}s  [offset] ${offset}s`);
for (const r of results) {
  const mm = r.t == null ? " --:-- " : `${String(Math.floor(r.t/60)).padStart(2,"0")}:${String(Math.floor(r.t%60)).padStart(2,"0")}`;
  const icon = r.matched === "auto" ? "✅" : r.matched === "manual" ? "🔧" : "❌";
  console.log(`  ${icon} ${r.id.padEnd(22)} t=${r.t==null?"null":r.t+"s"}  (${mm})  score=${r.score} ${r.matched==="manual"?"[manual]":""}`);
}
const ok = results.filter(r => r.matched).length;
console.log(`[done] ${ok}/${results.length} units aligned → ${outPath}`);
process.exit(ok === results.length ? 0 : 1);
