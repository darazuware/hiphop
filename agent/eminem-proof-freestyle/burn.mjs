// usage: node burn.mjs <reels|full> <captions.json> <glossary.json> <src.mp4> <outDir> <fontsDir>
// 元動画は保存解像度1280x540・SAR 3:4（表示は16:9）。必ず16:9へ scale し setsar=1 で出力する。
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
const [mode, capF, glF, src, outDir, fontsDir] = process.argv.slice(2);
const { cues } = JSON.parse(fs.readFileSync(capF, "utf8"));
const gloss = JSON.parse(fs.readFileSync(glF, "utf8"));
const glossFor = c => { const k = Object.keys(gloss).find(k => c.eng.startsWith(k)); return k ? gloss[k] : null; };
const L = mode === "reels"
  ? { W: 1080, H: 1920, VY: 410, VW: 1080, VH: 608, eng: 54, jpn: 42, gl: 32, engY: 1045, jpnY: 1265, glY: 1420, marg: 60, jpMax: 22, glMax: 27 }
  : { W: 1280, H: 1000, VY: 0, VW: 1280, VH: 720, eng: 40, jpn: 34, gl: 26, engY: 735, jpnY: 835, glY: 915, marg: 50, jpMax: 33, glMax: 44 };
const parts = [
  { label: "幼少期の貧困と母の失踪", from: "Yo yo, I started", to: "So then Proof said" },
  { label: "Proofとの友情、Detroitの絆", from: "Yo so I said", to: "Now you can't see me" },
  { label: "Proofのバース", from: "I know you remember", to: "We're fresh and they're not" },
  { label: "MTVへの挨拶とフリースタイル", from: "So give it up", to: "Hey yo, and all this we just done" },
  { label: "Andrewへの捨て台詞、バイバイ", from: "Yeah, hold it right there", to: "bye-bye, good night, bye-bye, good night" },
];
const t = s => { const cs = Math.round(s * 100); return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`; };
const esc = s => s.replace(/[{}\\]/g, "");
const GOLD = "&H0000D7FF";
const wd = s => [...s].reduce((a, ch) => a + (/[\x00-\x7f]/.test(ch) ? 0.55 : 1), 0);
const BR = "\u0001";
function wrapJa(text, max, minBreak = 0) {
  if (wd(text) <= max) return text;
  const chars = [...text]; let best = -1, bestScore = 1e9, acc = 0; const tot = wd(text);
  for (let i = 0; i < chars.length - 1; i++) {
    acc += wd(chars[i]);
    if (i + 1 < minBreak || !/[、。」）\s]/.test(chars[i])) continue;
    const sc = Math.abs(acc - tot / 2); if (sc < bestScore) { bestScore = sc; best = i + 1; }
  }
  if (best < 0) { let a2 = 0; best = Math.max(minBreak, chars.findIndex(ch => (a2 += wd(ch)) >= tot / 2) + 1); }
  const a = chars.slice(0, best).join("").trim(), b = chars.slice(best).join("").trim();
  return wrapJa(a, max, minBreak) + BR + wrapJa(b, max);
}
const styles = m => `[Script Info]
ScriptType: v4.00+
PlayResX: ${L.W}
PlayResY: ${L.H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Brand,Inter,68,${GOLD},${GOLD},&H00000000,&H00000000,-1,0,0,0,100,100,1,0,1,2,0,8,50,50,190,1
Style: Sub,Inter,42,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,50,50,275,1
Style: Part,Hiragino Sans,36,&H00CCCCCC,&H00CCCCCC,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,50,50,335,1
Style: Foot,Hiragino Sans,28,&H00888888,&H00888888,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,50,50,1600,1
Style: Eng,Inter,${L.eng},${GOLD},&H80FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,8,${L.marg},${L.marg},${L.engY},1
Style: Jpn,Hiragino Sans,${L.jpn},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,8,${L.marg},${L.marg},${L.jpnY},1
Style: Gloss,Hiragino Sans,${L.gl},&H00DDDDDD,&H00DDDDDD,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,${L.marg},${L.marg},${L.glY},1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
`;
function events(sel, t0, dur) {
  let ev = "";
  const rel = ms => ms / 1000 - t0;
  const gl = sel.map((c, i) => ({ i, c, g: glossFor(c) })).filter(x => x.g);
  gl.forEach((x, k) => {
    const s = Math.max(0, rel(x.c.start));
    let e = Math.max(rel(x.c.end), s + 4.2);
    const nx = gl[k + 1]; if (nx) e = Math.min(e, rel(nx.c.start));
    e = Math.min(e, dur);
    const body = x.g.map(([tm, d]) => { const w = wrapJa(`${tm}　${d}`, L.glMax, [...tm].length + 1); return `{\\c${GOLD}&}${esc(tm)}{\\c&HDDDDDD&}` + esc(w.slice(tm.length)).replaceAll(BR, "\\N"); }).join("\\N");
    ev += `Dialogue: 2,${t(s)},${t(e)},Gloss,,0,0,0,,{\\fad(80,120)}${body}\n`;
  });
  for (const c of sel) {
    let ptr = c.start, eng = "";
    for (const sg of c.segments) {
      if (sg.s == null) { eng += esc(sg.text); continue; }
      const gap = Math.max(0, sg.s - ptr);
      eng += `{\\k${Math.round(gap / 10)}}{\\kf${Math.max(1, Math.round((sg.e - sg.s) / 10))}}${esc(sg.text)}`;
      ptr = sg.e;
    }
    ev += `Dialogue: 0,${t(rel(c.start))},${t(rel(c.end))},Eng,,0,0,0,,{\\fad(60,100)}${eng}\n`;
    ev += `Dialogue: 1,${t(rel(c.start))},${t(rel(c.end))},Jpn,,0,0,0,,{\\fad(60,100)}${esc(wrapJa(c.jpn, L.jpMax)).replaceAll(BR, "\\N")}
`;
  }
  return ev;
}
function render(base, ass, ssArgs) {
  const fd = path.resolve(fontsDir);
  const vf = `scale=${L.VW}:${L.VH},setsar=1,pad=${L.W}:${L.H}:0:${L.VY}:black,ass=${base}.ass:fontsdir=${fd},setsar=1`;
  fs.writeFileSync(base + ".ass", ass);
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...ssArgs, "-i", src, "-vf", vf, "-c:v", "libx264", "-crf", "21", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", base + ".mp4"], { stdio: "inherit" });
  if (r.status) process.exit(r.status);
}
fs.mkdirSync(outDir, { recursive: true });
if (mode === "full") {
  const dur = 271.3;
  render(`${outDir}/eminem-proof-stereo-car-freestyle_subs`, styles() + events(cues, 0, dur), []);
} else {
  parts.forEach((p, n) => {
    const a = cues.findIndex(c => c.eng.startsWith(p.from));
    const b = cues.findIndex((c, i) => i >= a && c.eng.startsWith(p.to));
    if (a < 0 || b < 0) throw new Error("part range " + p.from);
    const sel = cues.slice(a, b + 1);
    const t0 = Math.max((a > 0 ? cues[a - 1].end : 0) / 1000, sel[0].start / 1000 - 0.4, 0);
    const dur = sel.at(-1).end / 1000 + 0.6 - t0;
    let ev = `Dialogue: 0,${t(0)},${t(dur)},Brand,,0,0,0,,EMINEM & PROOF\n`;
    ev += `Dialogue: 0,${t(0)},${t(dur)},Sub,,0,0,0,,Stereo Car Freestyle\n`;
    ev += `Dialogue: 0,${t(0)},${t(dur)},Part,,0,0,0,,Part ${n + 1}/${parts.length}　${esc(p.label)}\n`;
    ev += `Dialogue: 0,${t(0)},${t(dur)},Foot,,0,0,0,,対訳 waxthink.com\n`;
    render(`${outDir}/part${n + 1}`, styles() + ev + events(sel, t0, dur), ["-ss", String(t0), "-t", String(dur)]);
    console.log(`part${n + 1}: ${t0.toFixed(1)}s (${dur.toFixed(1)}s)`);
  });
}
