#!/usr/bin/env node
/**
 * 横長フル歌詞動画の決定的レンダラ（ASS焼き込み）。
 * full-cues.json をそのまま字幕にし、ブラーしたカバー背景＋音源にffmpegで焼く。
 * タイミングは cue の start（フォースドアライメント由来）を使うだけ＝決定的・高速。
 *
 * 演出フィールド（cueに任意）: color(EN色) / jpColor(JP色) / scale(拡大倍率=パンチライン)
 * 曲テーマ: meta.json の {theme:{en,jp}}（無ければ白/ネオン黄緑）
 *
 * 出力: agent/{slug}/renders/{slug}_lyric_{ts}.mp4
 * Usage: node agent/src/render-lyric-video.mjs --slug <slug> [--seg 34-54]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT = path.resolve(__dirname, "..");
const getArg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const slug = getArg("slug");
if (!slug) { console.error("Usage: node agent/src/render-lyric-video.mjs --slug <slug> [--seg a-b]"); process.exit(1); }

const assets = path.join(AGENT, slug, "assets");
const cues = JSON.parse(fs.readFileSync(path.join(assets, "full-cues.json"), "utf8"));
const meta = fs.existsSync(path.join(assets, "meta.json")) ? JSON.parse(fs.readFileSync(path.join(assets, "meta.json"), "utf8")) : {};
const theme = meta.theme || {};
const audio = ["audio-full.mp3", "audio.mp3", "audio-full.wav"].map(n => path.join(assets, n)).find(fs.existsSync);
const cover = ["cover.jpg", "cover.png"].map(n => path.join(assets, n)).find(fs.existsSync);
if (!audio) { console.error("[render] 音源が無い"); process.exit(2); }

// audio duration
const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", audio]);
const DUR = parseFloat(String(probe.stdout).trim()) || (cues.at(-1)?.end ?? 0) + 5;

const bgr = (hex) => { const h = (hex || "").replace("#", ""); return h.length === 6 ? "&H00" + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2) : null; };
const EN = bgr(theme.en) || "&H00FFFFFF";
const JP = bgr(theme.jp) || "&H003CDF9A";
const t = (s) => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return `${h}:${String(m).padStart(2, "0")}:${ss.toFixed(2).padStart(5, "0")}`; };
const esc = (x) => (x || "").replace(/[{}]/g, "");

const head = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: EN,Arial,72,${EN},&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,3,4,5,120,120,0,1
Style: JP,Hiragino Sans,44,${JP},&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,3,5,120,120,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

const rows = cues.map((c, i) => ({ ...c, i })).filter(c => typeof c.start === "number");
let ev = "";
for (let i = 0; i < rows.length; i++) {
  const c = rows[i];
  const s = c.start;
  const e = Math.min(typeof c.end === "number" && c.end > s ? c.end : DUR, (rows[i + 1]?.start ?? DUR), s + 7);
  const fad = `{\\fad(120,120)}`;
  const sc = c.scale ? `{\\fs${Math.round(72 * c.scale)}}` : "";
  const ec = c.color ? `{\\c${bgr(c.color)}}` : "";
  const jc = c.jpColor ? `{\\c${bgr(c.jpColor)}}` : (c.color ? `{\\c${bgr(c.color)}}` : "");
  const jpY = c.scale ? 640 : 600;
  ev += `Dialogue: 0,${t(s)},${t(e)},EN,,0,0,0,,${fad}{\\pos(960,500)}${sc}${ec}${esc(c.eng)}\n`;
  if (c.jpn) ev += `Dialogue: 0,${t(s)},${t(e)},JP,,0,0,0,,${fad}{\\pos(960,${jpY})}${jc}${esc(c.jpn)}\n`;
}
const assPath = path.join(assets, ".subs.ass");
fs.writeFileSync(assPath, head + ev);

const seg = getArg("seg");
const ts = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const outDir = path.join(AGENT, slug, "renders");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${slug}_lyric_${ts}${seg ? "_seg" : ""}.mp4`);

const bg = cover
  ? `[0:v]scale=1920:1920:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=40:2,eq=brightness=-0.35[bg];[bg]ass=${assPath}[v]`
  : `color=c=black:s=1920x1080:r=30[bg];[bg]ass=${assPath}[v]`;
const inputs = cover
  ? ["-loop", "1", "-framerate", "30", "-i", cover, "-i", audio]
  : ["-f", "lavfi", "-i", "color=c=black:s=1920x1080:r=30", "-i", audio];
const segArgs = seg ? (() => { const [a, b] = seg.split("-").map(Number); return ["-ss", String(a), "-t", String(b - a)]; })() : [];

console.log(`[render] ${rows.length} cues, ${DUR.toFixed(1)}s, theme EN=${EN} JP=${JP}${seg ? ", seg " + seg : ""}`);
const r = spawnSync("ffmpeg", [
  "-y", "-loglevel", "error", ...inputs,
  "-filter_complex", bg, "-map", "[v]", "-map", "1:a",
  ...segArgs, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out,
], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`[render] OK -> ${path.relative(process.cwd(), out)}`);
