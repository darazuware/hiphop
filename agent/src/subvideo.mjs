#!/usr/bin/env node
/**
 * 字幕ショート量産: YouTube動画(フリースタイル/PV/インタビュー等)に「英字幕(単語カラオケ)＋日本語訳＋スラング解説」を焼き込み、
 * フル版と縦型(1080x1920)ショート分割を出す。手順は docs/subtitle-video.md。
 *
 *   node agent/src/subvideo.mjs init  --url <YouTube URL> --slug <slug> [--brand "EMINEM & PROOF"] [--sub "Stereo Car Freestyle"]
 *   (Claudeが lines.json / glossary.json を書く)
 *   node agent/src/subvideo.mjs run   --slug <slug>        # align → build → render(all) → check
 *   node agent/src/subvideo.mjs align|build|render|check --slug <slug> [--mode reels|full|all]
 *
 * 作業dir: agent/subvideo/{slug}/ （src.mp4 等の重い物は .gitignore）。歌詞の英語行はstdoutに出さない。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT = path.resolve(__dirname, "..");
const PY = path.join(AGENT, ".fa-venv", "bin", "python");
const FONTS = path.join(AGENT, "assets", "fonts");
const WHISPER_MODEL = "/opt/homebrew/share/whisper-cpp/ggml-medium.en.bin";

const cmd = process.argv[2];
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const slug = arg("slug");
if (!cmd || !slug) { console.error("Usage: node agent/src/subvideo.mjs <init|align|build|render|check|run> --slug <slug> [...]"); process.exit(1); }
const DIR = path.join(AGENT, "subvideo", slug);
const P = f => path.join(DIR, f);
const rj = f => JSON.parse(fs.readFileSync(P(f), "utf8"));
const wj = (f, o) => fs.writeFileSync(P(f), JSON.stringify(o, null, 2));
const sh = (c, a, o = {}) => { const r = spawnSync(c, a, { stdio: "inherit", ...o }); if (r.status !== 0) { console.error(`[subvideo] 失敗: ${c} ${a.slice(0, 3).join(" ")}...`); process.exit(r.status || 1); } };
const NL = "\\N";

// ---------------- init ----------------
function init() {
  const url = arg("url");
  if (!url) { console.error("--url が必要"); process.exit(1); }
  fs.mkdirSync(DIR, { recursive: true });
  const info = spawnSync("yt-dlp", ["--cookies-from-browser", "chrome", "--no-playlist", "--print", "%(id)s\t%(title)s\t%(duration)s", "--skip-download", url], { encoding: "utf8" });
  if (info.status !== 0) { console.error("[subvideo] yt-dlp メタ取得失敗（Chromeにログイン中か確認）"); process.exit(2); }
  const [id, title, duration] = info.stdout.trim().split("\t");
  const meta = fs.existsSync(P("meta.json")) ? rj("meta.json") : {};
  Object.assign(meta, { youtubeId: id, sourceTitle: title, duration: Number(duration), url, brand: arg("brand", meta.brand || "TITLE"), sub: arg("sub", meta.sub || ""), footer: meta.footer || "対訳 waxthink.com" });
  wj("meta.json", meta);
  if (!fs.existsSync(P("src.mp4"))) sh("yt-dlp", ["--cookies-from-browser", "chrome", "--no-playlist", "-f", "bv*[height<=1080]+ba/b", "--merge-output-format", "mp4", "-o", P("src.%(ext)s"), url]);
  if (!fs.existsSync(P("audio.mp3"))) sh("ffmpeg", ["-y", "-loglevel", "error", "-i", P("src.mp4"), "-vn", "-q:a", "2", P("audio.mp3")]);
  spawnSync("yt-dlp", ["--cookies-from-browser", "chrome", "--no-playlist", "--skip-download", "--write-auto-subs", "--sub-langs", "en", "-o", P("yt"), url], { stdio: "ignore" });
  if (fs.existsSync(P("yt.en.vtt"))) {
    const words = parseVtt(fs.readFileSync(P("yt.en.vtt"), "utf8"));
    wj("yt-words.json", words);
    console.log(`[subvideo] YT自動字幕: ${words.length}語`);
  } else console.log("[subvideo] YT自動字幕なし（自動検証はスキップされる）");
  if (!fs.existsSync(P(".stems/htdemucs/audio/vocals.wav"))) sh(PY, ["-m", "demucs", "--two-stems=vocals", "-o", P(".stems"), P("audio.mp3")]);
  if (!fs.existsSync(P("whisper-vocals.json"))) {
    sh("ffmpeg", ["-y", "-loglevel", "error", "-i", P(".stems/htdemucs/audio/vocals.wav"), "-ar", "16000", "-ac", "1", P(".vocals16k.wav")]);
    sh("whisper-cli", ["-m", WHISPER_MODEL, "-f", P(".vocals16k.wav"), "-ml", "1", "-oj", "-of", P("whisper-vocals"), "-nt"], { stdio: "ignore" });
  }
  writeDraft();
  const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height,sample_aspect_ratio", "-of", "csv=p=0", P("src.mp4")], { encoding: "utf8" }).stdout.trim();
  console.log(`[subvideo] 準備完了 ${DIR}\n  映像 ${pr} / draft.md を読んで lines.json と glossary.json を書く（docs/subtitle-video.md §2）`);
}
function parseVtt(vtt) {
  const out = [];
  for (const l of vtt.split("\n")) {
    if (!l.includes("<c>")) continue;
    const parts = l.split(/<(\d\d:\d\d:\d\d\.\d+)>/);
    for (let i = 1; i < parts.length; i += 2) {
      const [, m, s] = parts[i].split(":"); const w = (parts[i + 1] || "").replace(/<\/?c>/g, "").trim().toLowerCase().replace(/[^a-z']/g, "");
      if (w) out.push({ s: +m * 60 + +s, w });
    }
  }
  return out;
}
function writeDraft() {
  const group = (items, key) => { let o = "", cur = [], t0 = null; for (const x of items) { if (t0 === null) t0 = x.s; cur.push(x.w); if (cur.length >= 10) { o += `${t0.toFixed(1)}\t${cur.join(" ")}\n`; cur = []; t0 = null; } } if (cur.length) o += `${t0.toFixed(1)}\t${cur.join(" ")}\n`; return o; };
  let md = "# draft（2つのASRの粗い文字起こし。lines.jsonの下書き用・時刻はYT字幕が実測に近い）\n\n## YouTube自動字幕\n" + (fs.existsSync(P("yt-words.json")) ? group(rj("yt-words.json")) : "(なし)\n");
  if (fs.existsSync(P("whisper-vocals.json"))) {
    const w = rj("whisper-vocals.json").transcription.map(x => ({ s: x.offsets.from / 1000, w: x.text.trim() })).filter(x => x.w && !/^\[/.test(x.w));
    md += "\n## whisper(ボーカル分離後)※時刻は序盤にズレやすいので語だけ参考に\n" + group(w);
  }
  fs.writeFileSync(P("draft.md"), md);
}

// ---------------- align ----------------
function align() {
  if (!fs.existsSync(P("lines.json"))) { console.error("lines.json が無い（docs/subtitle-video.md §2）"); process.exit(2); }
  sh(PY, [path.join(__dirname, "subvideo-align.py"), DIR]);
}

// ---------------- build ----------------
const HOOK_TPL = [["ooh", 0, 0.17], ["la", 0.2, 0.32], ["la", 0.58, 0.72], ["ah", 1.02, 1.36], ["oui", 1.4, 1.8], ["oui", 2.4, 2.83]];
function applyHookGrids(F, meta) {
  for (const g of meta.hookGrids || []) {
    for (let i = g.from; i <= g.to; i++) {
      const n = F[i].length, t = g.t0 + g.d * (i - g.from);
      if (n !== 6 && n !== 3) throw new Error(`hookGrids: 行${i}の語数が${n}（6か3のみ）`);
      F[i] = HOOK_TPL.slice(0, n).map(([w, a, b]) => ({ w, s: +(t + a).toFixed(3), e: +(t + b).toFixed(3) }));
    }
  }
}
function build() {
  const L = rj("lines.json"), F = rj("fa.json"), meta = rj("meta.json");
  applyHookGrids(F, meta);
  if (L.length !== F.length) { console.error("lines.json と fa.json の行数が不一致（align を再実行）"); process.exit(2); }
  const cues = [];
  L.forEach(([eng, jpn], i) => {
    if (jpn === null || jpn === undefined) return;
    const ws = F[i]; const toks = [...eng.matchAll(/([A-Za-z’']+)|([^A-Za-z’']+)/g)];
    if (toks.filter(t => t[1]).length !== ws.length) throw new Error(`行${i}: 語数不一致`);
    let k = 0; const segs = [];
    for (const t of toks) {
      if (t[1]) { const w = ws[k], nx = ws[k + 1]; let e = w.e; if (nx && nx.s - e < 0.25) e = Math.max(e, nx.s); k++; segs.push({ text: t[1], s: Math.round(w.s * 1000), e: Math.round(e * 1000) }); }
      else segs.push({ text: t[2] });
    }
    cues.push({ eng, jpn, start: Math.max(0, Math.round((ws[0].s - 0.08) * 1000)), _last: ws.at(-1).e, segments: segs });
  });
  cues.forEach((c, i) => { const nx = cues[i + 1]; const cap = Math.round((c._last + 0.7) * 1000); c.end = nx ? Math.min(cap, nx.start) : cap; if (c.end <= c.start) c.end = c.start + 500; delete c._last; });
  wj("captions.json", { youtubeId: meta.youtubeId, cues });
  if (!fs.existsSync(P("parts.json"))) { wj("parts.json", autoParts(cues)); console.log("[subvideo] parts.json を自動生成（labelを編集する）"); }
  console.log(`[subvideo] captions.json ${cues.length}キュー`);
}
function autoParts(cues) {
  const parts = []; let start = 0;
  for (let i = 0; i < cues.length; i++) {
    const dur = (cues[i].end - cues[start].start) / 1000; const nx = cues[i + 1];
    const gap = nx ? (nx.start - cues[i].end) / 1000 : 99;
    if (!nx || dur >= 58 || (dur >= 42 && gap >= 0.8)) { parts.push({ label: `Part ${parts.length + 1}`, from: cues[start].eng.slice(0, 24), to: cues[i].eng.slice(0, 24) }); start = i + 1; }
  }
  return parts;
}

// ---------------- render ----------------
function geometry(mode) {
  const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height,sample_aspect_ratio", "-of", "csv=p=0", P("src.mp4")], { encoding: "utf8" }).stdout.trim().split(",");
  const [w, h] = [+pr[0], +pr[1]]; const [sn, sd] = (pr[2] || "1:1").split(":").map(Number);
  const dar = (w * (sn && sd ? sn / sd : 1)) / h;
  const ev = x => Math.round(x / 2) * 2;
  const cd = spawnSync("ffmpeg", ["-ss", String(Math.round((rj("meta.json").duration || 60) * 0.4)), "-i", P("src.mp4"), "-t", "3", "-vf", "cropdetect=24:2:0", "-f", "null", "-"], { encoding: "utf8" }).stderr.match(/crop=(\d+):(\d+):(\d+):(\d+)/g);
  const lbSrc = cd ? +cd.at(-1).split(":")[3] : 0;
  const lb = Math.round(lbSrc * (mode === "reels" ? 1080 : 1280) / w);
  if (mode === "reels") {
    const VW = 1080, VH = ev(VW / dar), VY = Math.max(230, Math.round(410 - (VH - 608) * 0.6));
    const engY = VY + VH + 27;
    return { lb, W: 1080, H: 1920, VY, VW, VH, eng: 54, jpn: 42, gl: 36, engY, jpnY: engY + 165, glY: engY + 305, marg: 60, jpMax: 22, glMax: 27, footY: 1600 };
  }
  const VW = 1280, VH = ev(VW / dar);
  return { lb, W: 1280, H: VH + 280, VY: 0, VW, VH, eng: 40, jpn: 34, gl: 26, engY: VH + 15, jpnY: VH + 115, glY: VH + 195, marg: 50, jpMax: 33, glMax: 44, footY: 0 };
}
const GOLD = "&H0000D7FF";
const wd = s => [...s].reduce((a, ch) => a + (/[\x00-\x7f]/.test(ch) ? 0.55 : 1), 0);
const BR = "\u0001";
function wrapJa(text, max, minBreak = 0) {
  if (wd(text) <= max) return text;
  const chars = [...text]; let best = -1, bs = 1e9, acc = 0; const tot = wd(text);
  for (let i = 0; i < chars.length - 1; i++) { acc += wd(chars[i]); if (i + 1 < minBreak || !/[、。」）\s]/.test(chars[i])) continue; const sc = Math.abs(acc - tot / 2); if (sc < bs) { bs = sc; best = i + 1; } }
  if (best < 0) { let a2 = 0; best = Math.max(minBreak, chars.findIndex(ch => (a2 += wd(ch)) >= tot / 2) + 1); }
  return wrapJa(chars.slice(0, best).join("").trim(), max, minBreak) + BR + wrapJa(chars.slice(best).join("").trim(), max);
}
const esc = s => s.replace(/[{}\\]/g, "");
const ts = s => { const cs = Math.round(s * 100); return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`; };
function styles(L) {
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${L.W}\nPlayResY: ${L.H}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Brand,Inter,68,${GOLD},${GOLD},&H00000000,&H00000000,-1,0,0,0,100,100,1,0,1,2,0,8,50,50,190,1
Style: Sub,Inter,42,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,50,50,275,1
Style: Part,Hiragino Sans,36,&H00CCCCCC,&H00CCCCCC,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,50,50,335,1
Style: Foot,Hiragino Sans,28,&H00888888,&H00888888,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,50,50,${L.footY},1
Style: Eng,Inter,${L.eng},${GOLD},&H80FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,8,${L.marg},${L.marg},${L.engY},1
Style: Jpn,Hiragino Sans,${L.jpn},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,8,${L.marg},${L.marg},${L.jpnY},1
Style: Card,Inter,20,&H00F6F6F6,&H00F6F6F6,&H00F6F6F6,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: Tag,Inter,25,&H00FFFFFF,&H00FFFFFF,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,1,0,3,8,0,7,${L.marg + 36},${L.marg},${L.glY},1
Style: GTerm,Hiragino Sans,${L.gl + 2},&H00111111,&H00111111,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,7,${L.marg + 36},${L.marg},${L.glY + 58},1
Style: GMemo,Hiragino Sans,${L.gl - 4},&H00444444,&H00444444,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,${L.marg + 36},${L.marg},${L.glY + 58},1
Style: Gloss,Hiragino Sans,${L.gl},&H00DDDDDD,&H00DDDDDD,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,${L.marg},${L.marg},${L.glY},1

[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
}
function events(L, sel, t0, dur, gloss) {
  const rel = ms => ms / 1000 - t0; let ev = "";
  const gk = c => Object.keys(gloss).find(k => c.eng.startsWith(k));
  const gl = sel.map(c => ({ c, g: gk(c) ? gloss[gk(c)] : null })).filter(x => x.g);
  const TAGC = { AAVE: "&H00A4007B&", Slang: "&H000054A8&", "慣用句": "&H00A87E00&", Memo: "&H0000AB03&" };
  gl.forEach((x, k) => {
    const card = x.g[0][2];
    const s = Math.max(0, rel(x.c.start)); let e = Math.max(rel(x.c.end), s + (card ? 5.5 : 4.2)); if (gl[k + 1]) e = Math.min(e, rel(gl[k + 1].c.start)); e = Math.min(e, dur);
    if (card) {
      const [tm, d, tag, memo] = x.g[0]; const fd = "{\\fad(80,120)}";
      const mainW = Math.floor((L.W - 2 * L.marg - 72) / (L.gl + 2) / 0.98);
      const main = wrapJa(`${tm}　${d}`, Math.min(L.glMax, mainW), [...tm].length + 1); const mainLines = main.split(BR).length;
      const memoT = memo ? wrapJa(memo, Math.min(L.glMax + 3, Math.floor((L.W - 2 * L.marg - 72) / (L.gl - 4) / 0.98))) : ""; const memoLines = memo ? memoT.split(BR).length : 0;
      const mainH = mainLines * (L.gl + 14), memoY = L.glY + 58 + mainH + 6, cardTop = L.glY - 20, cardBot = memo ? memoY + memoLines * (L.gl + 6) + 20 : L.glY + 58 + mainH + 14;
      const cw = L.W - 2 * L.marg, ch = cardBot - cardTop, r = 26;
      const shape = `m ${r} 0 l ${cw - r} 0 b ${cw} 0 ${cw} 0 ${cw} ${r} l ${cw} ${ch - r} b ${cw} ${ch} ${cw} ${ch} ${cw - r} ${ch} l ${r} ${ch} b 0 ${ch} 0 ${ch} 0 ${ch - r} l 0 ${r} b 0 0 0 0 ${r} 0`;
      ev += `Dialogue: 1,${ts(s)},${ts(e)},Card,,0,0,0,,${fd}{\\an7\\pos(${L.marg},${cardTop})\\p1}${shape}{\\p0}\n`;
      ev += `Dialogue: 3,${ts(s)},${ts(e)},Tag,,0,0,0,,${fd}{\\3c${TAGC[tag] || "&H00999999&"}}${esc(tag)}\n`;
      ev += `Dialogue: 3,${ts(s)},${ts(e)},GTerm,,0,0,0,,${fd}{\\b1}${esc(tm)}{\\b0\\c&H333333&}` + esc(main.slice(tm.length)).replaceAll(BR, NL) + "\n";
      if (memo) ev += `Dialogue: 3,${ts(s)},${ts(e)},GMemo,,0,0,${memoY},,${fd}${esc(memoT).replaceAll(BR, NL)}\n`;
      return;
    }
    const body = x.g.map(([tm, d]) => { const w = wrapJa(`${tm}　${d}`, L.glMax, [...tm].length + 1); return `{\\c${GOLD}&}${esc(tm)}{\\c&HDDDDDD&}` + esc(w.slice(tm.length)).replaceAll(BR, NL); }).join(NL);
    ev += `Dialogue: 2,${ts(s)},${ts(e)},Gloss,,0,0,0,,{\\fad(80,120)}${body}\n`;
  });
  for (const c of sel) {
    let ptr = c.start, eng = "";
    for (const sg of c.segments) { if (sg.s == null) { eng += esc(sg.text); continue; } eng += `{\\k${Math.round(Math.max(0, sg.s - ptr) / 10)}}{\\kf${Math.max(1, Math.round((sg.e - sg.s) / 10))}}${esc(sg.text)}`; ptr = sg.e; }
    ev += `Dialogue: 0,${ts(rel(c.start))},${ts(rel(c.end))},Eng,,0,0,0,,{\\fad(60,100)}${eng}\n`;
    if (c.jpn) ev += `Dialogue: 1,${ts(rel(c.start))},${ts(rel(c.end))},Jpn,,0,0,0,,{\\fad(60,100)}${esc(wrapJa(c.jpn, L.jpMax)).replaceAll(BR, NL)}\n`;
  }
  return ev;
}
const LOGO = path.resolve(AGENT, "assets/brand/wax-think-logo.png");
function ffrender(L, base, ass, ss, dur) {
  fs.writeFileSync(base + ".ass", ass);
  const OUT = 2.8, fO = 0.5, wmW = L.W === 1080 ? 210 : 170, endW = L.W === 1080 ? 560 : 520, total = dur + OUT;
  const wx = L.W - wmW - (L.W === 1080 ? 28 : 20), wy = L.VY + L.lb + (L.W === 1080 ? 22 : 18);
  const fc = `[0:v]scale=${L.VW}:${L.VH},setsar=1,pad=${L.W}:${L.H}:0:${L.VY}:black,ass=${base}.ass:fontsdir=${FONTS},setsar=1[base];`
    + `[1:v]format=rgba,split=2[a][b];[a]scale=${wmW}:-1,colorchannelmixer=aa=0.4[wm];[base][wm]overlay=${wx}:${wy}[v1];`
    + `[v1]fade=t=out:st=${(dur - fO).toFixed(2)}:d=${fO},tpad=stop_mode=add:stop_duration=${OUT}:color=black[v2];`
    + `[b]scale=${endW}:-1,fade=t=in:st=0:d=0.6:alpha=1,fade=t=out:st=1.5:d=0.6:alpha=1,setpts=PTS+${(dur + 0.3).toFixed(2)}/TB[lg];`
    + `[v2][lg]overlay=(W-w)/2:(H-h)/2:eof_action=pass[v];`
    + `[0:a]afade=t=out:st=${(dur - 0.6).toFixed(2)}:d=0.6,apad=whole_dur=${total.toFixed(2)}[aud]`;
  sh("ffmpeg", ["-y", "-loglevel", "error", ...ss, "-i", P("src.mp4"), "-loop", "1", "-framerate", "30", "-t", total.toFixed(2), "-i", LOGO, "-filter_complex", fc, "-map", "[v]", "-map", "[aud]", "-t", total.toFixed(2), "-c:v", "libx264", "-crf", "21", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", base + ".mp4"]);
}
function render() {
  const mode = arg("mode", "all"); const { cues } = rj("captions.json"); const meta = rj("meta.json");
  const gloss = fs.existsSync(P("glossary.json")) ? rj("glossary.json") : {};
  const parts = rj("parts.json"); fs.mkdirSync(P("renders/reels"), { recursive: true });
  if (mode === "full" || mode === "all") {
    const L = geometry("full"); const dur = meta.duration || 600;
    ffrender(L, P(`renders/${slug}_subs`), styles(L) + events(L, cues, 0, dur, gloss), [], dur);
    console.log("[subvideo] full 完了");
  }
  if (mode === "reels" || mode === "all") {
    const L = geometry("reels");
    parts.forEach((p, n) => {
      const a = p.fromIdx ?? cues.findIndex(c => c.eng.startsWith(p.from)), b = p.toIdx ?? cues.findIndex((c, i) => i >= a && c.eng.startsWith(p.to));
      if (a < 0 || b < 0) throw new Error(`parts.json の範囲が見つからない: Part ${n + 1}`);
      const sel = cues.slice(a, b + 1); const t0 = Math.max((a > 0 ? cues[a - 1].end : 0) / 1000, sel[0].start / 1000 - 0.4, 0);
      const dur = sel.at(-1).end / 1000 + 0.6 - t0;
      let ev = `Dialogue: 0,${ts(0)},${ts(dur)},Brand,,0,0,0,,${esc(meta.brand)}\n`;
      if (meta.sub) ev += `Dialogue: 0,${ts(0)},${ts(dur)},Sub,,0,0,0,,${esc(meta.sub)}\n`;
      if (p.label) ev += `Dialogue: 0,${ts(0)},${ts(dur)},Part,,0,0,0,,${esc(p.label)}\n`;
      if (meta.footer) ev += `Dialogue: 0,${ts(0)},${ts(dur)},Foot,,0,0,0,,${esc(meta.footer)}\n`;
      ffrender(L, P(`renders/reels/part${n + 1}`), styles(L) + ev + events(L, sel, t0, dur, gloss), ["-ss", String(t0), "-t", String(dur)], dur);
      console.log(`[subvideo] part${n + 1}: ${t0.toFixed(1)}s +${dur.toFixed(1)}s`);
    });
  }
}

// ---------------- check (DoD) ----------------
function check() {
  let bad = 0; const ok = (c, m, warn = false) => { console.log(`${c ? "✅" : warn ? "⚠️ " : "❌"} ${m}`); if (!c && !warn) bad++; };
  const L = rj("lines.json"), { cues } = rj("captions.json"), rep = rj("align-report.json");
  ok(cues.length > 0, `キュー ${cues.length}本`);
  ok(cues.every((c, i) => i === 0 || c.start >= cues[i - 1].end), "キューが時系列・非重複");
  const ign = rj("meta.json").alignIgnore || [];
  const badLines = rep.stats.filter(s => s.bad && !ign.includes(s.i)).map(s => s.i);
  if (ign.length) console.log(`ℹ️  人が確認済みで除外した行: ${ign.join(",")}（meta.alignIgnore）`);
  ok(badLines.length === 0, `YT字幕/語長との不整合なし（残 ${badLines.length}行: ${badLines.join(",")}）`);
  const med = rep.stats.filter(s => s.ytMedian != null && s.ytN >= 3 && !s.hidden).map(s => Math.abs(s.ytMedian)).sort((a, b) => a - b);
  ok(med.length === 0 || med[Math.floor(med.length * 0.9)] <= 0.3, `YT字幕との差 p90=${med.length ? med[Math.floor(med.length * 0.9)].toFixed(2) : "n/a"}s（≤0.30）`, true);
  const longC = cues.filter(c => (c.end - c.start) > 6500 && c.segments.filter(s => s.s != null).length >= 8);
  ok(longC.length === 0, `長すぎる字幕(>6.5s)なし（${longC.length}本→lines.jsonで分割）`, true);
  const hidden = L.filter(l => !l[1]).length; console.log(`ℹ️  非表示行 ${hidden}（聞き取り不能/掛け合い。字幕の空白になる）`);
  const gl = fs.existsSync(P("glossary.json")) ? rj("glossary.json") : {};
  const orphan = Object.keys(gl).filter(k => !cues.some(c => c.eng.startsWith(k)));
  ok(orphan.length === 0, `glossaryの対応キュー切れなし（${orphan.length}件）`);
  const parts = rj("parts.json"); let over = 0;
  for (let n = 1; n <= parts.length; n++) {
    const f = P(`renders/reels/part${n}.mp4`);
    if (!fs.existsSync(f)) { ok(false, `part${n}.mp4 が無い`); continue; }
    const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height,sample_aspect_ratio:format=duration", "-of", "default=nw=1", f], { encoding: "utf8" }).stdout;
    const g = k => (pr.match(new RegExp(`${k}=(.*)`)) || [])[1];
    const dur = Number(g("duration"));
    ok(g("sample_aspect_ratio") === "1:1" && g("width") === "1080" && g("height") === "1920", `part${n}: 1080x1920 SAR1:1 ${dur.toFixed(0)}s`);
    if (dur > 90) over++;
  }
  ok(over === 0, "全パート90秒以内");
  const full = P(`renders/${slug}_subs.mp4`);
  if (fs.existsSync(full)) { const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=sample_aspect_ratio", "-of", "csv=p=0", full], { encoding: "utf8" }).stdout.trim(); ok(pr === "1:1", "full: SAR 1:1"); }
  console.log(bad ? `\n❌ ${bad}件` : "\n✅ DoD OK"); process.exit(bad ? 1 : 0);
}

({ init, align, build, render, check, run: () => { align(); build(); render(); check(); } }[cmd] || (() => { console.error("unknown cmd"); process.exit(1); }))();
