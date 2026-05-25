#!/usr/bin/env node
/**
 * generate-context-video.mjs
 * Usage: node agent/src/generate-context-video.mjs --slug <slug> [--duration 60] [--start 0]
 *
 * 曲の背景・文化解説ショート動画を生成する
 *  1. songs.ts + .astroのexplanationからメタデータ収集
 *  2. Claude Haiku APIで5つの文化的事実を生成
 *  3. ASSサブタイトル（カード形式）を作成
 *  4. ffmpegで縦型動画（1080x1920）に合成
 */

import fs from "fs";
import path from "path";
import { spawnSync, execSync } from "child_process";
import { fileURLToPath } from "url";

process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ── .env ──────────────────────────────────────────────────────────────────────
const envContent = fs.existsSync(path.join(__dirname, "../.env"))
  ? fs.readFileSync(path.join(__dirname, "../.env"), "utf-8") : "";
function getEnv(key) {
  return envContent.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim()
    ?? process.env[key] ?? "";
}
const GOOGLE_AI_API_KEY = getEnv("GOOGLE_AI_API_KEY");

// ── args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  if (i !== -1) return args[i + 1];
  return args.find(a => a.startsWith(`--${name}=`))?.split("=")?.[1];
}

const slug = getArg("slug");
const maxDuration = parseFloat(getArg("duration") || "60");
const startSec   = parseFloat(getArg("start") || "0");

if (!slug) {
  console.error("Usage: node generate-context-video.mjs --slug <slug> [--duration 60] [--start 0]");
  process.exit(1);
}

// ── paths ─────────────────────────────────────────────────────────────────────
const astroFile  = path.join(ROOT, "src/pages/songs", `${slug}.astro`);
const coverFile  = path.join(ROOT, "public/images/covers", `${slug}.jpg`);
const audioDir   = path.join(__dirname, "../audio");
const outputDir  = path.join(ROOT, "public/shorts");
const audioFile  = path.join(audioDir, `${slug}.mp3`);
const assFile    = `/tmp/context_${slug}.ass`;
const tmpVideo   = `/tmp/context_${slug}_raw.mp4`;
const outputFile = path.join(outputDir, `${slug}-context.mp4`);

fs.mkdirSync(audioDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(astroFile)) { console.error(`Not found: ${astroFile}`); process.exit(1); }
if (!fs.existsSync(coverFile)) { console.error(`No cover: ${coverFile}`); process.exit(1); }

// ── parse .astro ──────────────────────────────────────────────────────────────
const content = fs.readFileSync(astroFile, "utf-8");

const ytMatch = content.match(/youtubeId="([^"]+)"/);
if (!ytMatch) { console.error("youtubeId not found in .astro"); process.exit(1); }
const youtubeId = ytMatch[1];

// explanation textを抽出
const explanations = [];
const expRe = /<Fragment slot="explanation">([\s\S]*?)<\/Fragment>/g;
let m;
while ((m = expRe.exec(content)) !== null) {
  const text = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (text.length > 20) explanations.push(text);
}
console.log(`[parse] ${explanations.length} explanation blocks`);

// ── song metadata ─────────────────────────────────────────────────────────────
const songsTs   = fs.readFileSync(path.join(ROOT, "src/data/songs.ts"), "utf-8");
const metaBlock = songsTs.match(new RegExp(`slug:\\s*'/songs/${slug}'[^}]*`))?.[0] ?? "";
const infoTitle   = metaBlock.match(/,\s*title:\s*["']([^"']+)["']/)?.[1] ?? slug;
const infoArtist  = metaBlock.match(/,\s*artists:\s*["']([^"']+)["']/)?.[1] ?? "";
const infoYear    = metaBlock.match(/subtitle:\s*["'][^"']*?\b(\d{4})\b[^"']*["']/)?.[1] ?? "";
const infoSample  = metaBlock.match(/sample:\s*["']([^"']+)["']/)?.[1] ?? null;
const infoProducer = metaBlock.match(/subtitle:\s*["']([^·"']+?)\s*[Pp]roduc/)?.[1]?.trim() ?? "";
const infoEra     = metaBlock.match(/era:\s*["']([^"']+)["']/)?.[1] ?? "";
const infoRegion  = metaBlock.match(/region:\s*["']([^"']+)["']/)?.[1] ?? "";
const infoTag     = metaBlock.match(/tag:\s*["']([^"']+)["']/)?.[1] ?? "";

console.log(`[meta] ${infoArtist} – ${infoTitle} (${infoYear})`);

// ── facts generation (Gemini → fallback) ─────────────────────────────────────
async function generateFacts() {
  // Gemini APIを試みる
  try {
    const { GoogleGenAI } = await import(
      path.join(__dirname, "../node_modules/@google/genai/dist/node/index.mjs")
    );
    const client = new GoogleGenAI({ apiKey: GOOGLE_AI_API_KEY });

    const meta = [
      infoProducer ? `プロデューサー: ${infoProducer}` : null,
      infoSample   ? `サンプル: ${infoSample}` : null,
      `時代: ${infoEra}`,
      `地域: ${infoRegion}`,
      `特徴: ${infoTag}`,
    ].filter(Boolean).join("\n");

    const expText = explanations.slice(0, 10).join("\n---\n");

    const prompt = `ヒップホップ曲「${infoTitle}」(${infoArtist}, ${infoYear})の文化的事実を5つ生成。
視聴者: 20-40代日本人ファン。「知らなかった！」と思わせる具体的な情報。

【情報】
${meta}
${expText}

JSON配列のみ出力（labelは8文字以内、textは60文字以内）:
[{"label":"時代背景","text":"..."},{"label":"サンプル","text":"..."},...]`;

    const res = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const raw = res.candidates[0].content.parts[0].text.trim();
    const json = raw.match(/\[[\s\S]*\]/)?.[0];
    if (!json) throw new Error("JSON not found in response");
    const facts = JSON.parse(json);
    console.log("[gemini] Facts generated OK");
    return facts;
  } catch (e) {
    console.warn("[gemini] API unavailable, using metadata fallback:", e.message.split("\n")[0]);
    return buildFallbackFacts();
  }
}

// メタデータ + explanation から直接ファクトを構築するフォールバック
function buildFallbackFacts() {
  const facts = [];

  if (infoYear && infoRegion) {
    facts.push({ label: "基本情報", text: `${infoYear}年、${infoRegion}発。${infoEra}を代表するクラシック。` });
  }
  if (infoProducer) {
    facts.push({ label: "プロデュース", text: `プロデューサーは${infoProducer}。ビートの作り込みに${infoEra}の空気が宿る。` });
  }
  if (infoSample) {
    const sampleShort = infoSample.split("/")[0].trim().slice(0, 55);
    facts.push({ label: "サンプル", text: `${sampleShort}を核にビートを構築。` });
  }
  if (infoTag) {
    facts.push({ label: "特徴", text: infoTag.slice(0, 60) });
  }
  // explanationから抜粋（1〜2個）
  for (const exp of explanations.slice(0, 2)) {
    if (facts.length >= 5) break;
    facts.push({ label: "解説", text: exp.slice(0, 58) + (exp.length > 58 ? "…" : "") });
  }
  // 最低5個に
  while (facts.length < 5) {
    facts.push({ label: "詳細", text: `${infoArtist}の名曲。waxthink.comで全訳・解説を公開中。` });
  }

  return facts.slice(0, 5);
}

// ── audio download ────────────────────────────────────────────────────────────
if (!fs.existsSync(audioFile)) {
  console.log(`[yt-dlp] Downloading ${youtubeId} ...`);
  const ok = (() => { try {
    execSync(`yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${audioFile}" "https://www.youtube.com/watch?v=${youtubeId}"`, { stdio: "inherit" });
    return true;
  } catch { return false; } })();
  if (!ok) {
    execSync(`yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${audioFile}" "ytsearch1:${infoArtist} ${infoTitle} official audio"`, { stdio: "inherit" });
  }
} else {
  console.log(`[yt-dlp] Cache hit: ${audioFile}`);
}

const totalAudio = parseFloat(
  execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioFile}"`).toString().trim()
);
const videoDuration = Math.min(maxDuration, totalAudio - startSec);
console.log(`[audio] ${startSec}s ~ ${(startSec + videoDuration).toFixed(1)}s  (${videoDuration.toFixed(1)}s)`);

// ── generate facts ────────────────────────────────────────────────────────────
const facts = await generateFacts();
console.log(`[claude] ${facts.length} facts: ${facts.map(f => f.label).join(", ")}`);

// ── ASS subtitle file ─────────────────────────────────────────────────────────
function secToASS(s) {
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(min).padStart(2,"0")}:${sec.toFixed(2).padStart(5,"0")}`;
}

// 日本語テキストの折り返し（最大18文字/行）
function wrapJpn(text, maxChars = 18) {
  const lines = [];
  let rest = text;
  while (rest.length > maxChars) {
    lines.push(rest.slice(0, maxChars));
    rest = rest.slice(maxChars);
  }
  if (rest) lines.push(rest);
  return lines.join("\\N");
}

const FONT = "Hiragino Sans W6";

// card timing
const titleDur = 5;
const factDur  = (videoDuration - titleDur) / facts.length;

const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Artist,${FONT},56,&H00FFD700,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,5,60,60,780,1
Style: Title,${FONT},88,&H00FFFFFF,&H000000FF,&H00000000,&H88000000,-1,0,0,0,100,100,0,0,1,4,3,5,60,60,900,1
Style: Meta,${FONT},40,&H00AAAAAA,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,60,60,1090,1
Style: Label,${FONT},46,&H00FFD700,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,0,0,5,60,60,760,1
Style: Fact,${FONT},58,&H00FFFFFF,&H000000FF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,1,4,2,5,80,80,880,1
Style: CTA,${FONT},38,&H00AAAAAA,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,60,60,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

const events = [];

// タイトルカード (0 〜 titleDur)
const t0 = 0, t1 = titleDur;
events.push(`Dialogue: 0,${secToASS(t0)},${secToASS(t1)},Artist,,0,0,0,,{\\an5\\pos(540,820)}${infoArtist}`);
events.push(`Dialogue: 0,${secToASS(t0)},${secToASS(t1)},Title,,0,0,0,,{\\an5\\pos(540,980)}${infoTitle}`);
const metaLine = [infoYear, infoRegion, infoEra].filter(Boolean).join("  ·  ");
if (metaLine) {
  events.push(`Dialogue: 0,${secToASS(t0)},${secToASS(t1)},Meta,,0,0,0,,{\\an5\\pos(540,1110)}${metaLine}`);
}

// ファクトカード
facts.forEach((fact, i) => {
  const start = titleDur + i * factDur;
  const end   = start + factDur;
  events.push(`Dialogue: 0,${secToASS(start)},${secToASS(end)},Label,,0,0,0,,{\\an5\\pos(540,800)}${fact.label}`);
  events.push(`Dialogue: 0,${secToASS(start)},${secToASS(end)},Fact,,0,0,0,,{\\an5\\pos(540,990)}${wrapJpn(fact.text)}`);
});

// CTA（動画全体の最後1/3に表示）
const ctaStart = videoDuration * 0.66;
events.push(`Dialogue: 0,${secToASS(ctaStart)},${secToASS(videoDuration)},CTA,,0,0,0,,{\\an2\\pos(540,1870)}waxthink.com で全曲解説を読む`);

fs.writeFileSync(assFile, assHeader + events.join("\n") + "\n");
console.log("[ass] Written:", assFile);

// ── ffmpeg Step 1: background + album art ────────────────────────────────────
console.log("[ffmpeg] Step 1: generating background video...");
const filter1 = [
  "[0:v]split=2[in_bg][in_art]",
  "[in_bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:30,colorchannelmixer=rr=0.22:gg=0.22:bb=0.22[bg]",
  "[in_art]scale=720:720[art]",
  "[bg][art]overlay=(W-w)/2:(H-h)/2-80[out]",
].join(";");

let r = spawnSync("ffmpeg", [
  "-y",
  "-ss", String(startSec), "-loop", "1", "-i", coverFile,
  "-ss", String(startSec), "-i", audioFile,
  "-t", String(videoDuration),
  "-filter_complex", filter1,
  "-map", "[out]",
  "-map", "1:a",
  "-c:v", "libx264", "-preset", "fast", "-crf", "22",
  "-c:a", "aac", "-b:a", "192k",
  "-shortest", "-movflags", "+faststart", "-r", "30",
  tmpVideo,
], { stdio: "inherit" });
if (r.status !== 0) { console.error("Step 1 failed"); process.exit(1); }

// ── ffmpeg Step 2: burn ASS subtitles ────────────────────────────────────────
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

fs.unlinkSync(tmpVideo);
console.log(`\n✅ Done: ${outputFile}`);
