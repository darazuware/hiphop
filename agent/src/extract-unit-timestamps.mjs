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
 * units.json: [{ "id":"lo-goose", "anchor":["rockin","the","gold","tooth"],
 *                "fallbackT": 37, "manualSec": null }]
 *
 * ── 秒数の二層構造（whisperSec / manualSec）──────────────────────────────
 * whisper は外す。とくに大人数・whisper地獄の曲ではアンカーを取り違える。
 * そこで各ユニットの秒数を「自動(whisper)」と「実測(manual)」の二層で持つ:
 *   - whisperSec : whisper単語アライメントで得た album相対秒（自動・概算）
 *   - manualSec  : 運営者が実機(PV)で測った実測秒（PV絶対秒・最優先）
 * 最終表示値 t は manualSec があればそれを、無ければ whisper(→PV補正後)、
 * それも無ければ fallbackT を使う。manualSec は offset補正を受けない（PV絶対秒）。
 *   t = manualSec ?? (whisperSec!=null ? whisperSec - offset : null) ?? fallbackT
 * source = "manual" | "whisper" | "fallback" | "none"（manual以外は approx扱い）
 *
 * ── PVオフセット補正（whisper値のみ対象）────────────────────────────────
 * whisper は album音源（曲頭=0s）を解析するため出力は album相対時間。記事の
 * 頭出しリンク先＝公式PVはイントロぶん遅いので、PVが album より N秒遅いなら
 * --offset -N（マイナス）で N秒ぶん前に出す。manualSec/fallbackT は補正しない。
 *
 * ── 実測上書きの運用 ─────────────────────────────────────────────────────
 * 生成時は whisperSec を入れておき、運営者が実機確認後に主要ユニットの実測秒を
 * 渡したら set-manual-timestamp.mjs で manualSec に焼く（docs/timestamp-override.md）。
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

  // whisperSec: 自動アライメントの album相対秒（マッチ score>=0.5 のときのみ）
  let whisperSec = null;
  if (bestScore >= 0.5 && bestIdx >= 0) {
    whisperSec = Math.round(tokens[bestIdx].startSec * 10) / 10;
    wIdx = bestIdx + 1;
  }

  const manualSec = (u.manualSec != null) ? u.manualSec : null;
  const fallbackT = (u.fallbackT != null) ? u.fallbackT : null;
  const pvWhisper = whisperSec != null ? Math.round(Math.max(0, whisperSec - offset) * 10) / 10 : null;

  let t, source;
  if (manualSec != null)      { t = manualSec;  source = "manual"; }
  else if (pvWhisper != null) { t = pvWhisper;  source = "whisper"; }
  else if (fallbackT != null) { t = fallbackT;  source = "fallback"; }
  else                        { t = null;       source = "none"; }

  results.push({
    id: u.id,
    whisperSec,                 // album相対・自動（参考値）
    manualSec,                  // PV実測・最優先（null=未実測）
    fallbackT,                  // 手動推定（whisper外し時の保険）
    t,                          // 最終表示秒（manual優先）
    source,                     // 採用ソース
    approx: source !== "manual",
    score: Math.round(bestScore * 100) / 100,
  });
}

fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

// ── レポート（歌詞テキストなし）───────────────────────────────────────────
console.log(`[tokens] ${tokens.length}  [span] 0~${(tokens[tokens.length-1]?.startSec||0).toFixed(0)}s  [offset] ${offset}s`);
for (const r of results) {
  const mm = r.t == null ? " --:-- " : `${String(Math.floor(r.t/60)).padStart(2,"0")}:${String(Math.floor(r.t%60)).padStart(2,"0")}`;
  const icon = r.source === "manual" ? "🔧" : r.source === "whisper" ? "✅" : r.source === "fallback" ? "🛟" : "❌";
  console.log(`  ${icon} ${r.id.padEnd(24)} t=${r.t==null?"null":r.t+"s"} (${mm}) src=${r.source.padEnd(8)} whisper=${r.whisperSec==null?"-":r.whisperSec+"s"} score=${r.score}`);
}
const aligned = results.filter(r => r.source !== "none").length;
const lowConf = results.filter(r => r.source === "whisper" && r.score < 0.75).length;
console.log(`[done] ${aligned}/${results.length} units have a timestamp (${results.filter(r=>r.source==="manual").length} manual, ${results.filter(r=>r.source==="whisper").length} whisper, ${results.filter(r=>r.source==="fallback").length} fallback)`);
if (lowConf) console.log(`[warn] ${lowConf} whisper unit(s) below score 0.75 — likely off, verify on PV and set manualSec`);
process.exit(aligned === results.length ? 0 : 1);
