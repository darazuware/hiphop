#!/usr/bin/env node
/**
 * generate-short.mjs
 * Usage: node agent/src/generate-short.mjs --slug <slug> [--duration 60] [--start 0]
 *
 * Flow:
 *  1. .astroからLyricsBlock eng/jpnを抽出
 *  2. youtubeIdからyt-dlpで音源ダウンロード（キャッシュ有）
 *  3. ffmpegで縦型動画（1080x1920）生成
 *     - 背景: ぼかしたアルバムアート
 *     - 中央: アルバムアート
 *     - 字幕: 英語（白）+ 日本語翻訳（ゴールド）
 *  4. public/shorts/{slug}.mp4 に出力
 */

import fs from "fs";
import path from "path";
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";

process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ── args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  if (i !== -1) return args[i + 1];
  const kv = args.find((a) => a.startsWith(`--${name}=`));
  return kv?.split("=")[1];
}

const slug = getArg("slug");
const maxDuration = parseFloat(getArg("duration") || "60");
const startSec = parseFloat(getArg("start") || "0");
const offsetSec = parseFloat(getArg("offset") || "0"); // 字幕タイムスタンプを一括シフト

if (!slug) {
  console.error("Usage: node generate-short.mjs --slug <slug> [--duration 60] [--start 0]");
  process.exit(1);
}

// ── paths ─────────────────────────────────────────────────────────────────────
const astroFile = path.join(ROOT, "src/pages/songs", `${slug}.astro`);
const coverFile = path.join(ROOT, "public/images/covers", `${slug}.jpg`);
const audioDir = path.join(__dirname, "../audio");
const outputDir = path.join(ROOT, "public/shorts");
const audioFile = path.join(audioDir, `${slug}.mp3`);
const assFile = `/tmp/short_sub.ass`;
let outputFile = path.join(outputDir, `${slug}.mp4`);

fs.mkdirSync(audioDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(astroFile)) { console.error(`Not found: ${astroFile}`); process.exit(1); }
if (!fs.existsSync(coverFile)) { console.error(`No cover: ${coverFile}`); process.exit(1); }

// ── parse .astro ──────────────────────────────────────────────────────────────
const content = fs.readFileSync(astroFile, "utf-8");

const ytMatch = content.match(/youtubeId="([^"]+)"/);
if (!ytMatch) { console.error("youtubeId not found in .astro"); process.exit(1); }
const youtubeId = ytMatch[1];

const linePairs = [];
const blockRe = /<LyricsBlock[^>]*>([\s\S]*?)<\/LyricsBlock>/g;
let m;
while ((m = blockRe.exec(content)) !== null) {
  const inner = m[1];
  const eng = inner.match(/<Fragment slot="eng">([\s\S]*?)<\/Fragment>/)?.[1];
  const jpn = inner.match(/<Fragment slot="jpn">([\s\S]*?)<\/Fragment>/)?.[1];
  if (eng && jpn) {
    const splitLines = (s) =>
      s.split(/<br\s*\/?>/i)
        .map(l => l.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
        .filter(l => l.length > 0);
    // engはrawを保持してQuickSlangを抽出してからタグ除去
    const engLinesRaw = eng.split(/<br\s*\/?>/i).filter(l =>
      l.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().length > 0
    );
    const engLines = engLinesRaw.map(l => l.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    const jpnLines = splitLines(jpn);
    const len = Math.min(engLinesRaw.length, jpnLines.length);
    for (let i = 0; i < len; i++) {
      // QuickSlangがあればword：descを説明として使用、なければ空
      const qsMatch = engLinesRaw[i].match(/<QuickSlang[^>]+word="([^"]+)"[^>]+desc="([^"]+)"[^>]*\/?>/);
      const exp = qsMatch ? `${qsMatch[1]}：${qsMatch[2]}`.slice(0, 80) : "";
      linePairs.push({ eng: engLines[i], jpn: jpnLines[i], exp });
    }
  }
}

console.log(`[parse] ${linePairs.length} line pairs`);
if (linePairs.length === 0) { console.error("No LyricsBlock found"); process.exit(1); }

// ── download audio ────────────────────────────────────────────────────────────
if (!fs.existsSync(audioFile)) {
  // 曲名・アーティストをsongs.tsから取得（検索フォールバック用）
  const songsContent = fs.readFileSync(path.join(ROOT, "src/data/songs.ts"), "utf-8");
  const titleM = songsContent.match(new RegExp(`slug: '/songs/${slug}'[^}]*, title: ["']([^"']+)["']`));
  const artistM = songsContent.match(new RegExp(`slug: '/songs/${slug}'[^}]*, artists: ["']([^"']+)["']`));
  const songTitle = titleM?.[1] ?? slug;
  const songArtist = artistM?.[1] ?? "";

  const tryDownload = (url) => {
    try {
      execSync(
        `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${audioFile}" "${url}"`,
        { stdio: "inherit" }
      );
      return true;
    } catch { return false; }
  };

  console.log(`[yt-dlp] Downloading https://youtu.be/${youtubeId} ...`);
  const ok = tryDownload(`https://www.youtube.com/watch?v=${youtubeId}`);

  if (!ok) {
    console.log(`[yt-dlp] Video unavailable. Searching: "${songArtist} ${songTitle}" ...`);
    const query = encodeURIComponent(`${songArtist} ${songTitle} official`);
    const searched = tryDownload(`ytsearch1:${songArtist} ${songTitle} official audio`);
    if (!searched) {
      console.error(`[yt-dlp] 検索でも取得失敗: ${songArtist} - ${songTitle}`);
      process.exit(1);
    }
  }
} else {
  console.log(`[yt-dlp] Cache hit: ${audioFile}`);
}

// ── audio duration ────────────────────────────────────────────────────────────
const totalDuration = parseFloat(
  execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioFile}"`).toString().trim()
);
const shortDuration = Math.min(maxDuration, totalDuration - startSec);
console.log(`[audio] total=${totalDuration.toFixed(1)}s  using=${startSec}s ~ ${(startSec + shortDuration).toFixed(1)}s`);

// ── alignment helpers ─────────────────────────────────────────────────────────
const STOP_WORDS = new Set(["the","a","an","in","on","at","is","are","was","were","i","my","to","of","and","or","but","so","for","with","it","its","this","that","we","you","he","she","they","them","our","your","be","do","did","have","had","not","no","up","out","as","if","by"]);
function normalize(t) { return t.toLowerCase().replace(/[^a-z0-9\s]/g,"").replace(/\s+/g," ").trim(); }
function wordOverlap(a, b) {
  const wa = normalize(a).split(" ").filter(w => w && !STOP_WORDS.has(w));
  const wb = new Set(normalize(b).split(" ").filter(w => w && !STOP_WORDS.has(w)));
  if (!wa.length || !wb.size) return 0;
  return wa.filter(w => wb.has(w)).length / Math.max(wa.length, wb.size);
}
function jaccardOverlap(a, b) {
  const sa = new Set(normalize(a).split(" ").filter(w => w && !STOP_WORDS.has(w)));
  const sb = new Set(normalize(b).split(" ").filter(w => w && !STOP_WORDS.has(w)));
  if (!sa.size || !sb.size) return 0;
  const inter = [...sa].filter(w => sb.has(w)).length;
  return inter / (sa.size + sb.size - inter);
}

// VTT → [{startSec, text}] （YouTubeローリングキャプション対応）
function parseVttRolling(content) {
  const rawCues = [];
  for (const block of content.replace(/\r\n/g,"\n").split("\n\n")) {
    if (!block.includes("-->")) continue;
    const lines = block.split("\n");
    const tl = lines.find(l => l.includes("-->"));
    if (!tl) continue;
    const tm = tl.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
    if (!tm) continue;
    const startSec = +tm[1]*3600 + +tm[2]*60 + +tm[3] + +tm[4]/1000;
    const endSec   = +tm[5]*3600 + +tm[6]*60 + +tm[7] + +tm[8]/1000;
    const textLines = lines.filter(l => l.trim() && !l.includes("-->") && l.trim() !== "WEBVTT" && !/^\d+$/.test(l.trim()))
      .map(l => l.replace(/<[^>]+>/g,"").trim()).filter(Boolean);
    if (textLines.length) rawCues.push({ startSec, endSec, textLines });
  }
  const entries = [];
  for (let i = 0; i < rawCues.length; i++) {
    const { startSec, endSec, textLines } = rawCues[i];
    const prevLast = i > 0 ? rawCues[i-1].textLines[rawCues[i-1].textLines.length-1] : "";
    let firstNew = 0;
    if (prevLast && textLines.length > 1 && wordOverlap(textLines[0], prevLast) >= 0.6) firstNew = 1;
    const newLines = textLines.slice(firstNew);
    if (firstNew === 0 && newLines.length === 2) {
      const mid = (startSec + endSec) / 2;
      entries.push({ startSec, text: newLines[0] });
      entries.push({ startSec: mid, text: newLines[1] });
    } else {
      const text = newLines.join(" ").replace(/\s+/g," ").trim();
      if (text) entries.push({ startSec, text });
    }
  }
  return entries;
}

// VTT → 歌詞ペアアライメント
function alignVtt(pairs, entries, offset, duration) {
  // VTTタイムスタンプをshort開始位置に合わせてオフセット
  const adj = entries.map(e => ({ ...e, startSec: e.startSec - offset }))
    .filter(e => e.startSec >= -1 && e.startSec < duration + 5);
  let vIdx = 0;
  const result = [];
  for (let pIdx = 0; pIdx < pairs.length; pIdx++) {
    let best = { score: 0, idx: -1 };
    for (let i = vIdx; i < Math.min(vIdx+5, adj.length); i++) {
      const s = jaccardOverlap(pairs[pIdx].eng, adj[i].text);
      if (s > best.score) best = { score: s, idx: i };
    }
    if (best.score < 0.12 || best.idx < 0) continue;
    result.push({ ...pairs[pIdx], _startSec: Math.max(0, adj[best.idx].startSec) });
    vIdx = best.idx + 1;
  }
  return toTimedPairs(result, duration);
}

// Whisper → 歌詞ペアアライメント
function alignWhisper(pairs, segs, duration) {
  const result = [];
  let pairIdx = 0;
  for (const seg of segs) {
    if (seg.startSec >= duration || pairIdx >= pairs.length) break;
    let best = { score: 0, offset: 0 };
    for (let off = 0; off <= 5 && pairIdx+off < pairs.length; off++) {
      const s = wordOverlap(seg.text, pairs[pairIdx+off].eng);
      if (s > best.score) best = { score: s, offset: off };
    }
    if (best.score >= 0.15) {
      pairIdx += best.offset;
      result.push({ ...pairs[pairIdx], _startSec: seg.startSec });
      pairIdx++;
    }
  }
  return toTimedPairs(result, duration);
}

// 均等配分フォールバック
function alignEven(pairs, duration) {
  const n = Math.min(pairs.length, Math.floor(duration / 2.5));
  const sec = duration / n;
  return pairs.slice(0, n).map((p, i) => ({ ...p, start: i*sec, end: (i+1)*sec - 0.15 }));
}

// _startSec → start/end 変換
function toTimedPairs(result, duration) {
  const out = [];
  for (let i = 0; i < result.length; i++) {
    const start = result[i]._startSec;
    const end = i+1 < result.length ? result[i+1]._startSec - 0.1 : Math.min(start+4, duration-0.05);
    if (end > start && start < duration) out.push({ ...result[i], start, end });
  }
  return out;
}

// ── Step 1: VTT（YouTube自動キャプション）────────────────────────────────────
const vttDir = path.join(__dirname, "../temp");
fs.mkdirSync(vttDir, { recursive: true });
const vttFile = path.join(vttDir, `sub-${youtubeId}.en.vtt`);

if (!fs.existsSync(vttFile)) {
  console.log("[vtt] Downloading YouTube captions...");
  try {
    execSync(
      `yt-dlp --write-auto-subs --sub-lang en --sub-format vtt --skip-download -o "${path.join(vttDir,"sub-%(id)s")}" "https://www.youtube.com/watch?v=${youtubeId}"`,
      { stdio: "pipe" }
    );
  } catch (_) {}
}

let usedPairs = [];

if (fs.existsSync(vttFile)) {
  const vttEntries = parseVttRolling(fs.readFileSync(vttFile, "utf-8"));
  console.log(`[vtt] ${vttEntries.length} entries`);
  usedPairs = alignVtt(linePairs, vttEntries, startSec, shortDuration);
  console.log(`[align] ${usedPairs.length}/${linePairs.length} synced (VTT)`);
}

// ── Step 2: Whisper+prompt フォールバック ─────────────────────────────────────
if (usedPairs.length < 8) {
  console.log("[whisper] VTT不足 → Whisper+prompt...");
  const wavFile = `/tmp/short_audio_${slug}.wav`;
  const whisperModel = "/opt/homebrew/share/whisper-cpp/ggml-small.en.bin";

  spawnSync("ffmpeg", ["-y", "-ss", String(startSec), "-i", audioFile,
    "-t", String(shortDuration + 30), "-ar", "16000", "-ac", "1", wavFile], { stdio: "pipe" });

  // 歌詞の最初40語をpromptとして渡す（whisperが正しい語彙に"チューニング"される）
  const promptWords = linePairs.slice(0, 15).map(p => p.eng).join(" ")
    .replace(/[^a-zA-Z0-9 ']/g, "").replace(/\s+/g, " ").trim().split(" ").slice(0, 40).join(" ");

  spawnSync("whisper-cli", [
    "-m", whisperModel, "-f", wavFile,
    "--output-json-full", "--output-file", `/tmp/short_whisper_${slug}`,
    "-t", "8", "--prompt", promptWords,
  ], { stdio: "pipe" });

  const whisperJson = `/tmp/short_whisper_${slug}.json`;
  if (fs.existsSync(whisperJson)) {
    const raw = fs.readFileSync(whisperJson).toString("latin1");
    const data = JSON.parse(raw);
    const segs = (data.transcription || [])
      .map(s => ({ startSec: s.offsets.from/1000, endSec: s.offsets.to/1000, text: s.text.trim() }))
      .filter(s => s.text && !s.text.includes("♪") && !s.text.includes("â") && !s.text.includes("["));
    console.log(`[whisper] ${segs.length} segments`);
    usedPairs = alignWhisper(linePairs, segs, shortDuration);
    console.log(`[align] ${usedPairs.length}/${linePairs.length} synced (Whisper)`);
  }
}

// ── Step 3: 均等配分フォールバック ────────────────────────────────────────────
if (usedPairs.length < 10) {
  console.log("[align] 均等配分フォールバック");
  usedPairs = alignEven(linePairs, shortDuration);
  console.log(`[align] ${usedPairs.length} pairs (even)`);
}
console.log(`[align] ${usedPairs.length} timed pairs (first at ${usedPairs[0]?.start.toFixed(1)}s)`);

// ── generate ASS subtitles ────────────────────────────────────────────────────
function assTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

if (process.env.OUTPUT_FILE) outputFile = process.env.OUTPUT_FILE;

// Layout (1080x1920):
//   [80~760px]    アルバムアート 680x680
//   [790~870px]   英語歌詞 (Alignment=8, MarginV=790)
//   [880~960px]   日本語訳 (Alignment=8, MarginV=880)
//   [1500~1880px] スラング解説ボックス (Alignment=2, MarginV=40)
const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Eng,Impact,52,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,1,0,1,5,2,8,60,60,790,1
Style: Jpn,Hiragino Sans W6,42,&H0000D7FF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,1,8,60,60,885,1
Style: Exp,Hiragino Sans W6,32,&H00FFFFFF,&H000000FF,&H00000000,&HAA000000,-1,0,0,0,100,100,0,0,4,0,0,8,60,60,1430,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

// 日本語を自然な位置で改行する（最大16文字）
function wrapJpn(text, max = 16) {
  const cleanedText = text.replace(/\n/g, "").replace(/,/g, "，").trim();
  if (cleanedText.length <= max) return cleanedText;
  
  const lines = [];
  let remaining = cleanedText;
  while (remaining.length > max) {
    let breakAt = -1;
    // max文字以内で最後の句読点やスペースを探す
    for (let i = Math.min(max, remaining.length - 1); i >= Math.floor(max * 0.5); i--) {
      if ("。、！？ 　".includes(remaining[i])) {
        breakAt = i + 1;
        break;
      }
    }
    // 区切り文字が無ければ max 文字で改行
    if (breakAt === -1) {
      breakAt = max;
    }
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) {
    lines.push(remaining);
  }
  return lines.join("\\N");
}

// 英語を自然な位置で改行する（最大30文字）
function wrapEng(text, max = 30) {
  const cleanedText = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  if (cleanedText.length <= max) return cleanedText;

  const words = cleanedText.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= max) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.join("\\N");
}

// QuickSlangがある行のみ説明を表示（carry-overなし）
let events = "";
usedPairs.forEach((block) => {
  const t0 = assTime(Math.max(0, block.start + offsetSec));
  const t1 = assTime(Math.min(block.end + offsetSec, shortDuration - 0.05));
  const eng = wrapEng(block.eng);
  const jpn = wrapJpn(block.jpn);
  events += `Dialogue: 0,${t0},${t1},Eng,,0,0,0,,${eng}\n`;
  events += `Dialogue: 0,${t0},${t1},Jpn,,0,0,0,,${jpn}\n`;
  if (block.exp) {
    const expWrapped = wrapJpn(block.exp, 26);
    events += `Dialogue: 0,${t0},${t1},Exp,,0,0,0,,${expWrapped}\n`;
  }
});

fs.writeFileSync(assFile, assHeader + events);
console.log(`[ass] Written: ${assFile}`);

// ── ffmpeg: build vertical video ──────────────────────────────────────────────
// Layout (1080x1920):
//   [0~120px] top margin
//   [120~1020px] album art 900x900 centered
//   [1020~1920px] subtitle area (900px)
//     - Eng: bold white, MarginV=220 from bottom
//     - Jpn: gold,       MarginV=80 from bottom

const tmpVideo = `/tmp/short_base.mp4`;

// Step 1: background + album art (no subtitles)
const filter1 = [
  "[0:v]split=2[in_bg][in_art]",
  "[in_bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:30,colorchannelmixer=rr=0.25:gg=0.25:bb=0.25[bg]",
  "[in_art]scale=680:680[art]",
  "[bg][art]overlay=(W-w)/2:80[out]",
].join(";");

console.log("[ffmpeg] Step 1: building base video...");
let r = spawnSync("ffmpeg", [
  "-y",
  "-ss", String(startSec), "-loop", "1", "-i", coverFile,
  "-ss", String(startSec), "-i", audioFile,
  "-t", String(shortDuration),
  "-filter_complex", filter1,
  "-map", "[out]",
  "-map", "1:a",
  "-c:v", "libx264", "-preset", "fast", "-crf", "22",
  "-c:a", "aac", "-b:a", "192k",
  "-shortest", "-movflags", "+faststart", "-r", "30",
  tmpVideo,
], { stdio: "inherit" });
if (r.status !== 0) { console.error("Step 1 failed"); process.exit(1); }

// Step 2: burn subtitles with -vf
console.log("[ffmpeg] Step 2: burning subtitles...");
r = spawnSync("ffmpeg", [
  "-y",
  "-i", tmpVideo,
  "-vf", `ass=${assFile}`,
  "-c:v", "libx264", "-preset", "fast", "-crf", "22",
  "-c:a", "copy",
  "-movflags", "+faststart",
  "-r", "30",
  outputFile,
], { stdio: "inherit" });
if (r.status !== 0) { console.error("Step 2 failed"); process.exit(1); }

console.log(`\n✅ Done: ${outputFile}`);
