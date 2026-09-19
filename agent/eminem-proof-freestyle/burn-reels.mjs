// usage: node burn-reels.mjs <captions.json> <src.mp4> <outDir>
import fs from "fs";
import { spawnSync } from "child_process";
const [capF, src, outDir] = process.argv.slice(2);
const { cues } = JSON.parse(fs.readFileSync(capF, "utf8"));
const W = 1080, H = 1920, VY = 560, VH = 454;
const parts = [
  { label: "幼少期の貧困と母の失踪", from: "Yo yo, I started", to: "So then Proof said" },
  { label: "Proofとの友情、Detroitの絆", from: "Yo so I said", to: "Now you can't see me" },
  { label: "Proofのバース", from: "I know you remember", to: "We're fresh and they're not" },
  { label: "MTVへの挨拶とフリースタイル", from: "So give it up", to: "Hey yo, and all this we just done" },
  { label: "Andrewへの捨て台詞、バイバイ", from: "Yeah, hold it right there", to: "bye-bye, good night, bye-bye, good night" },
];
const idxOf = (p, last) => { const i = cues.findIndex(c => c.eng.startsWith(p) && (last ? true : true)); if (i < 0) throw new Error("no cue " + p); return i; };
const t = s => { const cs = Math.round(s * 100); const h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, sec = Math.floor(cs / 100) % 60; return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`; };
const esc = s => s.replace(/[{}\\]/g, "");
fs.mkdirSync(outDir, { recursive: true });
parts.forEach((p, n) => {
  const a = idxOf(p.from), b = cues.findIndex((c, i) => i >= a && c.eng.startsWith(p.to));
  if (b < 0) throw new Error("no end " + p.to);
  const sel = cues.slice(a, b + 1);
  const prevEnd = a > 0 ? cues[a - 1].end : 0;
  const t0 = Math.max(prevEnd / 1000, sel[0].start / 1000 - 0.4, 0);
  const t1 = sel.at(-1).end / 1000 + 0.6;
  const dur = t1 - t0;
  let ev = `Dialogue: 0,${t(0)},${t(dur)},Brand,,0,0,0,,EMINEM & PROOF\n`;
  ev += `Dialogue: 0,${t(0)},${t(dur)},Sub,,0,0,0,,Stereo Car Freestyle\n`;
  ev += `Dialogue: 0,${t(0)},${t(dur)},Part,,0,0,0,,Part ${n + 1}/${parts.length}　${esc(p.label)}\n`;
  ev += `Dialogue: 0,${t(0)},${t(dur)},Foot,,0,0,0,,対訳 waxthink.com\n`;
  for (const c of sel) {
    let ptr = c.start, eng = "";
    for (const sg of c.segments) {
      if (sg.s == null) { eng += esc(sg.text); continue; }
      const gap = Math.max(0, sg.s - ptr);
      eng += `{\\k${Math.round(gap / 10)}}{\\kf${Math.max(1, Math.round((sg.e - sg.s) / 10))}}${esc(sg.text)}`;
      ptr = sg.e;
    }
    const s = t(c.start / 1000 - t0), e = t(c.end / 1000 - t0);
    ev += `Dialogue: 0,${s},${e},Eng,,0,0,0,,{\\fad(60,100)}${eng}\n`;
    ev += `Dialogue: 0,${s},${e},Jpn,,0,0,0,,{\\fad(60,100)}${esc(c.jpn)}\n`;
  }
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Brand,Helvetica Neue,72,&H0000D7FF,&H0000D7FF,&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,2,0,8,50,50,270,1
Style: Sub,Helvetica Neue,44,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,1,0,1,2,0,8,50,50,360,1
Style: Part,Hiragino Sans,38,&H00CCCCCC,&H00CCCCCC,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,50,50,440,1
Style: Foot,Hiragino Sans,30,&H00888888,&H00888888,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,50,50,1620,1
Style: Eng,Helvetica Neue,58,&H0000D7FF,&H80FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,8,60,60,${VY + VH + 40},1
Style: Jpn,Hiragino Sans,46,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,8,60,60,1290,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
${ev}`;
  const base = `${outDir}/part${n + 1}`;
  fs.writeFileSync(base + ".ass", ass);
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(t0), "-t", String(dur), "-i", src, "-vf", `scale=${W}:${VH},pad=${W}:${H}:0:${VY}:black,ass=${base}.ass`, "-c:v", "libx264", "-crf", "21", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", base + ".mp4"], { stdio: "inherit" });
  if (r.status) process.exit(r.status);
  console.log(`part${n + 1}: ${t0.toFixed(1)}s-${t1.toFixed(1)}s (${dur.toFixed(1)}s) ${sel.length} cues`);
});
