#!/usr/bin/env node
/**
 * YouTube公式キャプション（timedtext）と units.json の anchor を突き合わせ、
 * 各学習ユニットの頭出し秒数を「埋め込んでいる動画そのもの」から機械的に取る。
 *
 * whisper・音源DL不使用（2026-07-03方針を維持）。yt-dlpで字幕トラックのみ取得する。
 * 手動キャプション（公式MVに多い）があれば優先、無ければ自動字幕にフォールバック。
 * キャプションは動画本体の写しなので、アルバム版にしかないパート（イントロ寸劇等）は
 * NOT_FOUND になる = バージョン違い引用の検出器を兼ねる。
 *
 * Usage:
 *   node agent/src/align-yt-captions.mjs --slug {slug}            # dry-run（提案表のみ）
 *   node agent/src/align-yt-captions.mjs --slug {slug} --apply    # captionSecをunits.jsonに焼く
 *   node agent/src/align-yt-captions.mjs --slug {slug} --video <youtubeId>  # ID手動指定
 *
 * 秒数の優先度（gen-fallback-timestamps.mjs と同期）:
 *   manualSec（運営者実測・最優先） > captionSec（本スクリプト） > fallbackT（線形補間）
 * --apply しても manualSec は一切上書きしない。
 *
 * 【出力安全】歌詞テキスト（anchor・キャプション本文）は絶対に標準出力に出さない。
 * 出すのは unit id・秒数・スコア・カウントのみ（コンテンツフィルター対策）。
 *
 * Exit: 0 = 全unitマッチ / 1 = NOT_FOUNDあり（バージョン違い疑い） / 2 = 前提エラー
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

function getArg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1] : def;
}
const slug = getArg("slug");
const apply = process.argv.includes("--apply");
let videoId = getArg("video");
if (!slug) { console.error("Usage: node agent/src/align-yt-captions.mjs --slug <slug> [--apply] [--video <id>]"); process.exit(2); }

const unitsPath = `agent/${slug}/assets/units.json`;
if (!fs.existsSync(unitsPath)) { console.error(`[align-yt] ${unitsPath} が無い`); process.exit(2); }
const units = JSON.parse(fs.readFileSync(unitsPath, "utf8"));
if (!units.every(u => u.anchor)) { console.error(`[align-yt] anchor未設定のunitがある（units.jsonに各unitのanchor行が必要）`); process.exit(2); }

// youtubeId を .astro から拾う（--video 指定が無い場合）
if (!videoId) {
  const astroPath = `src/pages/songs/${slug}.astro`;
  if (!fs.existsSync(astroPath)) { console.error(`[align-yt] ${astroPath} が無い（--video で指定して）`); process.exit(2); }
  const m = fs.readFileSync(astroPath, "utf8").match(/youtubeId=["']([\w-]{11})["']/);
  if (!m) { console.error(`[align-yt] ${astroPath} に youtubeId が見つからない（--video で指定して）`); process.exit(2); }
  videoId = m[1];
}

// ---- 字幕トラック取得（yt-dlp・動画DLなし） ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ytcap-${slug}-`));
function fetchSubs(autoFlag) {
  const args = ["--skip-download", "--write-subs"];
  if (autoFlag) args.push("--write-auto-subs");
  args.push("--sub-langs", "en.*", "--sub-format", "json3",
    "-o", path.join(tmp, "cap"), `https://www.youtube.com/watch?v=${videoId}`);
  try { execFileSync("yt-dlp", args, { stdio: "pipe", timeout: 60000 }); } catch { /* 字幕なしでも続行 */ }
  return fs.readdirSync(tmp).filter(f => f.endsWith(".json3")).map(f => path.join(tmp, f));
}
let capFiles = fetchSubs(false);
let capSource = "manual";
if (capFiles.length === 0) { capFiles = fetchSubs(true); capSource = "auto"; }
if (capFiles.length === 0) {
  console.log(`[align-yt] ${slug} (${videoId}): 字幕トラックなし → captionSec取得不可。fallbackT/実測運用のまま`);
  process.exit(1);
}

// ---- キャプション → 単語ストリーム [{sec, tok}] ----
const norm = s => s.toLowerCase()
  .replace(/’|'/g, "")            // アポストロフィ除去（rockin' → rockin）
  .replace(/\[[^\]]*\]|\([^)]*\)/g, " ") // [Chorus] 等の注記除去
  .replace(/[^a-z0-9\s]/g, " ")
  .replace(/\s+/g, " ").trim();
const tokMatch = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

const j = JSON.parse(fs.readFileSync(capFiles[0], "utf8"));
const stream = [];
for (const ev of j.events || []) {
  if (!ev.segs) continue;
  for (const seg of ev.segs) {
    const t = (ev.tStartMs + (seg.tOffsetMs || 0)) / 1000;
    for (const w of norm(seg.utf8 || "").split(" ")) if (w) stream.push({ sec: t, tok: w });
  }
}
if (stream.length < 20) { console.log(`[align-yt] 字幕トラックが短すぎる（${stream.length}語）→ 中止`); process.exit(1); }

// ---- 各unit anchorを曲順どおり単調に照合 ----
function matchAnchor(anchor, cursor) {
  // anchor は文字列 or 単語配列の両対応（既存曲のunits.jsonは配列）
  const raw = Array.isArray(anchor) ? anchor.join(" ") : anchor;
  const toks = norm(raw).split(" ").filter(w => w.length > 1).slice(0, 10);
  if (toks.length < 2) return null;
  let best = null;
  // 同じ対句を複数unitで解説するページ構成があるため、直前マッチから30語だけ
  // 後戻りを許す（フックの反復は30語より遠いので誤マッチしない）
  for (let i = Math.max(0, cursor - 30); i < stream.length; i++) {
    // anchor先頭2語のどちらかで開始を許可（先頭語がYo等で欠ける場合の保険）
    const startAt = tokMatch(stream[i].tok, toks[0]) ? 0 : tokMatch(stream[i].tok, toks[1]) ? 1 : -1;
    if (startAt < 0) continue;
    let matched = 1, si = i + 1, ti = startAt + 1;
    while (ti < toks.length && si < Math.min(i + 25, stream.length)) {
      if (tokMatch(stream[si].tok, toks[ti])) { matched++; ti++; }
      si++;
    }
    const ratio = matched / toks.length;
    if (ratio >= 0.75) return { sec: Math.floor(stream[i].sec), idx: i, score: ratio };
    if (!best || ratio > best.score) best = { sec: Math.floor(stream[i].sec), idx: i, score: ratio };
  }
  if (best && best.score >= 0.55) return best;
  return { notFound: true, bestScore: best?.score ?? 0 };
}

let cursor = 0, notFound = [], rows = [];
for (const u of units) {
  if (u.mvAbsent) { rows.push({ id: u.id, captionSec: null, score: 0, mvAbsent: true }); continue; }
  const hit = matchAnchor(u.anchor, cursor);
  if (hit && !hit.notFound) {
    cursor = Math.max(cursor, hit.idx); // 前進のみ（後戻り探索はmatchAnchor内の30語窓で許可）
    rows.push({ id: u.id, captionSec: hit.sec, score: hit.score });
  } else {
    notFound.push(u.id);
    rows.push({ id: u.id, captionSec: null, score: hit?.bestScore ?? 0 });
  }
}

// ---- レポート（歌詞は出さない・idと秒のみ） ----
const tsPath = `agent/${slug}/assets/units-timestamps.json`;
const prevTs = fs.existsSync(tsPath)
  ? Object.fromEntries(JSON.parse(fs.readFileSync(tsPath, "utf8")).map(r => [r.id, r])) : {};
console.log(`[align-yt] ${slug} video=${videoId} captions=${capSource} units=${units.length}`);
for (const r of rows) {
  const cur = prevTs[r.id]?.t;
  if (r.mvAbsent) { console.log(`  🚫 ${r.id.padEnd(24)} mvAbsent（MV未収録として登録済み・照合スキップ）`); continue; }
  if (r.captionSec == null) { console.log(`  ❌ ${r.id.padEnd(24)} NOT_FOUND bestScore=${r.score.toFixed(2)}（動画に該当パートなし＝バージョン違い/クリーン版改変/表記差の疑い）`); continue; }
  const diff = cur != null ? (r.captionSec - cur >= 0 ? "+" : "") + (r.captionSec - cur) : "-";
  const mm = `${Math.floor(r.captionSec / 60)}:${String(r.captionSec % 60).padStart(2, "0")}`;
  console.log(`  ✅ ${r.id.padEnd(24)} captionSec=${String(r.captionSec).padStart(3)}s (${mm}) 現行t=${cur ?? "null"} 差=${diff} score=${r.score.toFixed(2)}`);
}
if (notFound.length) console.log(`[warn] NOT_FOUND ${notFound.length}件: ${notFound.join(", ")} → 動画バージョンと引用の食い違いを確認`);

if (apply) {
  for (const u of units) {
    const r = rows.find(x => x.id === u.id);
    u.captionSec = r?.captionSec ?? null;
  }
  fs.writeFileSync(unitsPath, JSON.stringify(units, null, 2));
  execFileSync("node", ["agent/src/gen-fallback-timestamps.mjs", "--slug", slug], { stdio: "inherit" });
  console.log(`[align-yt] applied → ${unitsPath}（manualSecは温存・buildで反映）`);
} else {
  console.log(`[align-yt] dry-run（--apply でcaptionSecを焼く）`);
}
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(notFound.length ? 1 : 0);
