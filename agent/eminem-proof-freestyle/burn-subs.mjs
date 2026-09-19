// usage: node burn-subs.mjs <captions.json> <src.mp4> <out.mp4>
import fs from "fs";
import { spawnSync } from "child_process";
const [capF, src, out] = process.argv.slice(2);
const { cues } = JSON.parse(fs.readFileSync(capF, "utf8"));
const W = 1280, H = 720, VH = 540;
const t = ms => { const cs = Math.round(ms / 10); const h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, s = Math.floor(cs / 100) % 60; return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`; };
const esc = s => s.replace(/[{}\\]/g, "");
let ev = "";
for (const c of cues) {
  let ptr = c.start, eng = "";
  for (const sg of c.segments) {
    if (sg.s == null) { eng += esc(sg.text); continue; }
    const gap = Math.max(0, sg.s - ptr);
    eng += `{\\k${Math.round(gap / 10)}}{\\kf${Math.max(1, Math.round((sg.e - sg.s) / 10))}}${esc(sg.text)}`;
    ptr = sg.e;
  }
  ev += `Dialogue: 0,${t(c.start)},${t(c.end)},Eng,,0,0,0,,{\\fad(60,100)}${eng}\n`;
  ev += `Dialogue: 0,${t(c.start)},${t(c.end)},Jpn,,0,0,0,,{\\fad(60,100)}${esc(c.jpn)}\n`;
}
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Eng,Helvetica Neue,40,&H0000D7FF,&H80FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,50,50,${VH + 18},1
Style: Jpn,Hiragino Sans,36,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,2,50,50,22,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
${ev}`;
fs.writeFileSync(out.replace(/\.mp4$/, ".ass"), ass);
const assPath = out.replace(/\.mp4$/, ".ass");
const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", `pad=${W}:${H}:0:0:black,ass=${assPath}`, "-c:v", "libx264", "-crf", "22", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", out], { stdio: "inherit" });
process.exit(r.status);
