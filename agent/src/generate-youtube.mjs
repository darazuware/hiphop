#!/usr/bin/env node
/**
 * generate-youtube.mjs
 * Usage: node agent/src/generate-youtube.mjs <slug>
 *
 * 1. .astroからLyricsBlock eng/jpnを抽出
 * 2. yt-dlpで音源DL（キャッシュ有）＋VTT字幕取得
 * 3. VTTでタイムスタンプ同期
 * 4. ffmpegで横型動画（1920x1080）生成
 *    - 背景: ぼかしアルバムアート
 *    - 中央上部: アルバムアート（600x600）
 *    - 下部字幕: 英語（白）+ 日本語（ゴールド）
 * 5. public/videos/{slug}.mp4 に出力
 */

import fs from "fs";
import path from "path";
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith("-"));
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  if (i !== -1) return args[i + 1];
  const kv = args.find(a => a.startsWith(`--${name}=`));
  return kv?.split("=")[1];
}
const offsetSec = parseFloat(getArg("offset") || "0"); // 字幕を早める場合は負の値

if (!slug) {
  console.error("Usage: node agent/src/generate-youtube.mjs <slug> [--offset <sec>]");
  process.exit(1);
}

// ── paths ─────────────────────────────────────────────────────────────────────
const astroFile = path.join(ROOT, "src/pages/songs", `${slug}.astro`);
const coverFile = path.join(ROOT, "public/images/covers", `${slug}.jpg`);
const tempDir   = path.join(__dirname, "../temp");
const outputDir = path.join(ROOT, "public/videos");

fs.mkdirSync(tempDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(astroFile)) { console.error(`Not found: ${astroFile}`); process.exit(1); }
if (!fs.existsSync(coverFile)) { console.error(`No cover: ${coverFile}`); process.exit(1); }

// ── parse .astro ──────────────────────────────────────────────────────────────
const content = fs.readFileSync(astroFile, "utf-8");

const ytMatch = content.match(/youtubeId=["']([^"']+)["']/);
if (!ytMatch) { console.error("youtubeId not found"); process.exit(1); }
const youtubeId = ytMatch[1];

function cleanText(text) {
  let t = text;
  t = t.replace(/<QuickSlang[^>]*word="([^"]+)"[^>]*>[\s\S]*?<\/QuickSlang>/gi, "$1");
  t = t.replace(/<QuickSlang[^>]*word="([^"]+)"[^>]*\/>/gi, "$1");
  t = t.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
  return t.split("\n").map(l => l.trim()).filter(Boolean).join("\n");
}

const linePairs = [];
const blockRe = /<LyricsBlock[\s\S]*?>([\s\S]*?)<\/LyricsBlock>/g;
let m;
while ((m = blockRe.exec(content)) !== null) {
  const inner = m[1];
  const eng = inner.match(/<Fragment slot="eng">([\s\S]*?)<\/Fragment>/)?.[1];
  const jpn = inner.match(/<Fragment slot="jpn">([\s\S]*?)<\/Fragment>/)?.[1];
  if (eng && jpn) {
    const eLines = cleanText(eng).split("\n");
    const jLines = cleanText(jpn).split("\n");
    const len = Math.min(eLines.length, jLines.length);
    for (let i = 0; i < len; i++) linePairs.push({ eng: eLines[i], jpn: jLines[i] });
  }
}
console.log(`[parse] ${linePairs.length} line pairs`);
if (!linePairs.length) { console.error("No LyricsBlock found"); process.exit(1); }

// ── download audio ────────────────────────────────────────────────────────────
const audioFile = path.join(tempDir, `audio-${youtubeId}.mp3`);
if (!fs.existsSync(audioFile)) {
  console.log("[yt-dlp] Downloading audio...");
  execSync(
    `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${audioFile}" "https://www.youtube.com/watch?v=${youtubeId}"`,
    { stdio: "inherit" }
  );
} else {
  console.log("[yt-dlp] Audio cache hit");
}

const totalDuration = parseFloat(
  execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioFile}"`).toString().trim()
);
console.log(`[audio] duration=${totalDuration.toFixed(1)}s`);

// ── download VTT subtitles ────────────────────────────────────────────────────
const vttBase = path.join(tempDir, `sub-${youtubeId}`);
const vttFile = `${vttBase}.en.vtt`;

if (!fs.existsSync(vttFile)) {
  console.log("[yt-dlp] Downloading subtitles...");
  spawnSync("yt-dlp", [
    "--write-auto-subs", "--write-subs", "--sub-langs", "en",
    "--skip-download", "-o", vttBase,
    `https://www.youtube.com/watch?v=${youtubeId}`,
  ], { stdio: "pipe" });

  const files = fs.readdirSync(tempDir);
  const found = files.find(f => f.startsWith(`sub-${youtubeId}`) && f.endsWith(".vtt"));
  if (found && path.join(tempDir, found) !== vttFile) {
    fs.renameSync(path.join(tempDir, found), vttFile);
  }
}
const hasVtt = fs.existsSync(vttFile);
console.log(`[vtt] ${hasVtt ? vttFile : "not found, timing will be estimated"}`);

// ── VTT alignment ─────────────────────────────────────────────────────────────
function secToTs(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${s.toFixed(3).padStart(6,"0")}`;
}

// YouTubeのローリングキャプション（2行同時表示）を1行ずつに分割
// 各ブロックの時間を行数で等分割し、個別エントリとして扱う
function parseVtt(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const blocks = raw.split(/\n\s*\n/);
  const items = [];
  const timeRe = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/;
  for (const block of blocks) {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    let tMatch = lines[0].match(timeRe);
    let textIdx = 1;
    if (!tMatch && lines.length > 2) { tMatch = lines[1].match(timeRe); textIdx = 2; }
    if (tMatch) {
      const startSec = toSec(tMatch[1]);
      const endSec   = toSec(tMatch[2]);
      const textLines = lines.slice(textIdx).map(l => l.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
      if (!textLines.length) continue;
      const slotDur = (endSec - startSec) / textLines.length;
      for (let i = 0; i < textLines.length; i++) {
        items.push({
          start: secToTs(startSec + i * slotDur),
          end:   secToTs(startSec + (i + 1) * slotDur),
          text:  textLines[i],
        });
      }
    }
  }
  return items;
}

function toSec(t) {
  const p = t.split(":");
  return parseInt(p[0]) * 3600 + parseInt(p[1]) * 60 + parseFloat(p[2]);
}

function addSec(t, s) {
  let sec = toSec(t) + s;
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:${ss.toFixed(3).padStart(6,"0")}`;
}

function similarity(a, b) {
  const wa = new Set(a.toLowerCase().replace(/[^a-z0-9'\s]/g, "").split(/\s+/).filter(Boolean));
  const wb = new Set(b.toLowerCase().replace(/[^a-z0-9'\s]/g, "").split(/\s+/).filter(Boolean));
  if (!wa.size || !wb.size) return 0;
  let n = 0;
  for (const w of wa) if (wb.has(w)) n++;
  return n / Math.max(wa.size, wb.size);
}

function alignLyrics(pairs, vttItems) {
  if (!vttItems.length) {
    let cur = "00:00:05.000";
    return pairs.map(p => {
      const start = cur;
      const dur = Math.max(3, Math.ceil(p.eng.length * 0.1));
      const end = addSec(start, dur);
      cur = end;
      return { start, end, eng: p.eng, jpn: p.jpn, estimated: true };
    });
  }

  const aligned = [];
  let vttIdx = 0;
  const usedVtt = new Set(); // 各VTTエントリは1回のみマッチ
  let minNextSec = 0; // タイムスタンプの単調増加を保証

  for (const pair of pairs) {
    let bestIdx = -1, bestSim = 0.15;
    const lo = Math.max(0, vttIdx - 2);
    const hi = Math.min(vttItems.length, vttIdx + 20);
    for (let j = lo; j < hi; j++) {
      if (usedVtt.has(j)) continue;
      if (toSec(vttItems[j].start) < minNextSec) continue; // 時間逆行を防止
      const s = similarity(pair.eng, vttItems[j].text);
      if (s > bestSim) { bestSim = s; bestIdx = j; }
    }

    // 大幅な時間的前進を抑制: ベストが現在位置より4つ以上先なら
    // 近傍（現在位置から4つ以内）に閾値0.3以上のマッチがあれば優先
    if (bestIdx !== -1 && bestIdx > vttIdx + 3) {
      for (let j = vttIdx; j < Math.min(vttItems.length, vttIdx + 4); j++) {
        if (usedVtt.has(j)) continue;
        if (toSec(vttItems[j].start) < minNextSec) continue;
        const s = similarity(pair.eng, vttItems[j].text);
        if (s >= 0.3) { bestIdx = j; break; }
      }
    }

    if (bestIdx !== -1) {
      usedVtt.add(bestIdx);
      vttIdx = bestIdx;
      minNextSec = toSec(vttItems[vttIdx].start); // 次の検索の最小時刻を更新
      aligned.push({ start: vttItems[vttIdx].start, end: vttItems[vttIdx].end, eng: pair.eng, jpn: pair.jpn });
      vttIdx++;
    } else {
      const prev = aligned[aligned.length - 1];
      const start = prev ? prev.end : "00:00:00.000";
      aligned.push({ start, end: addSec(start, Math.max(3, Math.ceil(pair.eng.length * 0.1))), eng: pair.eng, jpn: pair.jpn, estimated: true });
    }
  }

  // オーバーラップ修正（同一startの場合も等分割）
  for (let i = 0; i < aligned.length - 1; i++) {
    const s0 = toSec(aligned[i].start);
    const e0 = toSec(aligned[i].end);
    const s1 = toSec(aligned[i + 1].start);
    if (s0 === s1) {
      const windowEnd = Math.max(e0, toSec(aligned[i + 1].end));
      const mid = s0 + (windowEnd - s0) / 2;
      aligned[i].end = addSec(aligned[i].start, mid - s0);
      aligned[i + 1].start = aligned[i].end;
    } else if (e0 > s1) {
      aligned[i].end = aligned[i + 1].start;
    }
  }

  const synced = aligned.filter(b => !b.estimated).length;
  console.log(`[align] ${synced}/${pairs.length} synced`);
  return aligned;
}

const vttItems = hasVtt ? parseVtt(vttFile) : [];
const aligned  = alignLyrics(linePairs, vttItems);

// ── generate ASS (1920x1080) ──────────────────────────────────────────────────
function wrapEng(text, max = 55) {
  const t = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const words = t.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= max) { cur = (cur + " " + w).trim(); }
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.join("\\N");
}

function wrapJpn(text, max = 20) {
  const t = text.replace(/\n/g, "").replace(/,/g, "，").trim();
  if (t.length <= max) return t;
  const lines = [];
  let rem = t;
  while (rem.length > max) {
    let at = -1;
    for (let i = Math.min(max, rem.length - 1); i >= Math.floor(max * 0.5); i--) {
      if ("。、！？ 　".includes(rem[i])) { at = i + 1; break; }
    }
    if (at === -1) at = max;
    lines.push(rem.slice(0, at).trim());
    rem = rem.slice(at).trim();
  }
  if (rem) lines.push(rem);
  return lines.join("\\N");
}

function assTime(sec) {
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(min).padStart(2,"0")}:${s.toFixed(2).padStart(5,"0")}`;
}

const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Eng,Helvetica Neue,58,&H00FFFFFF,&H000000FF,&H00000000,&HAA000000,-1,0,0,0,100,100,0,0,1,4,2,2,80,80,140,1
Style: Jpn,Hiragino Sans W3,44,&H0000D7FF,&H000000FF,&H00000000,&HAA000000,-1,0,0,0,100,100,0,0,1,3,1,2,80,80,56,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

let events = "";
for (const b of aligned) {
  const s0 = Math.max(0, toSec(b.start) + offsetSec);
  const s1 = Math.min(toSec(b.end) + offsetSec, totalDuration - 0.05);
  if (s1 <= s0 || s1 <= 0) continue;
  events += `Dialogue: 0,${assTime(s0)},${assTime(s1)},Eng,,0,0,0,,${wrapEng(b.eng)}\n`;
  events += `Dialogue: 0,${assTime(s0)},${assTime(s1)},Jpn,,0,0,0,,${wrapJpn(b.jpn)}\n`;
}

const assFile = path.join(tempDir, `yt-${slug}.ass`);
fs.writeFileSync(assFile, assHeader + events);
console.log(`[ass] ${assFile}`);

// ── ffmpeg: 1920x1080 video ───────────────────────────────────────────────────
// Layout:
//   背景: ぼかしアルバムアート（1920x1080）
//   アルバムアート: 600x600 中央上部 (y=60)
//   字幕: 下部 Eng MarginV=140, Jpn MarginV=56

const tmpVideo  = path.join(tempDir, `yt-base-${slug}.mp4`);
const outputFile = path.join(outputDir, `${slug}.mp4`);

const filter1 = [
  "[0:v]split=2[in_bg][in_art]",
  "[in_bg]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=30:30,colorchannelmixer=rr=0.25:gg=0.25:bb=0.25[bg]",
  "[in_art]scale=600:600[art]",
  "[bg][art]overlay=(W-w)/2:60[out]",
].join(";");

console.log("[ffmpeg] Step 1: building base video...");
let r = spawnSync("ffmpeg", [
  "-y",
  "-loop", "1", "-i", coverFile,
  "-i", audioFile,
  "-t", String(totalDuration),
  "-filter_complex", filter1,
  "-map", "[out]", "-map", "1:a",
  "-c:v", "libx264", "-preset", "fast", "-crf", "22",
  "-c:a", "aac", "-b:a", "192k",
  "-shortest", "-movflags", "+faststart", "-r", "30",
  tmpVideo,
], { stdio: "inherit" });
if (r.status !== 0) { console.error("Step 1 failed"); process.exit(1); }

console.log("[ffmpeg] Step 2: burning subtitles...");
r = spawnSync("ffmpeg", [
  "-y",
  "-i", tmpVideo,
  "-vf", `ass=${assFile}`,
  "-c:v", "libx264", "-preset", "fast", "-crf", "22",
  "-c:a", "copy",
  "-movflags", "+faststart", "-r", "30",
  outputFile,
], { stdio: "inherit" });
if (r.status !== 0) { console.error("Step 2 failed"); process.exit(1); }

console.log(`\n✅ Done: ${outputFile}`);
