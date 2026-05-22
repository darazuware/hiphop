#!/usr/bin/env node
/**
 * generate-youtube.mjs
 * Usage: node agent/src/generate-youtube.mjs <slug>
 *
 * 1. .astroからLyricsBlock eng/jpnを抽出
 * 2. yt-dlpで音源DL（キャッシュ有）＋VTTキャプション取得
 * 3. VTT（ローリングキャプション対応）で歌詞ペアとタイムスタンプを同期
 *    （VTT不可の場合はWhisperフォールバック）
 * 4. ffmpegで横型動画（1920x1080）生成
 *    - 背景: ぼかしアルバムアート
 *    - 中央上部: アルバムアート（800x800）
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

if (!slug) {
  console.error("Usage: node agent/src/generate-youtube.mjs <slug>");
  process.exit(1);
}

// ── paths ─────────────────────────────────────────────────────────────────────
const astroFile   = path.join(ROOT, "src/pages/songs", `${slug}.astro`);
const coverFile   = path.join(ROOT, "public/images/covers", `${slug}.jpg`);
const audioDir    = path.join(__dirname, "../audio");
const tempDir     = path.join(__dirname, "../temp");
const outputDir   = path.join(ROOT, "public/videos");
const audioFile   = path.join(audioDir, `${slug}.mp3`);
const outputFile  = path.join(outputDir, `${slug}.mp4`);
const wavFile     = `/tmp/yt_audio_${slug}.wav`;
const whisperJson = `/tmp/yt_whisper_${slug}`;
const assFile     = path.join(tempDir, `yt-${slug}.ass`);
const tmpVideo    = `/tmp/yt_base_${slug}.mp4`;
const whisperModel = "/opt/homebrew/share/whisper-cpp/ggml-small.en.bin";

fs.mkdirSync(audioDir, { recursive: true });
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

// ── common: word overlap ──────────────────────────────────────────────────────
const STOP_WORDS = new Set(["the","a","an","in","on","at","is","are","was","were","i","my","to","of","and","or","but","so","for","with","it","its","this","that","we","you","he","she","they","them","our","your","be","do","did","have","had","not","no","up","out","as","if","by"]);
function normalize(t) {
  return t.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}
function wordOverlap(a, b) {
  const wa = normalize(a).split(" ").filter(w => w && !STOP_WORDS.has(w));
  const wb = new Set(normalize(b).split(" ").filter(w => w && !STOP_WORDS.has(w)));
  if (!wa.length || !wb.size) return 0;
  return wa.filter(w => wb.has(w)).length / Math.max(wa.length, wb.size);
}

// ── VTT alignment ─────────────────────────────────────────────────────────────
/**
 * YouTubeのVTTはローリングキャプション形式：
 *   各キューの第1行 = 前キューの第2行（すでに表示中）
 *   各キューの第2行 = そのタイムスタンプで新しく表示される歌詞
 *
 * ローリング判定: 前キューの最終行と現キューの第1行の単語重複 >= 0.6
 * 非ローリング2行エントリ: 2つの別歌詞行として中間タイムスタンプで分割
 */
function parseVttRolling(content) {
  // 1st pass: タイミング＋テキスト収集
  const rawCues = [];
  const blocks = content.replace(/\r\n/g, "\n").split("\n\n");

  for (const block of blocks) {
    if (!block.includes("-->")) continue;
    const lines = block.split("\n");
    const timingLine = lines.find(l => l.includes("-->"));
    if (!timingLine) continue;

    const tm = timingLine.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
    if (!tm) continue;
    const startSec = +tm[1] * 3600 + +tm[2] * 60 + +tm[3] + +tm[4] / 1000;
    const endSec   = +tm[5] * 3600 + +tm[6] * 60 + +tm[7] + +tm[8] / 1000;

    const textLines = lines
      .filter(l => l.trim() && !l.includes("-->") && l.trim() !== "WEBVTT" && !/^\d+$/.test(l.trim()))
      .map(l => l.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean);

    if (textLines.length) rawCues.push({ startSec, endSec, textLines });
  }

  // 2nd pass: ローリング検出 + 非ローリング2行を分割
  const entries = [];
  for (let i = 0; i < rawCues.length; i++) {
    const { startSec, endSec, textLines } = rawCues[i];
    const prevLastText = i > 0 ? rawCues[i - 1].textLines[rawCues[i - 1].textLines.length - 1] : "";

    let firstNewIdx = 0;
    if (prevLastText && textLines.length > 1) {
      if (wordOverlap(textLines[0], prevLastText) >= 0.6) {
        firstNewIdx = 1; // ローリング: 第1行は前キューの継続なのでスキップ
      }
    }

    const newLines = textLines.slice(firstNewIdx);

    if (firstNewIdx === 0 && newLines.length === 2) {
      // 非ローリング2行: それぞれ別の歌詞行として中間点で分割
      const midSec = (startSec + endSec) / 2;
      entries.push({ startSec,        text: newLines[0] });
      entries.push({ startSec: midSec, text: newLines[1] });
    } else {
      const text = newLines.join(" ").replace(/\s+/g, " ").trim();
      if (text) entries.push({ startSec, text });
    }
  }
  return entries;
}

// Jaccard類似度（セット単位）: 繰り返しフレーズを識別するため
function jaccardOverlap(a, b) {
  const setA = new Set(normalize(a).split(" ").filter(w => w && !STOP_WORDS.has(w)));
  const setB = new Set(normalize(b).split(" ").filter(w => w && !STOP_WORDS.has(w)));
  if (!setA.size || !setB.size) return 0;
  const inter = [...setA].filter(w => setB.has(w)).length;
  return inter / (setA.size + setB.size - inter);
}

function alignLyricsVtt(pairs, vttEntries, duration) {
  const MIN_SCORE = 0.12;
  let vIdx = 0;
  const result = [];

  for (let pIdx = 0; pIdx < pairs.length; pIdx++) {
    const pair = pairs[pIdx];

    // 最大5エントリ先読み（絶対に後退しない）
    let best = { score: 0, idx: -1 };
    for (let i = vIdx; i < Math.min(vIdx + 5, vttEntries.length); i++) {
      const s = jaccardOverlap(pair.eng, vttEntries[i].text);
      if (s > best.score) best = { score: s, idx: i };
    }

    if (best.score < MIN_SCORE || best.idx < 0) continue;

    // ルックアヘッド: 次のpairがこのVTTエントリに0.1以上スコアが高ければ譲る
    if (pIdx + 1 < pairs.length) {
      const nextScore = jaccardOverlap(pairs[pIdx + 1].eng, vttEntries[best.idx].text);
      if (nextScore > best.score + 0.1) {
        // このpairは直前エントリの時刻+αで入れ、vIdxは進めない
        if (result.length > 0) {
          const prev = result[result.length - 1]._startSec;
          const gap = vttEntries[best.idx].startSec - prev;
          result.push({ ...pair, _startSec: prev + gap * 0.45 });
        }
        continue; // vIdx進めない → 次のpairがbest.idxを取得
      }
    }

    result.push({ ...pair, _startSec: vttEntries[best.idx].startSec });
    vIdx = best.idx + 1;
  }

  const out = [];
  for (let i = 0; i < result.length; i++) {
    const start = result[i]._startSec;
    const end = i + 1 < result.length
      ? result[i + 1]._startSec - 0.1
      : Math.min(start + 4, duration - 0.05);
    if (end > start && start < duration) {
      out.push({ ...result[i], start, end });
    }
  }
  return out;
}

// ── Whisper alignment (fallback) ──────────────────────────────────────────────
function parseWhisperSegs(file) {
  const jsonFile = file + ".json";
  if (!fs.existsSync(jsonFile)) return [];
  const raw = fs.readFileSync(jsonFile).toString("latin1");
  const data = JSON.parse(raw);
  return (data.transcription || [])
    .map(seg => ({
      startSec: seg.offsets.from / 1000,
      endSec:   seg.offsets.to   / 1000,
      text:     seg.text.trim(),
    }))
    .filter(seg => seg.text && !seg.text.includes("â"));
}

function alignLyricsWhisper(pairs, segs, duration) {
  const MIN_SCORE = 0.15;
  const result = [];
  let pairIdx = 0;

  for (const seg of segs) {
    if (seg.startSec >= duration) break;
    if (pairIdx >= pairs.length) break;

    let best = { score: 0, offset: 0 };
    for (let off = 0; off <= 5 && pairIdx + off < pairs.length; off++) {
      const s = wordOverlap(seg.text, pairs[pairIdx + off].eng);
      if (s > best.score) best = { score: s, offset: off };
    }

    if (best.score >= MIN_SCORE) {
      pairIdx += best.offset;
      const segDur = seg.endSec - seg.startSec;
      if (segDur > 3.5 && pairIdx + 1 < pairs.length) {
        const nextScore = wordOverlap(seg.text, pairs[pairIdx + 1].eng);
        if (nextScore >= MIN_SCORE * 0.6) {
          result.push({ ...pairs[pairIdx],     _startSec: seg.startSec });
          result.push({ ...pairs[pairIdx + 1], _startSec: seg.startSec + segDur / 2 });
          pairIdx += 2;
          continue;
        }
      }
      result.push({ ...pairs[pairIdx], _startSec: seg.startSec });
      pairIdx++;
    }
  }

  const out = [];
  for (let i = 0; i < result.length; i++) {
    const start = result[i]._startSec;
    const end = i + 1 < result.length
      ? result[i + 1]._startSec - 0.1
      : Math.min(start + 4, duration - 0.05);
    if (end > start && start < duration) {
      out.push({ ...result[i], start, end });
    }
  }
  return out;
}

// ── timing ────────────────────────────────────────────────────────────────────
let usedPairs = [];

// 1. VTT試行
const vttFile = path.join(tempDir, `sub-${youtubeId}.en.vtt`);
if (!fs.existsSync(vttFile)) {
  console.log("[yt-dlp] Downloading VTT captions...");
  try {
    execSync(
      `yt-dlp --write-auto-subs --sub-lang en --sub-format vtt --skip-download -o "${path.join(tempDir, "sub-%(id)s")}" "https://www.youtube.com/watch?v=${youtubeId}"`,
      { stdio: "pipe" }
    );
  } catch (_) {}
}

if (fs.existsSync(vttFile)) {
  console.log(`[vtt] ${vttFile}`);
  const vttContent = fs.readFileSync(vttFile, "utf-8");
  const vttEntries = parseVttRolling(vttContent);
  console.log(`[vtt] ${vttEntries.length} entries parsed`);
  if (vttEntries.length > 0) {
    console.log(`[vtt] first: "${vttEntries[0].text.slice(0, 40)}" @${vttEntries[0].startSec.toFixed(1)}s`);
  }
  usedPairs = alignLyricsVtt(linePairs, vttEntries, totalDuration);
  console.log(`[align] ${usedPairs.length}/${linePairs.length} synced (VTT)`);
}

// 2. VTTで不十分ならWhisperフォールバック
if (usedPairs.length < linePairs.length * 0.3) {
  console.log("[whisper] VTT insufficient, falling back to Whisper...");
  console.log("[whisper] Converting to WAV...");
  spawnSync("ffmpeg", ["-y", "-i", audioFile, "-ar", "16000", "-ac", "1", wavFile], { stdio: "pipe" });

  console.log("[whisper] Transcribing...");
  spawnSync("whisper-cli", [
    "-m", whisperModel, "-f", wavFile,
    "--output-json-full", "--output-file", whisperJson,
    "-t", "8",
  ], { stdio: "pipe" });

  const segs = parseWhisperSegs(whisperJson);
  console.log(`[whisper] ${segs.length} segments`);
  usedPairs = alignLyricsWhisper(linePairs, segs, totalDuration);
  console.log(`[align] ${usedPairs.length}/${linePairs.length} synced (Whisper)`);
}

if (!usedPairs.length) { console.error("No aligned pairs"); process.exit(1); }

// ── generate ASS (1920x1080) ──────────────────────────────────────────────────
function assTime(sec) {
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec % 1) * 100);
  return `${h}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

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

// アルバムアート(720px)の下端: 50+720=770
// 字幕エリア: 780〜1070 (290px)
// Eng: \an2\pos(960,925) → 1行=855-925, 2行=787-925
// Jpn: \an2\pos(960,1052) → 1行=1000-1052, 2行=940-1052
const ENG_POS = "{\\an2\\pos(960,925)}";
const JPN_POS = "{\\an2\\pos(960,1052)}";

const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Eng,Helvetica Neue,55,&H00FFFFFF,&H000000FF,&H00000000,&HAA000000,-1,0,0,0,100,100,0,0,1,4,2,2,0,0,0,1
Style: Jpn,Hiragino Sans W3,42,&H0000D7FF,&H000000FF,&H00000000,&HAA000000,-1,0,0,0,100,100,0,0,1,3,1,2,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

let events = "";
for (const b of usedPairs) {
  const t0 = assTime(b.start);
  const t1 = assTime(Math.min(b.end, totalDuration - 0.05));
  events += `Dialogue: 0,${t0},${t1},Eng,,0,0,0,,${ENG_POS}${wrapEng(b.eng)}\n`;
  events += `Dialogue: 0,${t0},${t1},Jpn,,0,0,0,,${JPN_POS}${wrapJpn(b.jpn)}\n`;
}

fs.writeFileSync(assFile, assHeader + events);
console.log(`[ass] ${assFile}`);
console.log(`[ass] ${usedPairs.length} subtitles written`);

// ── ffmpeg: 1920x1080 video ───────────────────────────────────────────────────
const filter1 = [
  "[0:v]split=2[in_bg][in_art]",
  "[in_bg]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=30:30,colorchannelmixer=rr=0.25:gg=0.25:bb=0.25[bg]",
  "[in_art]scale=720:720[art]",
  "[bg][art]overlay=(W-w)/2:50[out]",
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
