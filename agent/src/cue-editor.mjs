#!/usr/bin/env node
/**
 * cue-editor.mjs
 * 歌詞動画キューのブラウザエディタ＋YouTube取り込みパイプライン（依存なし・歌詞はstdoutに出さない）。
 * トップページにYouTube URLを貼ると 音源DL→whisper文字起こし→キュー生成 まで自動で走り、そのまま編集できる。
 * 記事(.astro)由来の full-lines.json がある曲は英日対訳キュー、無い曲はwhisper文字起こしキュー（jpnは空欄で人手）。
 * 波形・タップ同期・Undo/Redo・分割/結合・一括ずらし・lint・履歴10世代・SRT・再レンダーは編集画面に集約。
 *
 * Usage: node agent/src/cue-editor.mjs [--slug lose-yourself] [--port 4577]
 *   --slug 省略可。指定するとトップがその曲の編集画面へリダイレクト。
 */
import fs from "fs";
import path from "path";
import http from "http";
import os from "os";
import { spawn, execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { readProdColors, writeProdColors } from "./prod-colors.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT = path.resolve(__dirname, "..");
const ROOT = path.resolve(AGENT, "..");
const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(`--${n}`); if (i !== -1) return args[i + 1]; const kv = args.find(a => a.startsWith(`--${n}=`)); return kv ? kv.split("=")[1] : d; };
const defaultSlug = getArg("slug", null);
const PORT = parseInt(getArg("port", "4577"), 10);

// 画面のコードは起動時に組み立てて配る＝サーバーを再起動しないと反映されない。
// 手書きのバージョンは更新を忘れて嘘をつくので、ソースの更新時刻から必ず自動生成する。
const VER = (() => {
  try {
    const m = fs.statSync(fileURLToPath(import.meta.url)).mtime;
    const p = (n) => String(n).padStart(2, "0");
    return `ver.${String(m.getFullYear()).slice(2)}${p(m.getMonth() + 1)}${p(m.getDate())}-${p(m.getHours())}${p(m.getMinutes())}`;
  } catch { return "ver.?"; }
})();

const WHISPER_MODELS = ["/opt/homebrew/share/whisper-cpp/ggml-medium.en.bin", "/opt/homebrew/share/whisper-cpp/ggml-medium.bin", "/opt/homebrew/share/whisper-cpp/ggml-small.en.bin"];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;
const YT_RE = /^https?:\/\/(www\.)?(youtube\.com\/watch\?|youtu\.be\/|youtube\.com\/shorts\/|music\.youtube\.com\/watch\?)/;

const assetsOf = (slug) => path.join(AGENT, slug, "assets");
const cuesPathOf = (slug) => path.join(assetsOf(slug), "full-cues.json");
const histDirOf = (slug) => path.join(assetsOf(slug), "cue-history");
const hasCues = (slug) => fs.existsSync(cuesPathOf(slug));

function listSongs() {
  const out = [];
  for (const d of fs.readdirSync(AGENT)) {
    if (!SLUG_RE.test(d)) continue;
    if (!hasCues(d)) continue;
    let count = 0, translated = 0;
    try { const c = JSON.parse(fs.readFileSync(cuesPathOf(d), "utf-8")); count = c.length; translated = c.filter(x => (x.jpn || "").trim()).length; } catch {}
    out.push({ slug: d, count, translated, rendered: fs.existsSync(path.join(AGENT, d, "full", "renders", `${d}-full.mp4`)) });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

function backupToHistory(slug) {
  if (!hasCues(slug)) return;
  fs.mkdirSync(histDirOf(slug), { recursive: true });
  const ts = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  fs.copyFileSync(cuesPathOf(slug), path.join(histDirOf(slug), `full-cues.${ts}.json`));
  const files = fs.readdirSync(histDirOf(slug)).filter(f => /^full-cues\..+\.json$/.test(f)).sort();
  while (files.length > 10) fs.unlinkSync(path.join(histDirOf(slug), files.shift()));
}

function toSrtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, "0");
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, "0")}`;
}
function writeSrt(slug) {
  const cues = JSON.parse(fs.readFileSync(cuesPathOf(slug), "utf-8"));
  const mk = (fn) => cues.map((c, i) => `${i + 1}\n${toSrtTime(c.start)} --> ${toSrtTime(c.end)}\n${fn(c)}\n`).join("\n");
  const out = [
    [`${slug}.dual.srt`, mk(c => `${c.eng}\n${c.jpn}`)],
    [`${slug}.en.srt`, mk(c => c.eng)],
    [`${slug}.ja.srt`, mk(c => c.jpn)],
  ];
  for (const [name, body] of out) fs.writeFileSync(path.join(assetsOf(slug), name), body);
  return out.map(([n]) => n);
}

/* ---------- レンダー（曲ごと） ---------- */
const renderStates = new Map();
const renderStateOf = (slug) => renderStates.get(slug) || { running: false, log: "", done: false, ok: false };
function runRender(slug) {
  if (renderStateOf(slug).running) return;
  const st = { running: true, log: "", done: false, ok: false };
  renderStates.set(slug, st);
  const push = (s) => { st.log = (st.log + s).slice(-4000); };
  const step = (cmd, cmdArgs, cwd) => new Promise((res) => {
    const p = spawn(cmd, cmdArgs, { cwd, env: process.env });
    p.stdout.on("data", d => push(String(d).replace(/\r/g, "\n").split("\n").slice(-1)[0]));
    p.stderr.on("data", d => push(String(d).slice(-200)));
    p.on("close", (code) => res(code === 0));
  });
  (async () => {
    push("compose...\n");
    const genArgs = [path.join(AGENT, "src", "gen-full-composition.mjs"), "--slug", slug];
    const metaPath = path.join(assetsOf(slug), "meta.json");
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        if (meta.title) genArgs.push("--title", meta.title);
        if (meta.artist) genArgs.push("--artist", meta.artist);
      } catch {}
    }
    let ok = await step(process.execPath, genArgs, AGENT);
    if (ok) { push("\nrender...\n"); ok = await step("npx", ["hyperframes@0.6.46", "render", ".", "-o", `renders/${slug}-full.mp4`, "--fps", "30"], path.join(AGENT, slug, "full")); }
    st.running = false; st.done = true; st.ok = ok;
    push(ok ? "\n完了\n" : "\n失敗\n");
  })();
}

/* ---------- YouTube取り込みパイプライン ---------- */
let job = { running: false, slug: "", phase: "", log: "", done: false, ok: false, error: "" };
const jpush = (s) => { job.log = (job.log + s).slice(-3000); };
const jstep = (cmd, cmdArgs, cwd) => new Promise((res) => {
  const p = spawn(cmd, cmdArgs, { cwd, env: process.env });
  const tail = (d) => jpush(String(d).replace(/\r/g, "\n").split("\n").filter(Boolean).slice(-1).map(x => x.slice(0, 160) + "\n").join(""));
  p.stdout.on("data", tail); p.stderr.on("data", tail);
  p.on("close", (code) => res(code === 0));
});

function groupWhisperWords(whisperJsonPath) {
  const wj = JSON.parse(fs.readFileSync(whisperJsonPath, "utf-8"));
  const toks = [];
  for (const s of wj.transcription || []) {
    const t = (s.text || "").replace(/\[[^\]]*\]/g, "").trim();
    if (!t) continue;
    toks.push({ w: t, from: (s.offsets?.from ?? 0) / 1000, to: (s.offsets?.to ?? 0) / 1000 });
  }
  const cues = [];
  let cur = null;
  for (const tk of toks) {
    const gap = cur ? tk.from - cur.to : 0;
    const span = cur ? tk.to - cur.start : 0;
    if (!cur || gap > 0.8 || cur.words.length >= 9 || span > 4.2) {
      if (cur) cues.push(cur);
      cur = { words: [tk.w], start: tk.from, to: tk.to };
    } else { cur.words.push(tk.w); cur.to = tk.to; }
  }
  if (cur) cues.push(cur);
  const out = cues.map((c, i) => ({
    eng: c.words.join(" ").replace(/\s+/g, " ").trim(),
    jpn: "",
    start: Math.round(c.start * 100) / 100,
    end: Math.round(Math.max(c.start + 0.6, (i + 1 < cues.length ? Math.min(c.to + 0.6, cues[i + 1].start - 0.03) : c.to + 1)) * 100) / 100,
  })).filter(c => c.eng);
  for (let k = 1; k < out.length; k++) if (out[k].start < out[k - 1].start + 0.12) out[k].start = out[k - 1].start + 0.12;
  return out;
}

function startImport(url, slug, title, artist) {
  job = { running: true, slug, phase: "音源ダウンロード", log: "", done: false, ok: false, error: "" };
  (async () => {
    try {
      const dir = assetsOf(slug);
      fs.mkdirSync(dir, { recursive: true });
      if (title || artist) fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ title: title || slug, artist: artist || "", url }, null, 2));

      // 1) audio
      const mp3 = path.join(dir, "audio-full.mp3");
      if (!fs.existsSync(mp3)) {
        const ok = await jstep("yt-dlp", ["-x", "--audio-format", "mp3", "--no-playlist", "-o", path.join(dir, "audio-full.%(ext)s"), url]);
        if (!ok || !fs.existsSync(mp3)) throw new Error("音源のダウンロードに失敗（URLを確認）");
      } else jpush("音源は取得済み・再利用\n");

      // 2) cover
      job.phase = "ジャケット取得";
      const cover = path.join(dir, "cover.jpg");
      if (!fs.existsSync(cover)) {
        const siteCover = path.join(ROOT, "public", "images", "covers", `${slug}.jpg`);
        if (fs.existsSync(siteCover)) { fs.copyFileSync(siteCover, cover); jpush("サイトのジャケットを流用\n"); }
        else {
          await jstep("yt-dlp", ["--skip-download", "--write-thumbnail", "--convert-thumbnails", "jpg", "--no-playlist", "-o", path.join(dir, "cover"), url]);
          if (!fs.existsSync(cover)) await jstep("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=0x101418:s=600x600", "-frames:v", "1", cover]);
        }
      }

      // 3) whisper
      job.phase = "文字起こし（数分かかります）";
      const whisperJson = path.join(dir, "whisper-words.json");
      if (!fs.existsSync(whisperJson)) {
        const model = WHISPER_MODELS.find(m => fs.existsSync(m));
        if (!model) throw new Error("whisperモデルが見つかりません（brew install whisper-cpp）");
        const wav = path.join(dir, "_whisper16k.wav");
        let ok = await jstep("ffmpeg", ["-y", "-i", mp3, "-ar", "16000", "-ac", "1", wav]);
        if (!ok) throw new Error("wav変換に失敗");
        ok = await jstep("whisper-cli", ["-m", model, "-f", wav, "-ml", "1", "-oj", "-pp", "-of", path.join(dir, "whisper-words")]);
        fs.rmSync(wav, { force: true });
        if (!ok || !fs.existsSync(whisperJson)) throw new Error("文字起こしに失敗");
      } else jpush("文字起こしは取得済み・再利用\n");

      // 4) cues
      job.phase = "キュー生成";
      if (!hasCues(slug)) {
        if (fs.existsSync(path.join(dir, "full-lines.json"))) {
          const ok = await jstep(process.execPath, [path.join(AGENT, "src", "align-and-chunk.mjs"), "--slug", slug, "--whisper", whisperJson], AGENT);
          if (!ok || !hasCues(slug)) throw new Error("アライメントに失敗");
          jpush("記事対訳とアライメントしてキュー生成\n");
        } else {
          const cues = groupWhisperWords(whisperJson);
          if (!cues.length) throw new Error("キューが0件（音源が歌なし？）");
          fs.writeFileSync(cuesPathOf(slug), JSON.stringify(cues, null, 2));
          jpush(`whisper文字起こしから ${cues.length} キュー生成（日本語は編集画面で）\n`);
        }
      } else jpush("既存のキューを保持（再生成したい場合は full-cues.json を消して再実行）\n");

      job.phase = "完了"; job.ok = true;
    } catch (e) {
      job.error = String(e.message || e); jpush(`\nエラー: ${job.error}\n`);
    }
    job.running = false; job.done = true;
  })();
}

/* ---------- 編集画面HTML ---------- */
const editorHtml = (slug) => { const PC = readProdColors(AGENT); return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes"><title>${slug} — cue editor</title>
<style>
:root{color-scheme:dark;--ui-bg:#0d0f13;--ui-accent:#b9ff2e;--prod-en:${PC.en};--prod-jp:${PC.jp}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:radial-gradient(120% 60% at 50% -10%,color-mix(in srgb,var(--ui-bg) 78%,#ffffff 16%) 0%,var(--ui-bg) 45%) fixed;color:#e8e8ea;font:14px/1.5 -apple-system,"Hiragino Sans",sans-serif}
header{position:sticky;top:0;z-index:9;background:#12151b;border-bottom:1px solid #262b36;padding:10px 16px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
button{background:#232935;color:#e8e8ea;border:1px solid #39414f;border-radius:8px;padding:7px 12px;cursor:pointer;font-size:13px}
button:hover{background:#2e3646}
button.p{background:var(--ui-accent);color:#111;border-color:var(--ui-accent);font-weight:700;box-shadow:0 0 14px color-mix(in srgb,var(--ui-accent) 40%,transparent)}
#theme-pop{position:absolute;right:16px;top:44px;z-index:30;background:#151a22;border:1px solid #2f3846;border-radius:12px;padding:14px;display:none;gap:10px;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.5);width:220px}
#theme-pop.on{display:flex}
#theme-pop label{font-size:12px;color:#9fb0c8;display:flex;justify-content:space-between;align-items:center;gap:10px}
#theme-pop input[type=color]{width:44px;height:30px;padding:0;border:1px solid #39414f;border-radius:6px;background:none;cursor:pointer}
.th-grp-title{font-size:10px;color:#6b7a90;letter-spacing:.5px;margin-top:4px;padding-top:8px;border-top:1px solid #232a36}
.th-grp-title:first-child{margin-top:0;padding-top:0;border-top:none}
.th-status{font-size:11px;color:#8fc3ff;min-height:14px}
button:disabled{opacity:.4;cursor:default}
select,input.flt{background:#171b23;border:1px solid #2a3140;color:#e8e8ea;border-radius:8px;padding:6px 8px;font:inherit}
input.flt{width:150px}
a.home{color:#8fa3bd;text-decoration:none;font-size:13px}
#ver{font-size:10px;color:#7a8aa0;padding:2px 6px;border:1px solid #2a3140;border-radius:6px;font-variant-numeric:tabular-nums;white-space:nowrap}
#wovr{display:block;width:100%;height:44px;border-radius:8px;margin-top:8px;cursor:pointer;background:#0e1219;touch-action:none}
#wzwrap{position:relative;margin-top:6px}
#wzoom{display:block;width:100%;height:96px;border-radius:8px;background:#0e1219;touch-action:none;cursor:crosshair}
#wzbtns{position:absolute;right:6px;top:6px;display:flex;gap:6px}
#wzbtns button{padding:2px 9px;font-size:15px;background:rgba(20,25,34,.85)}
#preview{background:linear-gradient(rgba(0,0,0,.74),rgba(0,0,0,.74)),url("cover.jpg") center/cover;border-radius:12px;padding:16px;text-align:center;margin:8px 0 0}
#pv-en{font-size:26px;font-weight:800;color:var(--prod-en);min-height:34px;text-shadow:0 2px 12px rgba(0,0,0,.7)}
#pv-en .seg{opacity:0;transition:opacity .24s ease-out}
#pv-en .seg.on{opacity:1}
#pv-jp{font-size:17px;color:var(--prod-jp);margin-top:6px;min-height:24px;text-shadow:0 2px 10px rgba(0,0,0,.7)}
#t{font-variant-numeric:tabular-nums;font-size:16px;color:#9fb0c8;min-width:64px}
table{border-collapse:collapse;width:100%}
td{border-bottom:1px solid #1e222b;padding:4px 6px;vertical-align:middle}
tr.on{background:#1b2230}
tr.sel td{background:#243049}
tr.rc0{background:rgba(94,200,255,.10)}
tr.rc1{background:rgba(224,123,224,.10)}
input,textarea{background:#171b23;border:1px solid #2a3140;color:#e8e8ea;border-radius:6px;padding:5px 7px;width:100%;font:inherit}
textarea{resize:none;white-space:pre;overflow-x:auto;overflow-y:hidden;line-height:1.35;display:block}
input.num{width:82px;font-variant-numeric:tabular-nums;text-align:right}
td.times{display:flex;gap:6px;width:190px}
td.acts{white-space:nowrap;width:196px}
.en textarea{font-weight:600}
.jp textarea{color:var(--ui-accent)}
.jp textarea:placeholder-shown{border-color:#2a3d14}
.mini.sc{font-size:12px;font-variant-numeric:tabular-nums;min-width:34px}
.mini.sc.big{color:var(--ui-accent);font-weight:700}
.mini.big{color:#ffd24a}
.mini{background:none;border:none;color:#8fa3bd;padding:3px 5px;font-size:15px}
.mini:hover{color:#fff;background:#2a3140}
#log{white-space:pre-wrap;color:#8fa3bd;font-size:12px;max-height:72px;overflow:auto;margin-top:4px}
kbd{background:#232935;border:1px solid #39414f;border-radius:4px;padding:1px 5px;font-size:12px}
.hint{color:#8fa3bd;font-size:12px}
.modalmask{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:20;display:none;align-items:center;justify-content:center;padding:16px}
.modalmask.on{display:flex}
.modalbox{background:#151a22;border:1px solid #2f3846;border-radius:14px;padding:18px;max-width:900px;width:100%;max-height:92vh;overflow:auto}
.modalbox h3{margin:0 0 4px;font-size:15px}
.modalbox .sub{color:#8fa3bd;font-size:12px;margin-bottom:12px}
.chips{display:flex;flex-wrap:wrap;align-items:center;gap:0;background:#0e1219;border:1px solid #262d3a;border-radius:10px;padding:10px;margin-bottom:14px}
.chip{padding:6px 3px;font-size:19px;white-space:pre}
.chips.jp .chip{font-size:20px;color:var(--ui-accent)}
.cut{width:16px;height:34px;margin:0 -1px;border-radius:5px;cursor:pointer;position:relative;flex:none}
.cut::after{content:"";position:absolute;left:50%;top:6px;bottom:6px;width:2px;transform:translateX(-50%);background:#39414f;border-radius:2px}
.cut.ok::after{background:#4d6b8f}
.cut:hover::after{background:#8fa3bd}
.cut.on::after{background:var(--ui-accent);width:4px}
.cut.ng::after{background:#3a2b2b}
.cut.gap::after{background:#e6a54d;width:3px;box-shadow:0 0 6px rgba(230,165,77,.7)}
.cut.gap.on::after{background:var(--ui-accent)}
.pv{background:#000;border-radius:10px;padding:12px;margin-bottom:6px}
.pv .l{display:flex;gap:10px;align-items:baseline;padding:5px 0;border-bottom:1px solid #1c222c}
.pv .l:last-child{border:0}
.pv .n{color:#6b7a90;font-size:12px;width:56px;font-variant-numeric:tabular-nums}
.pv .e{color:var(--prod-en);font-weight:700}.pv .j{color:var(--prod-jp);font-size:13px}
.fxrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:7px 0;border-bottom:1px solid #1c222c}
.fxrow:last-of-type{border:0}
.fxg{color:#fff;font-weight:700;flex:1;min-width:120px}
.fxt{color:#6b7a90;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.fxctr{display:flex;gap:4px;flex-wrap:wrap;width:100%;margin-top:2px}
.tap{cursor:pointer}
.tap:active{opacity:.6}
.lintItem{display:flex;gap:10px;align-items:center;padding:8px 6px;border-bottom:1px solid #1e242f;cursor:pointer;border-radius:8px}
.lintItem:hover{background:#1d2431}
.lintItem .b{font-size:11px;padding:2px 8px;border-radius:99px;flex:none}
.b.err{background:#4a2626;color:#ff9d9d}.b.wrn{background:#2a3d14;color:var(--ui-accent)}.b.inf{background:#1f3448;color:#8fc3ff}
.histItem{display:flex;gap:10px;align-items:center;padding:8px 6px;border-bottom:1px solid #1e242f}
#bar-m{display:none}
.only-m{display:none}
@media (max-width:820px){
  header{padding:6px 8px}
  button{padding:9px 12px;font-size:14px}
  .only-m{display:inline-flex}
  .mini{font-size:22px;padding:8px 10px}
  .hint{display:none}
  #pv-en{font-size:18px}#pv-jp{font-size:14px}
  body{overflow-x:hidden;padding-bottom:96px}
  /* 折りたたみ: 既定は最小構成（上段ボタン＋ズーム波形のみ） */
  #topbar{gap:6px;flex-wrap:nowrap}
  #topbar button{padding:8px 10px;font-size:14px;flex:none}
  #topbar #t{font-size:13px;min-width:52px}
  .lbl{display:none}
  #tools{display:none;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid #232a36}
  body.tools-on #tools{display:flex}
  #wovr{display:none;height:26px;margin-top:6px}
  #preview{display:none;padding:8px;margin-top:6px}
  body.wave-on #wovr{display:block}
  body.wave-on #preview{display:block}
  #wzwrap{margin-top:6px}
  #wzoom{height:104px}
  #wzbtns button{padding:4px 10px}
  #log{max-height:34px;margin-top:2px}
  #log:empty{display:none}
  #hdmenu.on,#hdwave.on{background:#3a4a63;border-color:#5b6f90}
  table,tbody,tr,td{display:block;width:auto}
  tr{border:1px solid #232a36;border-radius:12px;margin:7px 8px;padding:6px;background:#141922}
  tr.on{background:#1d2634;border-color:#3a4a63}
  tr.sel{outline:2px solid var(--ui-accent);box-shadow:0 0 12px color-mix(in srgb,var(--ui-accent) 30%,transparent)}
  td{border:0;padding:2px 4px}
  td:first-child{color:#6b7a90;font-size:11px;padding:0 4px}
  td.times{display:flex;gap:8px;width:auto}
  td.acts{width:auto;display:flex;justify-content:space-between;padding-top:2px}
  input.num{width:100%;font-size:16px;padding:6px 8px}
  input{font-size:16px;padding:7px 8px}
  .mini{font-size:20px;padding:4px 8px}
  input.flt{width:110px}
  #bar-m{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:15;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:rgba(14,17,23,.94);border-top:1px solid #2a3140;backdrop-filter:blur(10px)}
  #bar-m button{flex:1;padding:13px 0;font-size:15px}
  #mb-sync{flex:1.6;background:var(--ui-accent);color:#111;font-weight:800;border-color:var(--ui-accent);box-shadow:0 0 14px color-mix(in srgb,var(--ui-accent) 40%,transparent)}
}
</style>
<script>(function(){try{var b=localStorage.getItem('ce-bg'),a=localStorage.getItem('ce-accent'),r=document.documentElement.style;if(b)r.setProperty('--ui-bg',b);if(a)r.setProperty('--ui-accent',a);}catch(e){}})();</script>
</head><body>
<header>
  <div class="row" id="topbar">
    <a class="home" href="../../">◀<span class="lbl"> 曲一覧</span></a>
    <span id="ver" title="配信中の画面コードの更新時刻。サーバー再起動まで古いまま">${VER}</span>
    <button class="p" id="play">再生</button>
    <span id="t">0.00s</span>
    <button id="undo" title="元に戻す (⌘Z)">↩</button><button id="redo" title="やり直す (⌘⇧Z)">↪</button>
    <button class="only-m" id="hdwave" title="全体波形とプレビュー">〜</button>
    <button class="only-m" id="hdmenu" title="道具">≡</button>
    <span style="flex:1"></span>
    <button id="themeBtn" title="背景色・アクセント色・本番字幕色を変える">🎨</button>
    <button id="save" class="p">保存<span class="lbl"> (⌘S)</span></button>
  </div>
  <div id="theme-pop">
    <div class="th-grp-title">エディタ画面（この端末だけ）</div>
    <label>背景 <input type="color" id="th-bg"></label>
    <label>アクセント <input type="color" id="th-accent"></label>
    <button id="th-reset">リセット</button>
    <div class="th-grp-title">本番の字幕色（全曲共通・次回レンダーから反映）</div>
    <label>英語字幕 <input type="color" id="th-prod-en"></label>
    <label>日本語字幕 <input type="color" id="th-prod-jp"></label>
    <button id="th-prod-reset">本番色をリセット</button>
    <div class="th-status" id="th-prod-status"></div>
  </div>
  <div class="row" id="tools">
    <button data-nudge="-5">◀5s</button><button data-nudge="5">5s▶</button>
    <select id="rate"><option value="1">1x</option><option value="0.75">0.75x</option><option value="0.5">0.5x</option></select>
    <label style="font-size:13px"><input type="checkbox" id="loop" style="width:auto"> 行ループ</label>
    <button id="lintBtn">チェック</button>
    <button id="shiftBtn">⇧ ずらす</button>
    <button id="histBtn">履歴</button>
    <input class="flt" id="flt" placeholder="検索…">
    <span style="flex:1"></span>
    <button id="srt">SRT</button>
    <button id="render">再生成＋レンダー</button>
    <button onclick="location.href='reel/'">縦型リール ▶</button>
  </div>
  <canvas id="wovr"></canvas>
  <div id="wzwrap">
    <canvas id="wzoom"></canvas>
    <div id="wzbtns"><button id="zin">＋</button><button id="zout">−</button></div>
  </div>
  <div id="preview"><div id="pv-en"></div><div id="pv-jp"></div></div>
  <div class="row hint" style="margin-top:6px">
    <span><kbd>Space</kbd> 再生/停止</span><span><kbd>S</kbd> タップ同期（選択行のstart=現在位置→次行へ）</span>
    <span><kbd>↑↓</kbd> 行選択</span><span><kbd>←→</kbd> ±0.05s（Shiftで±0.2s）</span><span><kbd>Enter</kbd> 行頭から再生</span>
    <span><kbd>⌘Z</kbd> 元に戻す</span><span>波形: 選択中の行が見えていればどこをドラッグしてもその行が動く（旗も直接掴める）/ 選択行が見えない場所は左右ドラッグで頭出し・ピンチで拡大</span>
    <label style="margin-left:auto"><input type="checkbox" id="chain" checked style="width:auto"> endを次のstartに自動追従</label>
  </div>
  <div id="log"></div>
</header>
<table id="tb"></table>
<audio id="au" src="audio.mp3" preload="auto"></audio>
<div id="bar-m">
  <button id="mb-play">再生</button>
  <button id="mb-back">−0.05</button>
  <button id="mb-sync">● SYNC</button>
  <button id="mb-fwd">＋0.05</button>
  <button id="mb-rate">1x</button>
</div>
<div id="mask" class="modalmask"><div class="modalbox">
  <h3 id="m-title">行の分割</h3>
  <div class="row" style="margin:0 0 8px">
    <button id="m-mode-split" class="p">分割（別のキューに分ける）</button>
    <button id="m-mode-br">⏎ 改行（同じキューの中で折り返す）</button>
    <button id="m-mode-fx">⏱ 間で魅せる（時間差表示）</button>
  </div>
  <div class="sub" id="m-sub">切りたい位置の｜をタップ（もう一度タップで解除）。青い｜＝語の切れ目として安全な位置。時間は文字数で自動配分し、あとから ◎ や波形で微調整できます。</div>
  <div class="chips en" id="m-en"></div>
  <div class="chips jp" id="m-jp"></div>
  <div class="pv" id="m-pv"></div>
  <div class="row" style="margin-top:12px">
    <button id="m-autogap" title="実際の発声の「間」で切る">◇ 間で切る</button>
    <button id="m-auto2">おまかせ2</button>
    <button id="m-auto3">おまかせ3</button>
    <button id="m-clear">解除</button>
    <button id="m-fx-auto" style="display:none" title="この行の手動設定を消し、自動判定に戻す">自動に戻す</button>
    <button id="m-ignore-gap" style="display:none" title="この行の自動ギャップを無視して一括表示にする">ギャップ無視</button>
    <span style="flex:1"></span>
    <button id="m-cancel">やめる</button>
    <button class="p" id="m-ok">分割する</button>
  </div>
</div></div>
<div id="shiftM" class="modalmask"><div class="modalbox" style="max-width:480px">
  <h3>まとめてずらす</h3>
  <div class="sub">全体が一様にズレている時に。開始・終了の両方を動かします。</div>
  <div class="row">
    <button data-sa="-0.5">−0.5</button><button data-sa="-0.2">−0.2</button><button data-sa="-0.05">−0.05</button>
    <input class="num" id="sh-amt" value="0.2" style="width:90px">
    <button data-sa="0.05">＋0.05</button><button data-sa="0.2">＋0.2</button><button data-sa="0.5">＋0.5</button>
  </div>
  <div class="row" style="margin-top:12px">
    <label><input type="radio" name="sh-scope" value="all" checked style="width:auto"> 全体</label>
    <label><input type="radio" name="sh-scope" value="after" style="width:auto"> 選択行から後ろ</label>
    <span style="flex:1"></span>
    <button id="sh-cancel">やめる</button>
    <button class="p" id="sh-ok">適用</button>
  </div>
</div></div>
<div id="lintM" class="modalmask"><div class="modalbox" style="max-width:560px">
  <h3>チェック結果</h3>
  <div class="sub">タップでその行へ移動します。</div>
  <div id="lintList"></div>
  <div class="row" style="margin-top:12px"><span style="flex:1"></span><button id="lint-close">閉じる</button></div>
</div></div>
<div id="histM" class="modalmask"><div class="modalbox" style="max-width:560px">
  <h3>保存履歴（直近10件）</h3>
  <div class="sub">保存するたびに直前の状態がここに残ります。戻すと今の状態も履歴に退避されます。</div>
  <div id="histList"></div>
  <div class="row" style="margin-top:12px"><span style="flex:1"></span><button id="hist-close">閉じる</button></div>
</div></div>
<script>
const au = document.getElementById('au');
const $ = (id) => document.getElementById(id);
function hexToRgb(h){ h=(h||'#b9ff2e').replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join(''); const n=parseInt(h,16); return [n>>16&255,n>>8&255,n&255]; }
function curAccent(){ return getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim() || '#b9ff2e'; }
function accentRgba(a){ const [r,g,b]=hexToRgb(curAccent()); return 'rgba('+r+','+g+','+b+','+a+')'; }
function hexToRgba(h,a){ const [r,g,b]=hexToRgb(h); return 'rgba('+r+','+g+','+b+','+a+')'; }
// 行ごとの色（波形のバーとテーブルの行を同じ色でシンクロ＝エクセルのシマシマと同じ発想）
const ZEBRA = ['#5ec8ff','#e07be0'];
function rowColor(i){ return ZEBRA[i%2]; }
(function initTheme(){
  const root = document.documentElement.style;
  const bgIn = $('th-bg'), accIn = $('th-accent');
  const applied = { bg: localStorage.getItem('ce-bg') || '#0d0f13', accent: localStorage.getItem('ce-accent') || '#b9ff2e' };
  bgIn.value = applied.bg; accIn.value = applied.accent;
  $('themeBtn').onclick = (e) => { e.stopPropagation(); $('theme-pop').classList.toggle('on'); };
  document.addEventListener('click', (e) => { if (!$('theme-pop').contains(e.target) && e.target!==$('themeBtn')) $('theme-pop').classList.remove('on'); });
  bgIn.oninput = () => { root.setProperty('--ui-bg', bgIn.value); localStorage.setItem('ce-bg', bgIn.value); };
  accIn.oninput = () => { root.setProperty('--ui-accent', accIn.value); localStorage.setItem('ce-accent', accIn.value); zoomDirty = true; };
  $('th-reset').onclick = () => {
    root.removeProperty('--ui-bg'); root.removeProperty('--ui-accent');
    localStorage.removeItem('ce-bg'); localStorage.removeItem('ce-accent');
    bgIn.value = '#0d0f13'; accIn.value = '#b9ff2e'; zoomDirty = true;
  };
  // 本番の字幕色（サーバー保存・全曲共通。次回のレンダーから反映）
  const prodEnIn = $('th-prod-en'), prodJpIn = $('th-prod-jp'), prodStatus = $('th-prod-status');
  const cs = getComputedStyle(document.documentElement);
  prodEnIn.value = cs.getPropertyValue('--prod-en').trim() || '#ffffff';
  prodJpIn.value = cs.getPropertyValue('--prod-jp').trim() || '#ffd24a';
  let prodSaveT = null;
  function prodPreview(){ root.setProperty('--prod-en', prodEnIn.value); root.setProperty('--prod-jp', prodJpIn.value); }
  function prodSave(){
    clearTimeout(prodSaveT);
    prodSaveT = setTimeout(() => {
      prodStatus.textContent = '保存中…';
      fetch('/theme', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ en: prodEnIn.value, jp: prodJpIn.value }) })
        .then(r => r.json()).then(() => { prodStatus.textContent = '保存しました（次回レンダーから反映）'; setTimeout(() => prodStatus.textContent = '', 2500); })
        .catch(() => { prodStatus.textContent = '保存に失敗しました'; });
    }, 400);
  }
  prodEnIn.oninput = () => { prodPreview(); prodSave(); };
  prodJpIn.oninput = () => { prodPreview(); prodSave(); };
  $('th-prod-reset').onclick = () => {
    fetch('/theme', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ en: '#ffffff', jp: '#ffd24a' }) })
      .then(r => r.json()).then(j => { prodEnIn.value = j.en; prodJpIn.value = j.jp; prodPreview(); prodStatus.textContent = '保存しました（次回レンダーから反映）'; setTimeout(() => prodStatus.textContent = '', 2500); });
  };
})();
let cues = [], sel = 0, dirty = false;
let playRow = -1; // 行の再生ボタンで最後に対象にした行。波形タップ等でselだけ変わっても、同じ行のボタンを押す限りは頭に戻さず今の位置でトグルする
let hist = [], redoS = [], lastPush = { tag: '', t: 0 };
const f2 = (n) => Math.round(n*100)/100;
// currentTime設定直後にplay()すると、シーク先が未バッファ（回線が遅い/Tailscale経由等）の時に
// 古い位置から再生が始まって字幕表示とズレる。seekedを待ってから再生する。
let seekToken = 0;
function seekPlay(el, t){
  const target = Math.max(0, t), myToken = ++seekToken;
  const start = () => { if (myToken === seekToken) el.play(); };
  if (el.readyState >= 2 && Math.abs(el.currentTime - target) < 0.05) { start(); return; }
  const onSeeked = () => { el.removeEventListener('seeked', onSeeked); start(); };
  el.addEventListener('seeked', onSeeked);
  el.currentTime = target;
}
const log = (s) => $('log').textContent = s;
const snap = () => JSON.parse(JSON.stringify(cues));
const DRAFT_KEY = 'cue-draft-${slug}';
// サーバー側 full-cues.json の更新時刻。これより古い下書きは復元させない
const CUES_MTIME = ${(() => { try { return Math.round(fs.statSync(cuesPathOf(slug)).mtimeMs); } catch { return 0; } })()};

function pushHist(tag){
  const now = Date.now();
  if (tag && tag === lastPush.tag && now - lastPush.t < 1500) { lastPush.t = now; return; }
  hist.push(snap()); if (hist.length > 100) hist.shift();
  redoS = []; lastPush = { tag: tag || '', t: now }; updUndoBtns();
}
function undo(){ if(!hist.length) return; redoS.push(snap()); cues = hist.pop(); dirty = true; draw(); zoomDirty = true; log('元に戻しました'); updUndoBtns(); saveDraft(); }
function redoF(){ if(!redoS.length) return; hist.push(snap()); cues = redoS.pop(); dirty = true; draw(); zoomDirty = true; log('やり直しました'); updUndoBtns(); saveDraft(); }
function updUndoBtns(){ $('undo').disabled = !hist.length; $('redo').disabled = !redoS.length; }
$('undo').onclick = ()=>undo();
$('redo').onclick = ()=>redoF();

let draftT = null;
function saveDraft(){
  clearTimeout(draftT);
  draftT = setTimeout(()=>{ try{ localStorage.setItem(DRAFT_KEY, JSON.stringify({t:Date.now(),cues})); }catch(e){} }, 700);
}
function markDirty(){ dirty = true; log('未保存の変更あり'); saveDraft(); }

fetch('cues.json').then(r=>r.json()).then(c=>{
  cues = c;
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && d.cues && JSON.stringify(d.cues) !== JSON.stringify(c)) {
      // キューを作り直した後に古い下書きを復元すると、作り直しが台無しになる。
      // サーバー側のfull-cues.jsonの方が新しければ下書きは捨てる（聞かない）。
      if (d.t < CUES_MTIME) {
        localStorage.removeItem(DRAFT_KEY);
        log('この端末に残っていた古い下書きは破棄しました（サーバー側でキューが作り直されています）');
      } else {
        const when = new Date(d.t);
        if (confirm('未保存の下書きがあります（' + when.getHours() + ':' + String(when.getMinutes()).padStart(2,'0') + ' 時点・' + d.cues.length + 'キュー）。復元しますか？\\n「キャンセル」でサーバーの保存済み版を開きます。')) {
          cues = d.cues; dirty = true;
        } else localStorage.removeItem(DRAFT_KEY);
      }
    }
  } catch(e){}
  draw(); stats(); updUndoBtns(); zoomDirty = true;
});

/* ---------- フォースドアライメント単語秒（gap分割の土台） ---------- */
let FAW = null;           // 全単語を平坦化した [{w,s,e}]（絶対秒）
const GAP_TH = 0.30;      // これ以上の語間無音を「間」とみなす
fetch('fa-words.json').then(r=>r.json()).then(w=>{
  if(!w) return;
  FAW = [];
  for(const line of w) for(const x of (line||[])) FAW.push(x);
  log('単語アライメント読込（' + FAW.length + '語）: 分割は実発声タイミングで切れます');
}).catch(()=>{});
const normW = (s) => (s||'').toLowerCase().replace(/[^a-z0-9']/g,'').replace(/'/g,'');
// cueの語列に一致するFAWの連続区間を、開始秒が c.start に最も近い箇所で返す（反復歌詞にも強い）
function cueWordTimes(c){
  if(!FAW) return null;
  const want = (c.eng||'').toLowerCase().replace(/[^a-z0-9' ]/g,' ').split(/\\s+/).map(normW).filter(Boolean);
  if(!want.length) return null;
  const F = FAW, n = want.length;
  let best=-1, bestD=1e9;
  for(let i=0;i+n<=F.length;i++){
    let ok=true;
    for(let k=0;k<n;k++){ if(normW(F[i+k].w)!==want[k]){ ok=false; break; } }
    if(ok){ const d=Math.abs(F[i].s-c.start); if(d<bestD){bestD=d;best=i;} }
  }
  if(best<0) return null;
  return F.slice(best,best+n).map(x=>({s:x.s,e:x.e}));
}

function stats(){
  if(!cues.length) return;
  const d = cues.map(x=>x.end-x.start).sort((a,b)=>a-b);
  const noJp = cues.filter(x=>!(x.jpn||'').trim()).length;
  log(cues.length + 'キュー / 表示 中央値 ' + d[d.length>>1].toFixed(2) + 's・最短 ' + d[0].toFixed(2) + 's' + (noJp?' / 日本語未入力 '+noJp+'行':'') + (dirty ? ' / 未保存の変更あり' : ''));
}

/* ---------- 波形 ---------- */
let pcm = null, psr = 8000, ovrCv = null, ZW = 8, zoomDirty = true, lastZoomT = -1;
let dur = 0;
au.addEventListener('loadedmetadata', ()=>{ dur = au.duration; });
(function loadWave(){
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  fetch('audio.mp3').then(r=>r.arrayBuffer()).then(b=>new AC().decodeAudioData(b)).then(ab=>{
    const ch = ab.getChannelData(0);
    const stride = Math.max(1, Math.floor(ab.sampleRate/8000));
    pcm = new Float32Array(Math.floor(ch.length/stride));
    for (let i=0;i<pcm.length;i++) pcm[i] = ch[i*stride];
    psr = ab.sampleRate/stride; dur = ab.duration;
    buildOvr(); zoomDirty = true;
  }).catch(e=>{ log('波形の読み込みに失敗（編集は可能）'); });
})();
const dpr = window.devicePixelRatio || 1;
const COARSE = matchMedia('(pointer:coarse)').matches;
function fitCanvas(cv){ const w = cv.clientWidth, h = cv.clientHeight; if(cv.width!==w*dpr||cv.height!==h*dpr){cv.width=w*dpr;cv.height=h*dpr;} return [w,h]; }
function buildOvr(){
  const cv = $('wovr'); const [W,H] = fitCanvas(cv);
  ovrCv = document.createElement('canvas'); ovrCv.width = W*dpr; ovrCv.height = H*dpr;
  const g = ovrCv.getContext('2d'); g.scale(dpr,dpr);
  g.fillStyle = '#0e1219'; g.fillRect(0,0,W,H);
  if (!pcm) return;
  const bucket = pcm.length / W;
  g.fillStyle = '#3d5a7a';
  for (let x=0;x<W;x++){
    let mn=0,mx=0;
    const s0=Math.floor(x*bucket), s1=Math.min(pcm.length,Math.floor((x+1)*bucket));
    for (let s=s0;s<s1;s+=2){ const v=pcm[s]; if(v>mx)mx=v; if(v<mn)mn=v; }
    const y0=H/2-mx*H*0.48, y1=H/2-mn*H*0.48;
    g.fillRect(x, y0, 1, Math.max(1,y1-y0));
  }
}
function drawOvr(){
  const cv = $('wovr'); const [W,H] = fitCanvas(cv);
  if (!W || !H) return;
  const g = cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
  if (ovrCv && ovrCv.width && ovrCv.height) g.drawImage(ovrCv,0,0,W,H); else { g.fillStyle='#0e1219'; g.fillRect(0,0,W,H); }
  if (!dur) return;
  const t = au.currentTime;
  const wx0 = Math.max(0,(t-ZW/2)/dur*W), wx1 = Math.min(W,(t+ZW/2)/dur*W);
  g.fillStyle = accentRgba(0.12); g.fillRect(wx0,0,wx1-wx0,H);
  g.fillStyle = '#fff'; g.fillRect(t/dur*W-0.5,0,1.5,H);
}
function drawZoom(){
  const cv = $('wzoom'); const [W,H] = fitCanvas(cv);
  const g = cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
  g.fillStyle = '#0e1219'; g.fillRect(0,0,W,H);
  const ctr = au.currentTime, t0 = ctr - ZW/2;
  if (pcm){
    g.fillStyle = '#4d759e';
    for (let x=0;x<W;x++){
      const s0=Math.floor((t0+x/W*ZW)*psr), s1=Math.floor((t0+(x+1)/W*ZW)*psr);
      if (s1<0||s0>=pcm.length) continue;
      let mn=0,mx=0;
      for (let s=Math.max(0,s0);s<Math.min(pcm.length,s1);s++){ const v=pcm[s]; if(v>mx)mx=v; if(v<mn)mn=v; }
      const y0=H/2-mx*H*0.46, y1=H/2-mn*H*0.46;
      g.fillRect(x,y0,1,Math.max(1,y1-y0));
    }
  }
  const hw = COARSE ? 12 : 8, hh = COARSE ? 22 : 16;
  // 全行の帯（行ごとの色）: 隣の行と見分けがつき、直前の行の終了位置も波形上に残るように
  for (let i=0;i<cues.length;i++){
    const c = cues[i];
    const sx=(c.start-t0)/ZW*W, ex=(c.end-t0)/ZW*W;
    if (ex<0 || sx>W) continue;
    g.fillStyle = i===sel ? accentRgba(0.16) : hexToRgba(rowColor(i), 0.11);
    g.fillRect(Math.max(0,sx), 0, Math.min(W,ex)-Math.max(0,sx), H);
  }
  for (let i=0;i<cues.length;i++){
    const c = cues[i], isSel = i===sel, col = isSel ? curAccent() : rowColor(i);
    // 開始（上向き旗）: 行ごとの色。選択行だけアクセント色＋光彩で強調
    const s = c.start;
    if (s>=t0-0.2 && s<=t0+ZW+0.2){
      const x = (s-t0)/ZW*W;
      g.shadowColor = accentRgba(.9); g.shadowBlur = isSel ? 10 : 0;
      g.fillStyle = col;
      g.fillRect(x-(isSel?1.5:1),hh,isSel?3:2,H-hh);
      g.beginPath(); g.moveTo(x-hw,2); g.lineTo(x+hw,2); g.lineTo(x,hh); g.closePath(); g.fill();
      g.shadowBlur = 0;
      g.font = 'bold '+(COARSE?'15px':'12px')+' sans-serif'; g.textAlign='center';
      g.fillStyle = '#0d0f13'; g.fillText(String(i+1), x, hh-(COARSE?5:3));
    }
    // 終了（下向き旗）: 全行ぶん常に表示＝直前の行の終わりも見える。選択行はオレンジ＋光彩
    const e = c.end;
    if (e>=t0-0.2 && e<=t0+ZW+0.2){
      const x = (e-t0)/ZW*W;
      const ecol = isSel ? '#ff9b3d' : col;
      g.shadowColor = 'rgba(255,155,61,.9)'; g.shadowBlur = isSel ? 10 : 0;
      g.fillStyle = ecol;
      g.fillRect(x-(isSel?1.5:1), 0, isSel?3:2, H-hh);
      g.beginPath(); g.moveTo(x-hw,H-2); g.lineTo(x+hw,H-2); g.lineTo(x,H-hh); g.closePath(); g.fill();
      g.shadowBlur = 0;
      if (isSel){
        g.font = 'bold '+(COARSE?'12px':'9px')+' sans-serif'; g.textAlign='center'; g.fillStyle='#1a1004';
        g.fillText('終', x, H-(COARSE?5:4));
      }
    }
  }
  g.shadowBlur = 0; g.fillStyle = '#fff'; g.fillRect(W/2-0.75,0,1.5,H);
}
$('zin').onclick = ()=>{ ZW = Math.max(2, ZW/2); zoomDirty = true; };
$('zout').onclick = ()=>{ ZW = Math.min(32, ZW*2); zoomDirty = true; };
let ovrDrag = false;
function ovrSeek(e){
  if (!dur) return;
  const r = $('wovr').getBoundingClientRect();
  au.currentTime = Math.max(0, Math.min(dur, (e.clientX-r.left)/r.width*dur)); zoomDirty = true;
}
$('wovr').addEventListener('pointerdown', e=>{ ovrDrag = true; $('wovr').setPointerCapture(e.pointerId); ovrSeek(e); });
$('wovr').addEventListener('pointermove', e=>{ if(ovrDrag) ovrSeek(e); });
addEventListener('pointerup', ()=>{ ovrDrag = false; });

function selectCue(i, opts){
  sel = i; paint(); zoomDirty = true;
  if (cues[i] && !(opts && opts.keepTime)) au.currentTime = cues[i].start;
}
let drag = null;
const pinch = new Map();
let pinchBase = null;
$('wzoom').addEventListener('pointerdown', e=>{
  const cv = $('wzoom'); const r = cv.getBoundingClientRect();
  const W = r.width, x = e.clientX-r.left;
  pinch.set(e.pointerId, x);
  if (pinch.size === 2){
    const v = [...pinch.values()];
    pinchBase = { d: Math.max(12, Math.abs(v[0]-v[1])), ZW };
    drag = null; return;
  }
  const t0 = au.currentTime - ZW/2;
  const R = e.pointerType === 'mouse' ? 16 : 28;
  const y = e.clientY - r.top;
  const upper = y <= r.height*0.45;
  // 上半分＝開始の旗、下半分＝終了の旗を探す。どの行も直接つかめる（行ごとに色が違うので隣の旗と混同しない）
  let best = -1, bd = R;
  for (let i=0;i<cues.length;i++){
    const t = upper ? cues[i].start : cues[i].end;
    if (t<t0-0.2||t>t0+ZW+0.2) continue;
    const px = (t-t0)/ZW*W, d = Math.abs(px-x);
    if (d<bd){ bd=d; best=i; }
  }
  cv.setPointerCapture(e.pointerId);
  if (best>=0){
    sel = best; paint(); zoomDirty = true;
    drag = { i:best, t0, W, moved:false, endMode: !upper };
    if(navigator.vibrate) navigator.vibrate(8);
    return;
  }
  // 旗を外した位置。選択中の行がこの表示範囲にあれば「掴んでぐりぐり動かす」対象にする。
  // 動かさず離せば従来通りタップでシーク（judgeはpointermoveで初移動時に決定）。
  const selVisible = sel>=0 && cues[sel] && cues[sel].start>=t0-0.05 && cues[sel].start<=t0+ZW+0.05;
  drag = { ambiguous:true, selMode:selVisible, i:sel, t0, W, x0:x, lastX:x, moved:false, histPushed:false };
});
$('wzoom').addEventListener('pointermove', e=>{
  const r = $('wzoom').getBoundingClientRect();
  const x = e.clientX-r.left;
  if (pinch.has(e.pointerId)) pinch.set(e.pointerId, x);
  if (pinch.size === 2 && pinchBase){
    const v = [...pinch.values()];
    const d = Math.max(12, Math.abs(v[0]-v[1]));
    ZW = Math.max(2, Math.min(32, pinchBase.ZW * pinchBase.d / d));
    zoomDirty = true; return;
  }
  if (!drag) return;
  if (drag.ambiguous){
    if (!drag.moved && Math.abs(x-drag.x0) > 3) drag.moved = true;
    if (drag.moved){
      if (drag.selMode){
        if (!drag.histPushed){ pushHist('drag'+drag.i); drag.histPushed = true; }
        setStart(drag.i, Math.max(0, drag.t0 + x/drag.W*ZW));
      } else {
        // フィルムを指で送る感覚: 左へドラッグ＝時間が進む
        au.currentTime = Math.max(0, Math.min(dur||1e9, au.currentTime - (x-drag.lastX)/drag.W*ZW));
      }
      zoomDirty = true;
    }
    drag.lastX = x; return;
  }
  if (!drag.moved){ pushHist('drag'+drag.i); drag.moved = true; }
  if (drag.endMode) setEnd(drag.i, drag.t0 + x/drag.W*ZW);
  else setStart(drag.i, Math.max(0, drag.t0 + x/drag.W*ZW));
  zoomDirty = true;
});
addEventListener('pointerup', e=>{
  pinch.delete(e.pointerId);
  if (pinch.size < 2) pinchBase = null;
  if (drag && drag.ambiguous && !drag.moved){
    au.currentTime = Math.max(0, drag.t0 + drag.x0/drag.W*ZW); zoomDirty = true;
  }
  drag = null;
});
addEventListener('pointercancel', e=>{ pinch.delete(e.pointerId); pinchBase = null; drag = null; });

/* ---------- テーブル ---------- */
function draw(){
  const tb = $('tb');
  tb.innerHTML = '';
  const q = ($('flt').value||'').toLowerCase();
  cues.forEach((c,i)=>{
    const tr = document.createElement('tr'); tr.id='r'+i;
    if (q && !((c.eng+' '+c.jpn).toLowerCase().includes(q))) tr.style.display='none';
    const warn = (typeof c.conf==='number' && c.conf<0.6);
    const sc = (typeof c.scale==='number' && c.scale>0) ? c.scale : 1;
    tr.innerHTML = '<td style="color:'+(warn?'#ffb057':'#6b7a90')+';width:38px" title="'+(warn?('要確認 conf='+c.conf.toFixed(2)+(c.flags?' / '+c.flags.join(' '):'')):'')+'">'+(warn?'⚠':'')+(i+1)+'</td>'
      + '<td class="times"><input class="num" data-k="start" data-i="'+i+'" value="'+f2(c.start)+'">'
      + '<input class="num" data-k="end" data-i="'+i+'" value="'+f2(c.end)+'"></td>'
      + '<td class="en"><textarea wrap="off" rows="1" data-k="eng" data-i="'+i+'"></textarea></td>'
      + '<td class="jp"><textarea wrap="off" rows="1" data-k="jpn" data-i="'+i+'" placeholder="日本語訳…"></textarea></td>'
      + '<td class="acts">'
      + '<button class="mini" data-act="play" data-i="'+i+'" title="この行から再生">再生</button>'
      + '<button class="mini" data-act="here" data-i="'+i+'" title="現在位置をstartに">◎</button>'
      + '<button class="mini sc'+(sc!==1?' big':'')+'" data-act="scale" data-i="'+i+'" title="文字サイズ（クリックで拡大→一周で等倍・⇧クリックで縮小）">'+sc.toFixed(2).replace(/0$/,'')+'x</button>'
      + '<button class="mini'+(Array.isArray(c.stagger)?' big':'')+'" data-act="split" data-i="'+i+'" title="この行を分割／改行／時間差表示'+(Array.isArray(c.stagger)?'（時間差表示を手動固定済み）':'')+'">分割</button>'
      + '<button class="mini" data-act="merge" data-i="'+i+'" title="次の行と結合">⤵</button>'
      + '<button class="mini" data-act="del" data-i="'+i+'" title="行を削除">✕</button></td>';
    tb.appendChild(tr);
    const ta = tr.querySelector('[data-k=eng]'), tj = tr.querySelector('[data-k=jpn]');
    ta.value = c.eng; tj.value = c.jpn;
    autoGrow(ta); autoGrow(tj);
    tr.addEventListener('mousedown', e=>{ if(!e.target.closest('button,textarea,input')) selectCue(i); });
  });
  paint();
}
// 改行の数だけ行を増やす（scrollHeight計測はテーブル内で暴発するので使わない）
function autoGrow(el){ if(!el) return; el.rows = Math.min(6, (el.value.match(/\\n/g)||[]).length + 1); }
// 改行を <br> として描く（textContent経由なのでHTMLは混入しない）
function putTx(host, s){
  host.innerHTML='';
  String(s==null?'':s).split('\\n').forEach((part,k)=>{
    if(k) host.appendChild(document.createElement('br'));
    host.appendChild(document.createTextNode(part));
  });
}
const SCALES = [1, 1.15, 1.3, 1.5, 1.8];
$('flt').addEventListener('input', ()=>draw());
let preEdit = null;
$('tb').addEventListener('focusin', e=>{ if(e.target.dataset && e.target.dataset.k) preEdit = snap(); });
$('tb').addEventListener('change', e=>{
  if (e.target.dataset && e.target.dataset.k && preEdit){
    hist.push(preEdit); if(hist.length>100)hist.shift(); redoS=[]; preEdit=null; updUndoBtns();
  }
});
$('tb').addEventListener('input', e=>{
  const i=+e.target.dataset.i, k=e.target.dataset.k; if(k===undefined) return;
  cues[i][k] = (k==='start'||k==='end') ? parseFloat(e.target.value)||0 : e.target.value;
  if(e.target.tagName==='TEXTAREA') autoGrow(e.target);
  delete cues[i].conf; delete cues[i].flags;   // 人が触った行＝確認済み。⚠を落とす
  markDirty(); zoomDirty = true;
});
$('tb').addEventListener('click', e=>{
  const b=e.target.closest('button[data-act]'); if(!b) return;
  const i=+b.dataset.i, a=b.dataset.act;
  if(a==='play'){
    // 「同じ行のボタンを続けて押しているか」で判定（波形タップ等でselだけ変わっても頭に戻らないように、selではなくplayRowを使う）
    if(playRow===i){ sel=i; if(au.paused) au.play(); else au.pause(); zoomDirty=true; } // 同じ行→頭に戻さず今の位置で再生/一時停止をトグル
    else { playRow=i; sel=i; seekPlay(au, cues[i].start-0.4); zoomDirty=true; }         // 別の行→頭から
  }
  if(a==='here'){ pushHist(); setStart(i, au.currentTime); }
  if(a==='merge' && i<cues.length-1){
    pushHist();
    const n=cues[i+1];
    cues[i]={eng:(cues[i].eng+' '+n.eng).trim(), jpn:(cues[i].jpn+n.jpn).trim(), start:cues[i].start, end:n.end};
    cues.splice(i+1,1); markDirty(); draw(); zoomDirty=true;
  }
  if(a==='del'){ pushHist(); cues.splice(i,1); markDirty(); draw(); zoomDirty=true; }
  if(a==='split'){ openSplit(i); }
  if(a==='scale'){
    pushHist();
    const cur = (typeof cues[i].scale==='number' && cues[i].scale>0) ? cues[i].scale : 1;
    let k = SCALES.findIndex(v=>Math.abs(v-cur)<0.001);
    if(k<0) k = 0;
    k = e.shiftKey ? (k-1+SCALES.length)%SCALES.length : (k+1)%SCALES.length;
    if(SCALES[k]===1) delete cues[i].scale; else cues[i].scale = SCALES[k];
    // 全描画すると入力欄のフォーカスとスクロールが飛ぶので、このボタンだけ更新する
    b.textContent = SCALES[k].toFixed(2).replace(/0$/,'')+'x';
    b.className = 'mini sc'+(SCALES[k]!==1?' big':'');
    markDirty(); paint();
  }
});

/* ---------- 行の分割 ---------- */
const isKata=(c)=>/[゠-ヿ]/.test(c), isKanji=(c)=>/[一-鿿]/.test(c), isHira=(c)=>/[぀-ゟ]/.test(c), isLat=(c)=>/[A-Za-z0-9']/.test(c);
const NG_PREV="のなにはがをでとへもっーゃゅょ、・「『（【“‘", NG_NEXT="、。ーっゃゅょ！？」』）】…・”’";
function safeJp(s,b){
  if(b<=0||b>=s.length) return false;
  const p=s[b-1], q=s[b];
  if(p==='、') return true;
  if(NG_PREV.includes(p)||NG_NEXT.includes(q)) return false;
  if(isKata(p)&&isKata(q)) return false;
  if(isLat(p)&&isLat(q)) return false;
  if(isKanji(p)&&isKanji(q)) return false;
  if(isHira(q)) return false;
  return true;
}
let M={i:-1, ew:[], jc:[], ecuts:new Set(), jcuts:new Set()};
const FUNC_W = new Set("a an the and or but of for to in on at with my your his her its it is i'm i'ma so no now yo".split(' '));
const STAGGER_GAP_TH = 0.35; // gen-full-composition.mjs の既定閾値と揃える（自動判定のプレビュー用）
function openSplit(i){
  const c=cues[i];
  // 既に入っている改行は「区切り位置の選択状態」として復元する（BRマーカーで一旦持ち上げる）
  const BR='\\u0001';
  const etok=c.eng.replace(/\\n/g,' '+BR+' ').split(/[ \\t]+/).filter(Boolean);
  const ew=etok.filter(w=>w!==BR);
  const jcAll=[...c.jpn];
  const jc=jcAll.filter(ch=>ch!=='\\n');
  const wt=cueWordTimes(c);
  const hasBr=(c.eng+c.jpn).indexOf('\\n')>=0;
  M={i, ew, jc, ecuts:new Set(), jcuts:new Set(), wt:(wt&&wt.length===ew.length)?wt:null, mode:hasBr?'br':'split', partT:{}};
  M.hasAutoGap = autoStaggerCuts().length>0;
  if(hasBr){
    let k=0; for(const w of etok){ if(w===BR){ if(k>0&&k<ew.length) M.ecuts.add(k); } else k++; }
    let j=0; for(const ch of jcAll){ if(ch==='\\n'){ if(j>0&&j<jc.length) M.jcuts.add(j); } else j++; }
  }
  setMode(M.mode); $('mask').classList.add('on');
}
function setMode(m){
  M.mode=m;
  $('m-mode-split').className = m==='split'?'p':'';
  $('m-mode-br').className = m==='br'?'p':'';
  $('m-mode-fx').className = m==='fx'?'p':'';
  $('m-fx-auto').style.display = m==='fx'?'':'none';
  $('m-ignore-gap').style.display = (m==='split'&&M.hasAutoGap)?'':'none';
  $('m-autogap').style.display = m==='br'?'none':'';
  $('m-autogap').textContent = m==='fx' ? '◇ 間で選び直す（'+STAGGER_GAP_TH+'s基準）' : '◇ 間で切る';
  $('m-auto2').style.display = $('m-auto3').style.display = m==='fx'?'none':'';
  if(m==='fx'){
    // fx専用: ecutsをこの行の「現在有効な」時間差カット位置で初期化する
    // （手動設定済みならそれを、無ければ自動判定＝FA語間ギャップで再現）
    const c=cues[M.i];
    M.ecuts=new Set(Array.isArray(c.stagger) ? c.stagger : autoStaggerCuts());
    M.fxManual = Array.isArray(c.stagger);
    // 語インデックス→実測秒（手動固定）。無指定の位置は自動判定(FA語頭秒)のまま
    M.staggerT = (c.staggerT && typeof c.staggerT==='object' && !Array.isArray(c.staggerT)) ? {...c.staggerT} : {};
    // 日本語訳が出る秒（絶対秒・手動固定）。キー'jp'固定の1要素オブジェクトでbuildTimeCtrを使い回す
    M.jpT = (typeof c.jpT==='number') ? {jp:c.jpT} : {};
  }
  $('m-title').textContent = m==='br'?'行の改行':m==='fx'?'間で魅せる（時間差表示）':'行の分割';
  $('m-ok').textContent = m==='br'?'改行する':m==='fx'?'この位置で確定':'分割する';
  $('m-sub').textContent = m==='br'
    ? '折り返したい位置の｜をタップ。キューは1つのまま、表示だけ2行以上に分かれます（時間は変わりません）。解除ですべての改行を消せます。'
    : m==='fx'
    ? '文字が遅れて現れる位置の｜をタップ。青い｜＝実際に間がある位置（'+STAGGER_GAP_TH+'s以上・未設定ならここが自動採用されます）。「この位置で確定」で固定、「自動に戻す」でこの行の手動設定を消す、｜を全部消して確定すると常に一括表示になります。'
    : '切りたい位置の｜をタップ（もう一度タップで解除）。青い｜＝語の切れ目として安全な位置。時間は文字数で自動配分し、あとから ◎ や波形で微調整できます。';
  renderSplit();
}
function autoStaggerCuts(){
  if(!M.wt) return [];
  const cut=[];
  for(let k=1;k<M.wt.length;k++) if(M.wt[k].s-M.wt[k-1].e>STAGGER_GAP_TH) cut.push(k);
  return cut;
}
// 日本語訳が出る秒の自動判定（gen-full-composition.mjsのafter-en相当をJS側で近似）。
// 実際のレンダーの最終判定はgen-full-composition.mjs側。ここは編集画面での目安表示・ナッジ起点用
function jpAutoTime(c){
  const REVEAL_DUR=0.24, minT=c.start+0.2, maxT=Math.max(minT, c.end-0.3);
  const segs=staggerSegs(c);
  let base;
  if(segs && segs.length>1) base=segs[segs.length-1].revealT+REVEAL_DUR*0.7;
  else {
    const wt=cueWordTimes(c);
    base = (wt && wt.length) ? wt[wt.length-1].s : c.start+(c.end-c.start)*0.35;
    base = Math.min(base, c.start+0.7);
  }
  return Math.min(Math.max(base,minT), maxT);
}
$('m-mode-split').onclick=()=>setMode('split');
$('m-mode-br').onclick=()=>setMode('br');
$('m-mode-fx').onclick=()=>setMode('fx');
$('m-fx-auto').onclick=()=>{
  pushHist();
  delete cues[M.i].stagger;
  delete cues[M.i].staggerT;
  markDirty();
  $('mask').classList.remove('on'); draw(); zoomDirty=true;
  log('行'+(M.i+1)+'の時間差表示を自動判定に戻しました');
};
// fx/split/jp共通: 「試聴→耳で聴きながらここ！で固定」用のミニボタン列
// store=保存先('en'=M.staggerT/'part'=M.partT/'jp'=M.jpT), wIdx=保存キー, baseT=今表示されている実効秒
function mkTimeBtn(fx,label,store,wIdx,baseT,title){
  const b=document.createElement('button'); b.className='mini'; b.dataset.fx=fx; b.dataset.store=store; b.dataset.w=wIdx;
  if(baseT!=null) b.dataset.base=baseT;
  b.textContent=label; if(title) b.title=title; return b;
}
function buildTimeCtr(store,wIdx,baseT,manual){
  const ctr=document.createElement('span'); ctr.className='fxctr';
  ctr.appendChild(mkTimeBtn('play','再生',store,wIdx,baseT,'少し手前から試聴'));
  ctr.appendChild(mkTimeBtn('stop','停止',store,wIdx,baseT,'停止'));
  ctr.appendChild(mkTimeBtn('here','ここ!',store,wIdx,baseT,'今の再生位置をここに固定'));
  ctr.appendChild(mkTimeBtn('m1','−1',store,wIdx,baseT));
  ctr.appendChild(mkTimeBtn('m01','−0.1',store,wIdx,baseT));
  ctr.appendChild(mkTimeBtn('p01','＋0.1',store,wIdx,baseT));
  ctr.appendChild(mkTimeBtn('p1','＋1',store,wIdx,baseT));
  if(typeof manual==='number') ctr.appendChild(mkTimeBtn('reset','自動に戻す',store,wIdx,baseT,'この位置だけ自動判定に戻す'));
  return ctr;
}
function renderSplit(){
  const en=$('m-en'), jp=$('m-jp');
  const gapTh = M.mode==='fx' ? STAGGER_GAP_TH : GAP_TH;
  en.innerHTML=''; jp.innerHTML='';
  M.ew.forEach((w,k)=>{
    if(k>0){ const big = M.wt && (M.wt[k].s - M.wt[k-1].e) > gapTh;
      const d=document.createElement('div'); d.className='cut '+(M.mode==='fx'?(big?'ok gap':'ng'):'ok'+(big?' gap':''))+(M.ecuts.has(k)?' on':''); d.dataset.e=k;
      if(M.wt) d.title=Math.round((M.wt[k].s-M.wt[k-1].e)*1000)+'msの間'; en.appendChild(d); }
    const s=document.createElement('div'); s.className='chip'; s.textContent=w; en.appendChild(s);
  });
  if(M.mode==='fx'){
    jp.style.display='none';
    const c=cues[M.i];
    const bounds=[0,...[...M.ecuts].sort((a,b)=>a-b),M.ew.length];
    const groups=[]; for(let k=0;k<bounds.length-1;k++) groups.push(M.ew.slice(bounds[k],bounds[k+1]).join(' '));
    const state = M.ecuts.size===0 ? '（0箇所＝この行は一括表示）'
      : Array.isArray(c.stagger) ? '（手動固定 '+M.ecuts.size+'箇所）'
      : '（自動判定と同じ '+M.ecuts.size+'箇所・未確定）';
    const host=$('m-pv'); host.innerHTML='';
    const head=document.createElement('div'); head.className='l';
    head.innerHTML='<div class="n">現在の設定</div>';
    host.appendChild(head);
    groups.forEach((g,n)=>{
      const wIdx=bounds[n];
      const row=document.createElement('div'); row.className='fxrow';
      const gEl=document.createElement('span'); gEl.className='fxg'; gEl.textContent=(n+1)+'. '+g; row.appendChild(gEl);
      const tEl=document.createElement('span'); tEl.className='fxt';
      if(n===0){ tEl.textContent='（行の頭と同時）'; row.appendChild(tEl); }
      else {
        const auto=(M.wt && M.wt[wIdx]) ? M.wt[wIdx].s : null;
        const manual=M.staggerT[wIdx];
        const eff=(typeof manual==='number') ? manual : auto;
        tEl.textContent = eff==null ? '（秒不明）' : f2(eff)+'s'+(typeof manual==='number'?' ・実測':' ・自動');
        row.appendChild(tEl);
        row.appendChild(buildTimeCtr('en', wIdx, eff, manual));
        // 文字（グループ）自体をタップしても手前から試聴できる（小さいボタンを狙わなくていい）
        if(eff!=null){ gEl.classList.add('tap'); gEl.addEventListener('click', ()=>seekPlay(au, Math.max(0,eff-0.4))); }
      }
      host.appendChild(row);
    });
    const note=document.createElement('div'); note.className='note'; note.textContent=state;
    host.appendChild(note);
    // 日本語訳の出現タイミング（英語の時間差表示とは独立に固定できる）
    const jpManual=M.jpT.jp;
    const jpAuto=jpAutoTime(c);
    const jpEff=(typeof jpManual==='number') ? jpManual : jpAuto;
    const jrow=document.createElement('div');
    jrow.className='fxrow';
    const jgEl=document.createElement('span'); jgEl.className='fxg tap'; jgEl.textContent='日本語訳';
    jgEl.addEventListener('click', ()=>seekPlay(au, Math.max(0,jpEff-0.4)));
    const jtEl=document.createElement('span'); jtEl.className='fxt';
    jtEl.textContent=f2(jpEff)+'s'+(typeof jpManual==='number'?' ・実測':' ・自動');
    jrow.appendChild(jgEl); jrow.appendChild(jtEl);
    jrow.appendChild(buildTimeCtr('jp', 'jp', jpEff, jpManual));
    host.appendChild(jrow);
    return;
  }
  const js=M.jc.join('');
  M.jc.forEach((ch,k)=>{
    if(k>0){ const ok=safeJp(js,k); const d=document.createElement('div');
      d.className='cut '+(ok?'ok':'ng')+(M.jcuts.has(k)?' on':''); d.dataset.j=k; jp.appendChild(d); }
    const s=document.createElement('div'); s.className='chip'; s.textContent=ch; jp.appendChild(s);
  });
  jp.style.display = M.jc.length ? '' : 'none';
  if(M.mode==='br'){
    const c=cues[M.i], b=brText();
    $('m-pv').innerHTML='<div class="l"><div class="n">'+f2(c.start)+'s</div><div><div class="e"></div><div class="j"></div></div></div>';
    const l=$('m-pv').querySelector('.l');
    putTx(l.querySelector('.e'), b.eng); putTx(l.querySelector('.j'), b.jpn);
    return;
  }
  const parts=buildParts();
  const eb=[0,...[...M.ecuts].sort((a,b)=>a-b),M.ew.length];
  const host=$('m-pv'); host.innerHTML='';
  parts.forEach((p,n)=>{
    const wIdx=eb[n];
    const manual = n>0 ? M.partT[wIdx] : undefined;
    const row=document.createElement('div'); row.className='l';
    const nEl=document.createElement('div'); nEl.className='n';
    nEl.textContent=f2(p.start)+'s'+(typeof manual==='number'?' ・実測':(n>0?' ・自動':''));
    row.appendChild(nEl);
    const body=document.createElement('div');
    const eDiv=document.createElement('div'); eDiv.className='e'; eDiv.textContent=p.eng; body.appendChild(eDiv);
    const jDiv=document.createElement('div'); jDiv.className='j'; putTx(jDiv,p.jpn); body.appendChild(jDiv);
    if(n>0) body.appendChild(buildTimeCtr('part', wIdx, p.start, manual));
    row.appendChild(body);
    // 行（テキスト部分）自体をタップしても手前から試聴できる（ボタンを狙わなくていい）
    if(n>0){ body.classList.add('tap'); body.addEventListener('click', e=>{ if(e.target.closest('button'))return; seekPlay(au, Math.max(0,p.start-0.4)); }); }
    host.appendChild(row);
  });
}
// 選んだ位置に改行を入れた1キュー分のテキスト
function brText(){
  const eb=[0,...[...M.ecuts].sort((a,b)=>a-b),M.ew.length];
  const jb=[0,...[...M.jcuts].sort((a,b)=>a-b),M.jc.length];
  const eng=[],jpn=[];
  for(let k=0;k<eb.length-1;k++) eng.push(M.ew.slice(eb[k],eb[k+1]).join(' '));
  for(let k=0;k<jb.length-1;k++) jpn.push(M.jc.slice(jb[k],jb[k+1]));
  return { eng:eng.filter(Boolean).join('\\n'), jpn:jpn.map(a=>a.join('')).filter(Boolean).join('\\n') };
}
function buildParts(){
  const c=cues[M.i];
  const eb=[0,...[...M.ecuts].sort((a,b)=>a-b),M.ew.length];
  const jb=[0,...[...M.jcuts].sort((a,b)=>a-b),M.jc.length];
  const K=Math.max(eb.length,jb.length)-1;
  const eng=[],jpn=[];
  for(let k=0;k<K;k++){
    eng.push(eb[k]!==undefined&&eb[k+1]!==undefined?M.ew.slice(eb[k],eb[k+1]).join(' '):'');
    jpn.push(jb[k]!==undefined&&jb[k+1]!==undefined?M.jc.slice(jb[k],jb[k+1]).join(''):'');
  }
  const out=[];
  if(M.wt){
    // 実単語秒でboundary時刻を決める（孤立先頭語は次語へ寄せる）
    for(let k=0;k<K;k++){
      let head=eb[k]??0; const stop=(eb[k+1]??M.ew.length)-1;
      while(head<stop && M.wt[head+1] && (M.wt[head+1].s-M.wt[head].e)>GAP_TH) head++;
      const ov = (k>0 && M.partT && typeof M.partT[eb[k]]==='number') ? M.partT[eb[k]] : null;
      const st = k===0 ? c.start : (ov!=null ? ov : f2(M.wt[head] ? M.wt[head].s : c.start));
      out.push({eng:eng[k],jpn:jpn[k],start:st,end:0});
    }
    for(let k=0;k<out.length-1;k++) out[k].end=out[k+1].start;
    out[out.length-1].end=f2(c.end);
    for(let k=1;k<out.length;k++) if(out[k].start<=out[k-1].start) out[k].start=f2(out[k-1].start+0.2);
  } else {
    const tot=eng.reduce((a,x)=>a+x.length,0)||1;
    const span=Math.max(0.8,c.end-c.start); let acc=0;
    for(let k=0;k<K;k++){
      const stAuto=c.start+span*acc/tot; acc+=eng[k].length;
      const ov = (k>0 && M.partT && typeof M.partT[eb[k]]==='number') ? M.partT[eb[k]] : null;
      const st = k===0 ? f2(stAuto) : (ov!=null ? ov : f2(stAuto));
      out.push({eng:eng[k],jpn:jpn[k],start:st,end:f2(c.start+span*acc/tot)});
    }
    if(out.length) out[out.length-1].end=f2(c.end);
  }
  return out;
}
function autoSplit(K){
  M.ecuts=new Set(); M.jcuts=new Set();
  const js=M.jc.join('');
  for(let k=1;k<K;k++){
    const ei=Math.round(M.ew.length*k/K); if(ei>0&&ei<M.ew.length) M.ecuts.add(ei);
    if(!M.jc.length) continue;
    const ideal=Math.round(M.jc.length*k/K);
    let best=null;
    for(let d=0;d<=Math.max(4,Math.round(M.jc.length*0.3));d++){
      for(const q of (d===0?[ideal]:[ideal-d,ideal+d])) if(q>0&&q<M.jc.length&&safeJp(js,q)&&!M.jcuts.has(q)){ best=q; break; }
      if(best!=null) break;
    }
    if(best!=null) M.jcuts.add(best);
  }
  renderSplit();
}
$('m-en').addEventListener('click',e=>{ const d=e.target.closest('.cut'); if(!d)return;
  const k=+d.dataset.e; M.ecuts.has(k)?M.ecuts.delete(k):M.ecuts.add(k); renderSplit(); });
$('m-jp').addEventListener('click',e=>{ const d=e.target.closest('.cut'); if(!d)return;
  const k=+d.dataset.j; M.jcuts.has(k)?M.jcuts.delete(k):M.jcuts.add(k); renderSplit(); });
// fx: 遅れて出る語群の実測秒を手動固定（自動判定のFA語頭秒がズレている時用）
$('m-pv').addEventListener('click',e=>{
  const b=e.target.closest('button[data-fx]'); if(!b) return;
  const w=b.dataset.w, a=b.dataset.fx, sel=b.dataset.store;
  const base=b.dataset.base!==undefined && b.dataset.base!=='' ? +b.dataset.base : null;
  const store = sel==='jp' ? M.jpT : sel==='part' ? M.partT : M.staggerT;
  if(!store) return;
  if(a==='play'){ if(base!=null) seekPlay(au, Math.max(0,base-0.4)); return; }
  if(a==='stop'){ au.pause(); return; }
  if(a==='here'){ store[w]=f2(au.currentTime); renderSplit(); return; }
  if(a==='m1'){ store[w]=f2((base!=null?base:0)-1); renderSplit(); return; }
  if(a==='p1'){ store[w]=f2((base!=null?base:0)+1); renderSplit(); return; }
  if(a==='m01'){ store[w]=f2((base!=null?base:0)-0.1); renderSplit(); return; }
  if(a==='p01'){ store[w]=f2((base!=null?base:0)+0.1); renderSplit(); return; }
  if(a==='reset'){ delete store[w]; renderSplit(); return; }
});
$('m-autogap').onclick=()=>{
  if(!M.wt){ log('この行は単語アライメント未取得（間で分割は使えません）'); return; }
  if(M.mode==='fx'){ M.ecuts=new Set(autoStaggerCuts()); renderSplit(); return; }
  const cut=new Set();
  for(let k=1;k<M.ew.length;k++) if(M.wt[k].s-M.wt[k-1].e>GAP_TH) cut.add(k);
  for(const k of [...cut]) if(FUNC_W.has((M.ew[k-1]||'').toLowerCase().replace(/[^a-z']/g,'')) && k>1){ cut.delete(k); cut.add(k-1); }
  M.ecuts=cut;
  // 日本語も語数ぶんの位置へ概ね割る（安全境界へスナップ）
  M.jcuts=new Set(); const js=M.jc.join('');
  if(M.jc.length){ const K=cut.size+1; for(let n=1;n<K;n++){ const ideal=Math.round(M.jc.length*n/K); for(let d=0;d<=Math.max(4,Math.round(M.jc.length*0.3));d++){ let hit=null; for(const q of (d===0?[ideal]:[ideal-d,ideal+d])) if(q>0&&q<M.jc.length&&safeJp(js,q)&&!M.jcuts.has(q)){hit=q;break;} if(hit!=null){M.jcuts.add(hit);break;} } } }
  renderSplit();
};
$('m-auto2').onclick=()=>autoSplit(2);
$('m-auto3').onclick=()=>autoSplit(3);
$('m-clear').onclick=()=>{ M.ecuts=new Set(); M.jcuts=new Set(); renderSplit(); };
$('m-ignore-gap').onclick=()=>{
  pushHist();
  cues[M.i].stagger=[];
  markDirty();
  $('mask').classList.remove('on'); draw(); zoomDirty=true;
  log('行'+(M.i+1)+'の自動ギャップを無視しました。この行は常に一括表示になります（再生成で反映）');
};
$('m-cancel').onclick=()=>$('mask').classList.remove('on');
$('m-ok').onclick=()=>{
  if(M.mode==='fx'){
    pushHist();
    const cuts=[...M.ecuts].sort((a,b)=>a-b);
    cues[M.i].stagger=cuts;   // []も明示的に保存＝この行は強制で一括表示
    const keepT={}; let tCount=0;
    for(const k of cuts) if(typeof M.staggerT[k]==='number'){ keepT[k]=M.staggerT[k]; tCount++; }
    if(tCount) cues[M.i].staggerT=keepT; else delete cues[M.i].staggerT;
    if(typeof M.jpT.jp==='number') cues[M.i].jpT=M.jpT.jp; else delete cues[M.i].jpT;
    markDirty();
    $('mask').classList.remove('on'); draw(); zoomDirty=true;
    log(M.ecuts.size ? '行'+(M.i+1)+'の時間差表示を'+M.ecuts.size+'箇所に固定しました'+(tCount?'（うち実測'+tCount+'箇所）':'')+(typeof M.jpT.jp==='number'?' / 訳の表示秒も固定':'')+'（再生成で反映）' : '行'+(M.i+1)+'は時間差表示なし（一括表示）に固定しました（再生成で反映）');
    return;
  }
  if(M.mode==='br'){
    const b=brText();
    pushHist();
    cues[M.i].eng=b.eng; cues[M.i].jpn=b.jpn; markDirty();
    $('mask').classList.remove('on'); draw(); zoomDirty=true;
    log(M.ecuts.size+M.jcuts.size ? '行'+(M.i+1)+'に改行を入れました' : '行'+(M.i+1)+'の改行を外しました');
    return;
  }
  const parts=buildParts();
  if(parts.length<2){ alert('切る位置を1つ以上えらんでください'); return; }
  pushHist();
  cues.splice(M.i,1,...parts); markDirty();
  $('mask').classList.remove('on'); draw(); zoomDirty=true;
};

/* ---------- まとめてずらす ---------- */
$('shiftBtn').onclick=()=>$('shiftM').classList.add('on');
$('sh-cancel').onclick=()=>$('shiftM').classList.remove('on');
document.querySelectorAll('[data-sa]').forEach(b=>b.onclick=()=>{ $('sh-amt').value=b.dataset.sa; });
$('sh-ok').onclick=()=>{
  const amt=parseFloat($('sh-amt').value)||0;
  if(!amt){ $('shiftM').classList.remove('on'); return; }
  const scope=document.querySelector('[name=sh-scope]:checked').value;
  const from=scope==='after'?sel:0;
  pushHist();
  for(let i=from;i<cues.length;i++){ cues[i].start=f2(Math.max(0,cues[i].start+amt)); cues[i].end=f2(Math.max(0.4,cues[i].end+amt)); }
  markDirty(); draw(); zoomDirty=true;
  $('shiftM').classList.remove('on');
  log((scope==='after'?('行'+(sel+1)+'以降'):'全体')+'を '+(amt>0?'+':'')+amt+'s ずらしました');
};

/* ---------- チェック(lint) ---------- */
const FLAGJP={'no-fa':'強制アライメント無し(推定秒)','word-too-short':'語が短すぎ＝整列が怪しい','word-too-long':'語が長すぎ＝整列が怪しい','zero-dur':'語の長さが0','single-word':'1語だけ','model-unsure':'分割/訳にモデルが自信なし'};
function flagLabel(f){ return FLAGJP[f] || (/^inner-gap-/.test(f) ? '行内に長い無音('+f.slice(10)+')' : /^span-/.test(f) ? '1行が長すぎる('+f.slice(5)+')' : f); }
function lint(){
  const out=[];
  for(let i=0;i<cues.length;i++){
    const c=cues[i], d=c.end-c.start;
    if(typeof c.conf==='number' && c.conf<0.6) out.push({i,lv:'wrn',msg:'要確認 conf='+c.conf.toFixed(2)+(c.flags&&c.flags.length?'（'+c.flags.map(flagLabel).join('・')+'）':'')});
    if(i>0 && c.start < cues[i-1].end-0.01) out.push({i,lv:'err',msg:'前の行と時間が重なっている'});
    if(d<0.6) out.push({i,lv:'wrn',msg:'表示が短い('+d.toFixed(2)+'s)'});
    if(i>0 && c.start-cues[i-1].end>3) out.push({i,lv:'inf',msg:'前の行との間に '+(c.start-cues[i-1].end).toFixed(1)+'s の空白'});
    if(/^[、。ーっゃゅょ]/.test(c.jpn) || /^[぀-ゟ]、/.test(c.jpn)) out.push({i,lv:'wrn',msg:'日本語が語の途中から始まっている可能性'});
    if(c.eng.split(/\\s+/).length>12) out.push({i,lv:'inf',msg:'英語が長い('+c.eng.split(/\\s+/).length+'語)・分割を検討'});
    if(!c.eng.trim()) out.push({i,lv:'err',msg:'英語が空'});
    if(!(c.jpn||'').trim()) out.push({i,lv:'inf',msg:'日本語が未入力'});
  }
  return out;
}
$('lintBtn').onclick=()=>{
  const issues=lint();
  const list=$('lintList');
  if(!issues.length){ list.innerHTML='<div style="padding:14px;color:#7fd98f">問題なし</div>'; }
  else {
    list.innerHTML='';
    issues.forEach(it=>{
      const d=document.createElement('div'); d.className='lintItem';
      const lb={err:'重大',wrn:'注意',inf:'情報'}[it.lv];
      d.innerHTML='<span class="b '+it.lv+'">'+lb+'</span><span style="color:#9fb0c8">行'+(it.i+1)+'</span><span></span>';
      d.lastElementChild.textContent=it.msg;
      d.onclick=()=>{ selectCue(it.i); $('lintM').classList.remove('on');
        const tr=$('r'+it.i); if(tr) tr.scrollIntoView({block:'center'}); };
      list.appendChild(d);
    });
  }
  $('lintM').classList.add('on');
};
$('lint-close').onclick=()=>$('lintM').classList.remove('on');

/* ---------- 保存履歴 ---------- */
$('histBtn').onclick=()=>{
  fetch('history').then(r=>r.json()).then(items=>{
    const list=$('histList');
    if(!items.length){ list.innerHTML='<div style="padding:14px;color:#8fa3bd">まだ履歴がありません（保存すると増えます）</div>'; }
    else {
      list.innerHTML='';
      items.forEach(it=>{
        const d=document.createElement('div'); d.className='histItem';
        d.innerHTML='<span style="flex:1">'+it.label+'</span><span style="color:#8fa3bd">'+it.count+'キュー</span><button data-f="'+it.file+'">これに戻す</button>';
        d.querySelector('button').onclick=()=>{
          if(!confirm(it.label+' の状態に戻しますか？（今の状態は履歴に退避されます）')) return;
          fetch('restore',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({file:it.file})})
            .then(r=>r.json()).then(j=>{
              if(j.cues){ pushHist(); cues=j.cues; dirty=false; localStorage.removeItem(DRAFT_KEY); draw(); stats(); zoomDirty=true; $('histM').classList.remove('on'); log('履歴から復元しました'); }
            });
        };
        list.appendChild(d);
      });
    }
    $('histM').classList.add('on');
  });
};
$('hist-close').onclick=()=>$('histM').classList.remove('on');

/* ---------- 再生まわり ---------- */
function setStart(i,t){
  cues[i].start=f2(Math.max(0,t));
  if(i>0 && $('chain').checked) cues[i-1].end=f2(Math.max(cues[i-1].start+0.4, t-0.05));
  if(cues[i].end < cues[i].start+0.4) cues[i].end=f2(cues[i].start+0.4);
  markDirty(); syncRow(i); zoomDirty=true;
}
// 終了だけを動かす（次の行に食い込まない・最短0.2s）
function setEnd(i,t){
  const next = (i+1<cues.length) ? cues[i+1].start - 0.03 : (dur||t+1);
  const lo = cues[i].start + 0.2;
  // 行の並びが崩れている時（前後が逆転）は next を優先して食い込みだけは防ぐ
  cues[i].end = f2(Math.min(Math.max(Math.min(t, next), Math.min(lo, next)), next));
  markDirty(); syncRow(i); zoomDirty=true;
}
function syncRow(i){
  const tr=$('r'+i); if(!tr) return;
  tr.querySelector('[data-k=start]').value=f2(cues[i].start);
  tr.querySelector('[data-k=end]').value=f2(cues[i].end);
  if(i>0){ const p=$('r'+(i-1)); if(p) p.querySelector('[data-k=end]').value=f2(cues[i-1].end); }
}
/* ---------- ライブプレビュー: 「間で魅せる（時間差表示）」の実演出を再現 ---------- */
// gen-full-composition.mjs の buildSegments と同じ規則（手動stagger優先→実発声の間→密な行はflow分割）
const FLOW_GROUP = 3, FLOW_MIN_WORDS = 6, FLOW_MIN_SPAN = 2.0;
function staggerSegs(c){
  const words = (c.eng||'').trim().split(/\\s+/).filter(Boolean);
  if(!words.length) return null;
  const wt = cueWordTimes(c);
  if(!wt || wt.length!==words.length) return null;
  let cuts;
  if(Array.isArray(c.stagger)){
    cuts = c.stagger.filter(k=>k>0&&k<words.length);
    if(!cuts.length) return null;   // 手動で「一括表示」に固定済み
  } else {
    cuts = [];
    for(let k=1;k<wt.length;k++) if(wt[k].s-wt[k-1].e>STAGGER_GAP_TH) cuts.push(k);
    if(!cuts.length && words.length>=FLOW_MIN_WORDS){
      const span = wt[wt.length-1].e - wt[0].s;
      if(span>=FLOW_MIN_SPAN) for(let k=FLOW_GROUP;k<words.length;k+=FLOW_GROUP) cuts.push(k);
    }
    if(!cuts.length) return null;
  }
  const bounds=[0,...cuts,words.length], segs=[];
  for(let i=0;i<bounds.length-1;i++){
    const from=bounds[i], to=bounds[i+1];
    const ov=(c.staggerT && typeof c.staggerT[from]==='number') ? c.staggerT[from] : null;
    segs.push({ text: words.slice(from,to).join(' '), revealT: ov!=null?ov:wt[from].s });
  }
  return segs;
}
let pvSegKey = null;
function renderPreview(c, cur, t){
  const segs = (cur>=0 && !au.paused) ? staggerSegs(c) : null;
  if(segs && segs.length>1){
    const key = cur+':'+segs.length;
    if(pvSegKey!==key){
      pvSegKey = key;
      const host=$('pv-en'); host.innerHTML='';
      segs.forEach((s,si)=>{
        if(si>0) host.appendChild(document.createTextNode(' '));
        const sp=document.createElement('span'); sp.className='seg'+(si===0?' on':''); sp.textContent=s.text;
        host.appendChild(sp);
      });
    }
    const spans=$('pv-en').querySelectorAll('.seg');
    // gen-full-composition.mjs の FADE_LEAD(0.16)+REVEAL_DUR(0.24) と揃える：行の終わりに食い込ませない
    const minRevealT=c.start+0.15, maxRevealT=Math.max(minRevealT, c.end-0.4);
    for(let si=1;si<segs.length;si++){
      const revealT=Math.min(Math.max(segs[si].revealT, minRevealT), maxRevealT);
      spans[si].classList.toggle('on', t>=revealT);
    }
    const lastSegRevealT=Math.min(Math.max(segs[segs.length-1].revealT, minRevealT), maxRevealT);
    const jpAt=(typeof c.jpT==='number') ? c.jpT : lastSegRevealT+0.17;
    putTx($('pv-jp'), t>=jpAt ? c.jpn : '');
  } else {
    pvSegKey = null;
    putTx($('pv-en'), c.eng);
    if(cur>=0 && !au.paused && typeof c.jpT==='number') putTx($('pv-jp'), t>=c.jpT ? c.jpn : '');
    else putTx($('pv-jp'), c.jpn);
  }
}
function paint(){
  const t=au.currentTime;
  $('t').textContent=t.toFixed(2)+'s';
  let cur=-1;
  cues.forEach((c,i)=>{ if(t>=c.start && t<c.end) cur=i; });
  const playingRow = au.paused ? -1 : playRow;
  cues.forEach((c,i)=>{ const tr=$('r'+i); if(!tr)return;
    tr.className=(i===cur?'on ':'')+(i===sel?'sel':(i===cur?'':'rc'+(i%2)));
    const pb=tr.querySelector('[data-act=play]');
    if(pb){ const ic=(i===playingRow)?'停止':'再生'; if(pb.textContent!==ic) pb.textContent=ic; } });
  // 再生中の無字幕区間は動画と同じく空白にする（停止中のみ選択行を出して編集の目印に）
  const c = cur>=0 ? cues[cur] : (au.paused ? (cues[sel]||{eng:'',jpn:''}) : {eng:'',jpn:''});
  renderPreview(c, cur, t);
  const psc = (typeof c.scale==='number' && c.scale>0) ? c.scale : 1;
  $('pv-en').style.transform = $('pv-jp').style.transform = psc===1 ? '' : 'scale('+psc+')';
  $('preview').style.opacity = (cur<0 && au.paused && c.eng) ? 0.45 : 1;
  if($('loop').checked && !au.paused && cues[sel] && t>cues[sel].end){ au.currentTime=Math.max(0,cues[sel].start-0.15); }
  if(cur>=0 && !au.paused && document.activeElement===document.body){
    const tr=$('r'+cur);
    if(tr && tr.style.display!=='none'){
      const r=tr.getBoundingClientRect();
      if(r.top<300||r.bottom>innerHeight-110) tr.scrollIntoView({block:'center'});
    }
  }
  $('play').textContent = au.paused ? '再生' : '停止';
  $('mb-play').textContent = au.paused ? '再生' : '停止';
  drawOvr();
  if (!au.paused || zoomDirty || Math.abs(t - lastZoomT) > 0.001){ drawZoom(); zoomDirty = false; lastZoomT = t; }
}
setInterval(paint,80);
addEventListener('resize', ()=>{ if(pcm) buildOvr(); zoomDirty=true; });
$('play').onclick=()=>{ au.paused?au.play():au.pause(); };
document.querySelectorAll('[data-nudge]').forEach(b=>b.onclick=()=>{ au.currentTime=Math.max(0,au.currentTime+ +b.dataset.nudge); zoomDirty=true; });
$('rate').onchange=()=>{ au.playbackRate=+$('rate').value; $('mb-rate').textContent=$('rate').value+'x'; };
const RATES=['1','0.75','0.5'];
$('mb-rate').onclick=()=>{
  const cur=RATES.indexOf($('rate').value), nx=RATES[(cur+1)%RATES.length];
  $('rate').value=nx; au.playbackRate=+nx; $('mb-rate').textContent=nx+'x';
};
function tapSync(){
  pushHist('tap');
  setStart(sel, au.currentTime);
  sel=Math.min(cues.length-1,sel+1); paint();
}
$('mb-play').onclick=()=>{ au.paused?au.play():au.pause(); };
$('mb-sync').onclick=tapSync;

/* スマホ: ヘッダー折りたたみ（既定は最小・状態は保存） */
const mqNarrow = matchMedia('(max-width:820px)');
function isNarrow(){ return mqNarrow.matches; }
function applyFold(){
  const t = localStorage.getItem('cue-tools-${slug}') === '1';
  const w = localStorage.getItem('cue-wave-${slug}') === '1';
  document.body.classList.toggle('tools-on', t);
  document.body.classList.toggle('wave-on', w);
  $('hdmenu').classList.toggle('on', t);
  $('hdwave').classList.toggle('on', w);
  requestAnimationFrame(()=>{ buildOvr(); zoomDirty = true; });
}
$('hdmenu').onclick=()=>{ localStorage.setItem('cue-tools-${slug}', document.body.classList.contains('tools-on')?'0':'1'); applyFold(); };
$('hdwave').onclick=()=>{ localStorage.setItem('cue-wave-${slug}', document.body.classList.contains('wave-on')?'0':'1'); applyFold(); };
applyFold();
addEventListener('resize', ()=>{ buildOvr(); zoomDirty = true; });
$('mb-back').onclick=()=>{ pushHist('nud'+sel); setStart(sel, cues[sel].start-0.05); };
$('mb-fwd').onclick=()=>{ pushHist('nud'+sel); setStart(sel, cues[sel].start+0.05); };
addEventListener('keydown', e=>{
  const typing = e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA';
  if(e.metaKey && !e.shiftKey && (e.key==='s')){ e.preventDefault(); save(); return; }
  if(e.metaKey && (e.key==='z'||e.key==='Z')){ e.preventDefault(); e.shiftKey?redoF():undo(); return; }
  if(typing) return;
  if(e.code==='Space'){ e.preventDefault(); au.paused?au.play():au.pause(); }
  else if(e.key==='s'||e.key==='S'){ e.preventDefault(); tapSync(); }
  else if(e.key==='ArrowDown'){ e.preventDefault(); selectCue(Math.min(cues.length-1,sel+1)); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); selectCue(Math.max(0,sel-1)); }
  else if(e.key==='ArrowRight'){ e.preventDefault(); pushHist('nud'+sel); setStart(sel, cues[sel].start+(e.shiftKey?0.2:0.05)); }
  else if(e.key==='ArrowLeft'){ e.preventDefault(); pushHist('nud'+sel); setStart(sel, cues[sel].start-(e.shiftKey?0.2:0.05)); }
  else if(e.key==='Enter'){ e.preventDefault(); playRow=sel; seekPlay(au, cues[sel].start-0.4); zoomDirty=true; }
});
/* サーバーを再起動したのに画面が古いまま、を検知して知らせる（iPad Safariは特に残る） */
setInterval(function(){
  fetch('/__ver',{cache:'no-store'}).then(function(r){return r.text()}).then(function(v){
    if(!v || v===$('ver').textContent) return;
    var b=$('ver');
    b.textContent=v+' ← 再読み込み';
    b.style.cssText='background:#ff9b3d;color:#111;font-weight:800;border-radius:6px;padding:2px 6px;cursor:pointer';
    b.onclick=function(){ location.reload(true); };
  }).catch(function(){});
}, 20000);
function save(){
  fetch('cues.json',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(cues)})
    .then(r=>r.json()).then(j=>{
      dirty=false; localStorage.removeItem(DRAFT_KEY);
      const issues=lint().filter(x=>x.lv!=='inf');
      log('保存しました（'+j.count+'キュー）'+(issues.length?' / ⚠ チェックで'+issues.length+'件の指摘あり':''));
    });
}
$('save').onclick=save;
$('srt').onclick=()=>fetch('srt',{method:'POST'}).then(r=>r.json()).then(j=>log('SRT: '+j.files.join(' / ')));
$('render').onclick=()=>{
  if(dirty && !confirm('未保存の変更があります。保存せずにレンダーしますか？')) return;
  fetch('render',{method:'POST'}); log('レンダー中…（3分ほど）');
  const iv=setInterval(()=>fetch('render').then(r=>r.json()).then(j=>{ log(j.log); if(j.done){clearInterval(iv);} }),1500);
};
addEventListener('beforeunload', e=>{ if(dirty){ e.preventDefault(); e.returnValue=''; } });
</script></body></html>`; };

/* ---------- リール編集画面 ---------- */
const reelHtml = (slug) => { const PC = readProdColors(AGENT); return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${slug} — リール編集</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&family=Noto+Sans+JP:wght@500;700;900&display=swap" rel="stylesheet">
<style>
:root{color-scheme:dark;--prod-en:${PC.en};--prod-jp:${PC.jp}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:#0d0f13;color:#e8e8ea;font:14px/1.6 -apple-system,"Hiragino Sans",sans-serif;padding:14px 14px 40px}
.wrap{max-width:1000px;margin:0 auto;display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap}
a.home{color:#8fa3bd;text-decoration:none;font-size:13px}
#ver{font-size:10px;color:#7a8aa0;padding:2px 6px;border:1px solid #2a3140;border-radius:6px;font-variant-numeric:tabular-nums;white-space:nowrap}
h1{font-size:17px;margin:6px 0 14px}
.col{flex:1;min-width:300px}
.card{background:#141922;border:1px solid #232a36;border-radius:14px;padding:16px;margin-bottom:14px}
h2{font-size:13px;margin:0 0 10px;color:#b9ff2e;letter-spacing:1px}
label{display:block;font-size:12px;color:#8fa3bd;margin:10px 0 4px}
input,textarea{background:#171b23;border:1px solid #2a3140;color:#e8e8ea;border-radius:9px;padding:10px;width:100%;font:inherit}
textarea{resize:vertical;min-height:76px;font-family:"Noto Sans JP",sans-serif}
button{background:#232935;color:#e8e8ea;border:1px solid #39414f;border-radius:9px;padding:9px 14px;cursor:pointer;font-size:13px}
button:hover{background:#2e3646}
button.p{background:#b9ff2e;color:#111;border-color:#b9ff2e;font-weight:700}
button:disabled{opacity:.45;cursor:default}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.row>input.num{width:104px;font-variant-numeric:tabular-nums;text-align:right}
#stagecol{flex:none}
#stagewrap{width:342px;height:608px;border-radius:14px;overflow:hidden;position:relative;background:#000;flex:none;border:1px solid #262d3a;cursor:pointer}
#tlwrap{position:relative;margin-top:8px}
#tl{display:block;width:100%;height:88px;border-radius:10px;background:#0e1219;border:1px solid #262d3a;touch-action:none;cursor:ew-resize}
#tlbtns{position:absolute;right:6px;top:6px;display:flex;gap:6px}
#tlbtns button{padding:2px 9px;font-size:15px;background:rgba(20,25,34,.85)}
#tlhint{color:#6b7a90;font-size:11px;margin-top:4px;text-align:center}
#stage{position:absolute;left:0;top:0;width:1080px;height:1920px;transform-origin:top left;background:#08090c;font-family:"Inter",sans-serif}
#bgfill{position:absolute;inset:0;background:radial-gradient(120% 60% at 50% 34%,#161a22 0%,#08090c 70%)}
#pv{position:absolute;left:0;width:1080px;object-fit:contain;background:#000}
#vfade{position:absolute;left:0;width:1080px;pointer-events:none;
  background:linear-gradient(180deg,rgba(8,9,12,.55) 0%,rgba(8,9,12,0) 16%,rgba(8,9,12,0) 34%,rgba(8,9,12,.72) 88%,rgba(8,9,12,.92) 100%)}
#subs{position:absolute;left:54px;right:54px;text-align:center}
#s-en{color:var(--prod-en);font-weight:800;font-size:52px;line-height:1.12;text-shadow:0 3px 18px rgba(0,0,0,.92)}
#s-jp{color:var(--prod-jp);font-family:"Noto Sans JP",sans-serif;font-weight:700;font-size:34px;line-height:1.35;margin-top:14px;text-shadow:0 3px 16px rgba(0,0,0,.92)}
#top{position:absolute;left:64px;right:64px;text-align:center}
#top .c{color:var(--prod-en);font-family:"Noto Sans JP",sans-serif;font-weight:900;font-size:54px;line-height:1.42}
#top .rule{width:92px;height:5px;background:#b9ff2e;border-radius:3px;margin:38px auto 0}
#bottom{position:absolute;left:64px;right:64px;text-align:center}
#bottom .t{color:var(--prod-en);font-size:62px;font-weight:900;line-height:1.08}
#bottom .a{color:var(--prod-jp);font-size:38px;font-weight:700;margin-top:14px}
#bottom .s{color:rgba(255,255,255,.42);font-family:"Noto Sans JP",sans-serif;font-size:27px;margin-top:26px;letter-spacing:3px}
#barwrap{position:absolute;left:0;right:0;bottom:0;height:8px;background:rgba(255,255,255,.1)}
#bar{position:absolute;left:0;top:0;bottom:0;transform-origin:left center;background:linear-gradient(90deg,#b9ff2e,#00e5a0);width:100%;transform:scaleX(0);box-shadow:0 0 8px rgba(185,255,46,.6)}
.note{color:#6b7a90;font-size:12px;margin-top:8px}
.warn{color:#ffb28f}
#rlog{white-space:pre-wrap;font-size:12px;color:#8fa3bd;background:#0e1219;border-radius:9px;padding:10px;max-height:150px;overflow:auto;margin-top:10px;display:none}
#cuelist{max-height:200px;overflow:auto;margin-top:8px;font-size:12px}
.cl{display:flex;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;color:#9fb0c8}
.cl:hover{background:#1d2431}
.cl .tm{color:#6b7a90;font-variant-numeric:tabular-nums;flex:none;width:52px}
.cl .tx{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* 区間内の字幕編集 */
#ed{max-height:460px;overflow:auto;margin-top:6px}
.er{border:1px solid #232a36;border-radius:10px;padding:8px;margin-bottom:8px;background:#171c25}
.er.on{border-color:#3a4a63;background:#1d2634}
.er.sel{outline:2px solid #b9ff2e}
.er .hd{display:flex;gap:6px;align-items:center;margin-bottom:6px}
.er .hd input.num{width:88px;font-variant-numeric:tabular-nums;text-align:right;padding:7px}
.er .hd .sp{flex:1}
.er .mini{background:none;border:none;color:#8fa3bd;font-size:17px;padding:5px 7px;cursor:pointer;border-radius:6px}
.er .mini:hover{color:#fff;background:#2a3140}
.er textarea.tx{margin-bottom:5px;padding:8px;resize:none;white-space:pre;overflow-x:auto;overflow-y:hidden;display:block}
.er input.jp{color:#b9ff2e}
.chips{display:flex;flex-wrap:wrap;align-items:center;background:#0e1219;border:1px solid #262d3a;border-radius:10px;padding:10px;margin-bottom:12px}
.chip{padding:6px 3px;font-size:19px;white-space:pre}
.chips.jpc .chip{font-size:20px;color:#b9ff2e}
.cut{width:16px;height:34px;margin:0 -1px;border-radius:5px;cursor:pointer;position:relative;flex:none}
.cut::after{content:"";position:absolute;left:50%;top:6px;bottom:6px;width:2px;transform:translateX(-50%);background:#39414f;border-radius:2px}
.cut.ok::after{background:#4d6b8f}
.cut.on::after{background:#b9ff2e;width:4px}
.cut.ng::after{background:#3a2b2b}
.cut.gap::after{background:#e6a54d;width:3px;box-shadow:0 0 6px rgba(230,165,77,.7)}
.cut.gap.on::after{background:#b9ff2e}
.modalmask{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:30;display:none;align-items:center;justify-content:center;padding:14px}
.modalmask.on{display:flex}
.modalbox{background:#151a22;border:1px solid #2f3846;border-radius:14px;padding:16px;max-width:860px;width:100%;max-height:92vh;overflow:auto}
.pvw{background:#000;border-radius:10px;padding:10px;margin-bottom:6px}
.pvw .l{display:flex;gap:10px;align-items:baseline;padding:5px 0;border-bottom:1px solid #1c222c}
.pvw .l:last-child{border:0}
.pvw .n{color:#6b7a90;font-size:12px;width:52px}
.pvw .e{color:#fff;font-weight:700;font-size:13px}.pvw .j{color:#b9ff2e;font-size:12px}
#mbar{display:none}
@media (max-width:820px){
  .wrap{flex-direction:column;gap:12px}
  body{padding:10px 10px 96px}
  #stagecol{width:100%;position:sticky;top:0;z-index:5;background:#0d0f13;padding:6px 0 8px}
  #stagewrap{margin:0 auto}
  #tl{height:104px}
  #tlhint{display:none}
  .col{width:100%;min-width:0}
  button{padding:12px 15px;font-size:15px}
  input,textarea{font-size:16px;padding:12px}
  .row>input.num{width:96px}
  #mbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:20;gap:8px;
    padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:rgba(14,17,23,.95);
    border-top:1px solid #2a3140;backdrop-filter:blur(10px)}
  #mbar button{flex:1;padding:13px 0}
  #mbar .p{flex:1.3}
}
</style></head><body>
<div style="max-width:1000px;margin:0 auto"><a class="home" href="../">◀ 字幕エディタ</a> <span id="ver" title="配信中の画面コードの更新時刻。サーバー再起動まで古いまま">${VER}</span><h1>${slug} — 縦型リール（PV映像に字幕）</h1></div>
<div class="wrap">
  <div id="stagecol">
  <div id="stagewrap">
    <div id="stage">
      <div id="bgfill"></div>
      <video id="pv" src="pv.mp4" playsinline preload="auto"></video>
      <div id="vfade"></div>
      <div id="subs"><div id="s-en"></div><div id="s-jp"></div></div>
      <div id="top"><div id="topc"></div><div class="rule"></div></div>
      <div id="bottom"><div class="t" id="b-t"></div><div class="a" id="b-a"></div><div class="s">対訳 waxthink.com</div></div>
      <div id="barwrap"><div id="bar"></div></div>
    </div>
  </div>
  <div id="tlwrap">
    <canvas id="tl"></canvas>
    <div id="tlbtns"><button id="tlin">＋</button><button id="tlout">−</button></div>
  </div>
  <div id="tlhint">緑の帯＝切り出す区間。両端の取っ手をドラッグで開始/終了、帯の外を左右ドラッグで頭出し。ピンチで拡大。映像タップで再生/停止。</div>
  </div>
  <div class="col">
    <div class="card" id="nopv" style="display:none">
      <h2>PV映像</h2>
      <div style="color:#8fa3bd;font-size:13px">まだPV映像がありません。記事のyoutubeId、または下のURLから取得します。</div>
      <input id="yt" placeholder="YouTube URL（省略時は記事のIDを使用）" style="margin-top:10px">
      <button class="p" id="getpv" style="margin-top:8px;width:100%">PV映像を取得</button>
      <div id="pvlog" class="note"></div>
    </div>
    <div class="card">
      <h2>切り出す区間</h2>
      <div class="row">
        <button id="play" class="p">再生</button>
        <span id="tnow" style="color:#9fb0c8;font-variant-numeric:tabular-nums">0.00s</span>
        <span style="flex:1"></span>
        <span id="dur" style="font-weight:700"></span>
      </div>
      <label>開始（秒）</label>
      <div class="row">
        <input class="num" id="start" value="0">
        <button id="setstart">◎ 今ここ</button>
        <button data-nudge-s="-1">−1</button><button data-nudge-s="1">＋1</button>
      </div>
      <label>終了（秒）</label>
      <div class="row">
        <input class="num" id="end" value="0">
        <button id="setend">◎ 今ここ</button>
        <button data-nudge-e="-1">−1</button><button data-nudge-e="1">＋1</button>
      </div>
      <div class="note">キューの頭をタップすると、そこを開始位置にできます（下の一覧）。</div>
      <div id="cuelist"></div>
    </div>
    <div class="card">
      <h2>文字</h2>
      <label>上帯のコメント（改行で複数行）</label>
      <textarea id="comment" placeholder="例: 1曲で人生を変えた男の&#10;最初の8小節"></textarea>
      <label>曲名</label><input id="title">
      <label>アーティスト</label><input id="artist">
    </div>
    <div class="card">
      <h2>字幕の見え方</h2>
      <label>縦位置（右へ動かすほど上に上がる）</label>
      <div class="row">
        <input type="range" id="subup" min="-260" max="700" step="10" value="0" style="flex:1">
        <span id="subupv" style="width:64px;text-align:right;color:#9fb0c8">0px</span>
      </div>
      <div class="row" style="margin-top:6px">
        <button data-pos="0">映像の下端</button>
        <button data-pos="mid">映像の中央</button>
        <button data-pos="under">映像のすぐ下（黒帯）</button>
      </div>
      <label>文字サイズ</label>
      <div class="row">
        <input type="range" id="subscale" min="0.7" max="1.5" step="0.05" value="1" style="flex:1">
        <span id="subscalev" style="width:64px;text-align:right;color:#9fb0c8">1.00x</span>
      </div>
    </div>
    <div class="card">
      <h2>この区間の字幕</h2>
      <div class="row">
        <button id="cs-save" class="p">字幕を保存</button>
        <span id="cs-msg" class="note" style="margin:0"></span>
      </div>
      <div class="note">◎＝再生位置をこの行の開始に（タップ同期）。分割ボタンで別キューに分ける、⤵＝次と結合、✕＝削除。字幕エディタと同じ full-cues.json を直接編集します。</div>
      <div id="ed"></div>
    </div>
    <div class="card">
      <div class="row">
        <button class="p" id="save">保存</button>
        <button class="p" id="render">書き出し（mp4）</button>
        <span style="flex:1"></span><span id="msg" class="note"></span>
      </div>
      <div id="rlog"></div>
    </div>
  </div>
</div>
<div id="mbar">
  <button id="m-play" class="p">再生</button>
  <button id="m-start">◎ 開始</button>
  <button id="m-end">◎ 終了</button>
  <button id="m-sync" class="p">◎ 字幕</button>
  <button id="m-save">保存</button>
</div>
<div id="splitM" class="modalmask"><div class="modalbox">
  <h3 style="margin:0 0 4px;font-size:15px">行の分割</h3>
  <div class="note" style="margin-bottom:10px">切りたい位置の｜をタップ。青い｜＝語の切れ目として安全な位置。時間は文字数で自動配分します。</div>
  <div class="chips enc" id="sp-en"></div>
  <div class="chips jpc" id="sp-jp"></div>
  <div class="pvw" id="sp-pv"></div>
  <div class="row" style="margin-top:10px">
    <button id="sp-a2">おまかせ2分割</button>
    <button id="sp-a3">おまかせ3分割</button>
    <button id="sp-clear">解除</button>
    <span style="flex:1"></span>
    <button id="sp-cancel">やめる</button>
    <button class="p" id="sp-ok">分割する</button>
  </div>
</div></div>
<script>
var $=function(id){return document.getElementById(id)};
var pv=$('pv'), cues=[], cfg={start:0,end:0,comment:'',title:'',artist:'',subUp:0,subScale:1}, playing=false;
var renderEditorPending=null;
function f2(n){return Math.round(n*100)/100}
// currentTime設定直後にplay()すると、シーク先が未バッファ（回線が遅い/Tailscale経由等）の時に
// 古い位置から再生が始まって字幕表示とズレる。seekedを待ってから再生する。
var seekToken=0;
function seekPlay(el,t){
  var target=Math.max(0,t), myToken=++seekToken;
  var start=function(){ if(myToken===seekToken) el.play(); };
  if(el.readyState>=2 && Math.abs(el.currentTime-target)<0.05){ start(); return; }
  var onSeeked=function(){ el.removeEventListener('seeked', onSeeked); start(); };
  el.addEventListener('seeked', onSeeked);
  el.currentTime=target;
}

function fitStage(){
  var wrap=$('stagewrap');
  var avail=Math.min(342, (document.body.clientWidth||360)-24);
  var maxH=Math.round((window.innerHeight||800)*(window.innerWidth<=820?0.40:0.52));
  var w=Math.min(avail, Math.round(maxH*1080/1920));
  var s=w/1080;
  wrap.style.width=w+'px'; wrap.style.height=Math.round(1920*s)+'px';
  $('stage').style.transform='scale('+s+')';
}
addEventListener('resize',fitStage); addEventListener('orientationchange',function(){setTimeout(fitStage,250)});

function layout(){
  var vw=pv.videoWidth||1920, vh=pv.videoHeight||1080;
  var H=Math.min(1280,Math.round(1080*vh/vw)), T=Math.round((1920-H)/2);
  pv.style.top=T+'px'; pv.style.height=H+'px';
  $('vfade').style.top=T+'px'; $('vfade').style.height=H+'px';
  $('subs').style.top=(T+H-34-(cfg.subUp||0))+'px'; $('subs').style.transform='translateY(-100%)';
  $('s-en').style.fontSize=Math.round(52*(cfg.subScale||1))+'px';
  $('s-jp').style.fontSize=Math.round(34*(cfg.subScale||1))+'px';
  $('top').style.top=Math.max(90,Math.round(T*0.3))+'px';
  $('bottom').style.bottom=Math.max(110,Math.round(T*0.26))+'px';
}
pv.addEventListener('loadedmetadata',function(){ layout(); if(!cfg.end){ cfg.end=Math.min(pv.duration,cfg.start+48); $('end').value=f2(cfg.end); } upd(); });
pv.addEventListener('error',function(){ $('nopv').style.display='block'; });
fitStage(); layout();
setTimeout(function(){fitStage();layout()}, 400); setTimeout(function(){fitStage();layout()}, 1500);

Promise.all([fetch('../cues.json').then(function(r){return r.json()}), fetch('config.json').then(function(r){return r.json()})])
 .then(function(a){
   cues=a[0]; var c=a[1];
   cfg.start=c.start||0; cfg.end=c.end||0; cfg.comment=c.comment||''; cfg.title=c.title||''; cfg.artist=c.artist||'';
   cfg.subUp=c.subUp||0; cfg.subScale=c.subScale||1;
   $('start').value=f2(cfg.start); $('end').value=f2(cfg.end);
   $('comment').value=cfg.comment; $('title').value=cfg.title; $('artist').value=cfg.artist;
   $('subup').value=cfg.subUp; $('subscale').value=cfg.subScale;
   if(!c.hasPv) $('nopv').style.display='block';
   drawCueList(); upd(); renderEditor();
 });

function drawCueList(){
  var el=$('cuelist'); el.innerHTML='';
  cues.forEach(function(c,i){
    var d=document.createElement('div'); d.className='cl';
    var t=document.createElement('span'); t.className='tm'; t.textContent=f2(c.start)+'s';
    var x=document.createElement('span'); x.className='tx'; x.textContent=c.eng;
    d.appendChild(t); d.appendChild(x);
    d.onclick=function(){ cfg.start=c.start; $('start').value=f2(c.start); pv.currentTime=c.start; upd(); };
    el.appendChild(d);
  });
}
function upd(){
  cfg.start=parseFloat($('start').value)||0; cfg.end=parseFloat($('end').value)||0;
  cfg.comment=$('comment').value; cfg.title=$('title').value; cfg.artist=$('artist').value;
  cfg.subUp=parseInt($('subup').value,10)||0; cfg.subScale=parseFloat($('subscale').value)||1;
  $('subupv').textContent=cfg.subUp+'px'; $('subscalev').textContent=cfg.subScale.toFixed(2)+'x';
  layout();
  if(typeof renderEditorPending!=='undefined') clearTimeout(renderEditorPending);
  renderEditorPending=setTimeout(function(){ if(typeof renderEditor==='function') renderEditor(); },250);
  var span=cfg.end-cfg.start;
  if(span<=0){ $('dur').textContent='終了が開始より前です'; $('dur').className='warn'; }
  else { $('dur').textContent=span.toFixed(1)+'s'; $('dur').className=(span>90||span<3)?'warn':''; }
  $('topc').innerHTML='';
  cfg.comment.split('\\n').forEach(function(l){ if(!l)return; var d=document.createElement('div'); d.className='c'; d.textContent=l; $('topc').appendChild(d); });
  $('b-t').textContent=cfg.title; $('b-a').textContent=cfg.artist;
}
['start','end','comment','title','artist','subup','subscale'].forEach(function(id){ $(id).addEventListener('input',upd); });
document.querySelectorAll('[data-pos]').forEach(function(b){ b.onclick=function(){
  var vw=pv.videoWidth||1920, vh=pv.videoHeight||1080;
  var H=Math.min(1280,Math.round(1080*vh/vw));
  var p=b.dataset.pos;
  $('subup').value = p==='mid' ? Math.round(H/2-60) : (p==='under' ? -170 : 0);
  upd();
}; });
/* ---------- タイムライン（ドラッグで区間指定） ---------- */
var DPR=window.devicePixelRatio||1, COARSE=matchMedia('(pointer:coarse)').matches;
var TL={span:0,t0:0,drag:null,pinch:{},pbase:null};
function vib(){ if(navigator.vibrate) navigator.vibrate(8); }
function tlDur(){ return pv.duration||60 }
function tlSpan(){ return Math.max(4, Math.min(TL.span||tlDur(), tlDur())) }
function tlT0(){ return Math.max(0, Math.min(Math.max(0,tlDur()-tlSpan()), TL.t0)) }
function fmtT(s){ var m=Math.floor(s/60), q=Math.floor(s%60); return m+':'+(q<10?'0':'')+q }
function tlEl(){ return $('tl') }
function tlW(){ return tlEl().clientWidth||1 }
function tlX(e){ return e.clientX-tlEl().getBoundingClientRect().left }
function drawTl(){
  var cv=tlEl(), W=cv.clientWidth, H=cv.clientHeight; if(!W) return;
  if(cv.width!==Math.round(W*DPR)||cv.height!==Math.round(H*DPR)){ cv.width=Math.round(W*DPR); cv.height=Math.round(H*DPR); }
  var g=cv.getContext('2d'); g.setTransform(DPR,0,0,DPR,0,0);
  var t0=tlT0(), sp=tlSpan(), BH=H-15;
  var X=function(t){ return (t-t0)/sp*W };
  g.fillStyle='#0e1219'; g.fillRect(0,0,W,H);
  var step= sp>600?120:sp>300?60:sp>120?30:sp>60?10:sp>24?5:1;
  g.font='10px sans-serif'; g.textAlign='left';
  for(var t=Math.ceil(t0/step)*step;t<t0+sp;t+=step){
    var px=X(t); g.fillStyle='#232a36'; g.fillRect(px,0,1,BH);
    g.fillStyle='#5d6b80'; g.fillText(fmtT(t),px+3,H-4);
  }
  for(var i=0;i<cues.length;i++){
    var c=cues[i]; if(c.end<t0||c.start>t0+sp) continue;
    var a=X(c.start), b=Math.max(a+2,X(c.end));
    var inr=(cfg.end>cfg.start&&c.end>cfg.start+0.05&&c.start<cfg.end-0.05);
    g.fillStyle=inr?'#4d759e':'#2b3442';
    g.fillRect(a,BH-30+(i%2)*13,Math.max(2,b-a-1),11);
  }
  if(cfg.end>cfg.start){
    var xa=X(cfg.start), xb=X(cfg.end);
    g.fillStyle='rgba(185,255,46,.13)'; g.fillRect(xa,0,xb-xa,BH);
    g.shadowColor='rgba(185,255,46,.9)'; g.shadowBlur=8;
    g.fillStyle='#b9ff2e'; g.fillRect(xa-2,0,4,BH); g.fillRect(xb-2,0,4,BH);
    var gw=COARSE?15:11;
    g.fillRect(xa-2,0,gw,26); g.fillRect(xb+2-gw,0,gw,26);
    g.shadowBlur=0;
    g.fillStyle='#111'; g.font='bold 11px sans-serif';
    g.textAlign='center'; g.fillText('▶',xa-2+gw/2,17); g.fillText('◀',xb+2-gw/2,17);
  }
  var xp=X(pv.currentTime);
  g.fillStyle='#fff'; g.fillRect(xp-1,0,2,BH);
}
function tlFollow(){
  if(pv.paused||TL.drag) return;
  var sp=tlSpan(), t0=tlT0(), t=pv.currentTime;
  if(t<t0||t>t0+sp*0.97) TL.t0=Math.max(0,t-sp*0.15);
}
function tlSet(h,t){
  t=Math.max(0,Math.min(tlDur(),f2(t)));
  if(h==='a'){ if(cfg.end>0&&t>cfg.end-1) t=Math.max(0,cfg.end-1); $('start').value=f2(t); }
  else { if(t<cfg.start+1) t=cfg.start+1; $('end').value=f2(t); }
  upd();
  return t;
}
tlEl().addEventListener('pointerdown',function(e){
  TL.pinch[e.pointerId]=tlX(e);
  var ids=Object.keys(TL.pinch);
  if(ids.length>=2){
    var d=Math.abs(TL.pinch[ids[0]]-TL.pinch[ids[1]]);
    var mid=(TL.pinch[ids[0]]+TL.pinch[ids[1]])/2;
    TL.pbase={d:Math.max(14,d),span:tlSpan(),ctr:tlT0()+mid/tlW()*tlSpan(),mid:mid};
    TL.drag=null; return;
  }
  var W=tlW(), t0=tlT0(), sp=tlSpan(), x=tlX(e), R=COARSE?30:16;
  var xa=(cfg.start-t0)/sp*W, xb=(cfg.end-t0)/sp*W;
  tlEl().setPointerCapture(e.pointerId);
  var da=Math.abs(x-xa), db=Math.abs(x-xb), has=(cfg.end>cfg.start);
  if(has&&da<R&&da<=db){ TL.drag={h:'a',off:x-xa}; pv.pause(); vib(); }
  else if(has&&db<R){ TL.drag={h:'b',off:x-xb}; pv.pause(); vib(); }
  else { TL.drag={seek:true}; pv.currentTime=Math.max(0,Math.min(tlDur(),t0+x/W*sp)); }
});
tlEl().addEventListener('pointermove',function(e){
  if(TL.pinch[e.pointerId]!==undefined) TL.pinch[e.pointerId]=tlX(e);
  var ids=Object.keys(TL.pinch);
  if(ids.length>=2&&TL.pbase){
    var d=Math.max(14,Math.abs(TL.pinch[ids[0]]-TL.pinch[ids[1]]));
    TL.span=Math.max(4,Math.min(tlDur(),TL.pbase.span*TL.pbase.d/d));
    TL.t0=TL.pbase.ctr-TL.pbase.mid/tlW()*tlSpan();
    return;
  }
  if(!TL.drag) return;
  var W=tlW(), t0=tlT0(), sp=tlSpan(), x=tlX(e);
  if(TL.drag.seek){ pv.currentTime=Math.max(0,Math.min(tlDur(),t0+x/W*sp)); return; }
  var t=tlSet(TL.drag.h, t0+(x-TL.drag.off)/W*sp);
  pv.currentTime=Math.max(0,Math.min(tlDur(),t));
});
addEventListener('pointerup',function(e){ delete TL.pinch[e.pointerId]; if(Object.keys(TL.pinch).length<2) TL.pbase=null; TL.drag=null; });
addEventListener('pointercancel',function(e){ delete TL.pinch[e.pointerId]; TL.pbase=null; TL.drag=null; });
$('tlin').onclick=function(){ var c=pv.currentTime, sp=Math.max(4,tlSpan()/2); TL.span=sp; TL.t0=c-sp/2; };
$('tlout').onclick=function(){ var c=pv.currentTime, sp=Math.min(tlDur(),tlSpan()*2); TL.span=sp; TL.t0=c-sp/2; };
$('stagewrap').addEventListener('click',function(){ $('play').click(); });

$('setstart').onclick=function(){
  var t=f2(pv.currentTime);
  if(cfg.end && t>=cfg.end){ $('end').value=f2(Math.min(pv.duration||t+45, t+45)); }
  $('start').value=t; upd();
};
$('setend').onclick=function(){
  var t=f2(pv.currentTime);
  if(t<=cfg.start){ $('start').value=t; $('end').value=f2(Math.min(pv.duration||t+45, t+45));
    $('msg').textContent='終了が開始より前だったので、ここを開始にしました'; }
  else $('end').value=t;
  upd();
};
document.querySelectorAll('[data-nudge-s]').forEach(function(b){ b.onclick=function(){ $('start').value=f2((parseFloat($('start').value)||0)+ +b.dataset.nudgeS); upd(); pv.currentTime=parseFloat($('start').value); }; });
document.querySelectorAll('[data-nudge-e]').forEach(function(b){ b.onclick=function(){ $('end').value=f2((parseFloat($('end').value)||0)+ +b.dataset.nudgeE); upd(); }; });
$('play').onclick=function(){
  if(pv.paused){ if(pv.currentTime<cfg.start||pv.currentTime>cfg.end) seekPlay(pv, cfg.start); else pv.play(); }
  else pv.pause();
};
setInterval(function(){
  var t=pv.currentTime;
  $('tnow').textContent=t.toFixed(2)+'s';
  $('play').textContent=pv.paused?'再生':'停止';
  $('m-play').textContent=pv.paused?'再生':'停止';
  if(!pv.paused && cfg.end>cfg.start && t>cfg.end) pv.currentTime=cfg.start;
  var cur=null;
  for(var i=0;i<cues.length;i++) if(t>=cues[i].start&&t<cues[i].end) cur=cues[i];
  // 区間が未設定/逆転しているときもプレビューは字幕を出す（位置合わせができなくなるため）
  var validRange=(cfg.end>cfg.start);
  var inRange=!validRange||(t>=cfg.start-0.01&&t<=cfg.end+0.01);
  putTxR($('s-en'),(cur&&inRange)?cur.eng:'');
  putTxR($('s-jp'),(cur&&inRange)?cur.jpn:'');
  var span=Math.max(0.1,cfg.end-cfg.start);
  $('bar').style.transform='scaleX('+Math.max(0,Math.min(1,(t-cfg.start)/span))+')';
  paintRows();
  tlFollow(); drawTl();
},80);

/* ---------- 区間内の字幕編集（full-cues.json を直接いじる） ---------- */
var selCue=-1, cuesDirty=false;
var playCue=-1; // 行の再生ボタンで最後に対象にしたキュー。同じ行のボタンを押す限りは頭出しに戻さず今の位置で再生/一時停止をトグルする
function inRangeIdx(){
  var out=[];
  for(var i=0;i<cues.length;i++) if(cues[i].end>cfg.start+0.05 && cues[i].start<cfg.end-0.05) out.push(i);
  return out;
}
function putTxR(host,s){ host.innerHTML=''; String(s==null?'':s).split(String.fromCharCode(10)).forEach(function(p,k){ if(k) host.appendChild(document.createElement('br')); host.appendChild(document.createTextNode(p)); }); }
function renderEditor(){
  var host=$('ed'); host.innerHTML='';
  var idx=inRangeIdx();
  if(!idx.length){ host.innerHTML='<div class="note">この区間にキューがありません</div>'; return; }
  if(selCue<0||idx.indexOf(selCue)<0) selCue=idx[0];
  idx.forEach(function(i){
    var c=cues[i];
    var d=document.createElement('div'); d.className='er'; d.id='er'+i;
    var hd=document.createElement('div'); hd.className='hd';
    hd.innerHTML='<input class="num" data-k="start" value="'+f2(c.start)+'">'
      +'<button class="mini" data-a="play" title="ここから再生">再生</button>'
      +'<button class="mini" data-a="here" title="再生位置をこの行の開始に">◎</button>'
      +'<button class="mini" data-a="m005" title="-0.05s">−</button>'
      +'<button class="mini" data-a="p005" title="+0.05s">＋</button>'
      +'<span class="sp"></span>'
      +'<button class="mini" data-a="split" title="分割">分割</button>'
      +'<button class="mini" data-a="merge" title="次と結合">⤵</button>'
      +'<button class="mini" data-a="del" title="削除">✕</button>';
    // input だと改行が消えるので textarea（字幕エディタで入れた改行を壊さない）
    var mk=function(k,ph){ var t=document.createElement('textarea'); t.className='tx'+(k==='jpn'?' jp':''); t.dataset.k=k;
      t.setAttribute('wrap','off'); t.value=cues[i][k]||''; t.rows=Math.min(4,((t.value.match(/\\n/g)||[]).length+1));
      if(ph) t.placeholder=ph; return t; };
    var en=mk('eng'), jp=mk('jpn','日本語訳…');
    d.appendChild(hd); d.appendChild(en); d.appendChild(jp);
    d.addEventListener('pointerdown',function(){ selCue=i; paintRows(); });
    d.addEventListener('input',function(e){
      var k=e.target.dataset.k; if(!k) return;
      cues[i][k]=(k==='start')?(parseFloat(e.target.value)||0):e.target.value;
      cuesDirty=true; $('cs-msg').textContent='未保存';
    });
    hd.addEventListener('click',function(e){
      var b=e.target.closest('button[data-a]'); if(!b) return;
      var a=b.dataset.a;
      if(a==='play'){
        // 同じ行のボタンを続けて押している限りは頭出し(start-0.4)に戻さず、今の位置で再生/一時停止をトグルする
        if(playCue===i){ selCue=i; if(pv.paused) pv.play(); else pv.pause(); }
        else { playCue=i; selCue=i; seekPlay(pv, cues[i].start-0.4); }
        paintRows();
      }
      if(a==='here') setCueStart(i, pv.currentTime);
      if(a==='m005') setCueStart(i, cues[i].start-0.05);
      if(a==='p005') setCueStart(i, cues[i].start+0.05);
      if(a==='merge'&&i<cues.length-1){
        cues[i]={eng:(cues[i].eng+' '+cues[i+1].eng).trim(), jpn:(cues[i].jpn+cues[i+1].jpn).trim(), start:cues[i].start, end:cues[i+1].end};
        cues.splice(i+1,1); cuesDirty=true; renderEditor(); drawCueList(); $('cs-msg').textContent='未保存';
      }
      if(a==='del'){ cues.splice(i,1); cuesDirty=true; renderEditor(); drawCueList(); $('cs-msg').textContent='未保存'; }
      if(a==='split') openSplit(i);
    });
    host.appendChild(d);
  });
  paintRows();
  layout();
}
function setCueStart(i,t){
  t=Math.max(0,f2(t));
  cues[i].start=t;
  if(i>0 && cues[i-1].end>t-0.05) cues[i-1].end=f2(Math.max(cues[i-1].start+0.4,t-0.05));
  if(cues[i].end<t+0.4) cues[i].end=f2(t+0.4);
  cuesDirty=true; $('cs-msg').textContent='未保存';
  var r=$('er'+i); if(r) r.querySelector('[data-k=start]').value=f2(t);
  var p=$('er'+(i-1)); if(p&&cues[i-1]) p.querySelector('[data-k=start]').value=f2(cues[i-1].start);
  drawCueList();
}
function paintRows(){
  var t=pv.currentTime;
  var playingRow = pv.paused ? -1 : playCue;
  inRangeIdx().forEach(function(i){
    var r=$('er'+i); if(!r) return;
    var on=(t>=cues[i].start&&t<cues[i].end);
    r.className='er'+(on?' on':'')+(i===selCue?' sel':'');
    var pb=r.querySelector('[data-a=play]');
    if(pb){ var ic=(i===playingRow)?'停止':'再生'; if(pb.textContent!==ic) pb.textContent=ic; }
  });
}
function tapSyncCue(){
  if(selCue<0) return;
  setCueStart(selCue, pv.currentTime);
  var idx=inRangeIdx(), k=idx.indexOf(selCue);
  if(k>=0&&k+1<idx.length) selCue=idx[k+1];
  paintRows();
  var r=$('er'+selCue); if(r) r.scrollIntoView({block:'center'});
}
function saveCues(){
  return fetch('../cues.json',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(cues)})
    .then(function(r){return r.json()}).then(function(j){
      cuesDirty=false; $('cs-msg').textContent='保存しました（'+j.count+'キュー）';
      return fetch('../cues.json').then(function(r){return r.json()}).then(function(c){ cues=c; renderEditor(); drawCueList(); });
    });
}
$('cs-save').onclick=saveCues;
$('m-sync').onclick=tapSyncCue;
addEventListener('keydown',function(e){
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
  if(e.key==='s'||e.key==='S'){ e.preventDefault(); tapSyncCue(); }
  else if(e.code==='Space'){ e.preventDefault(); $('play').click(); }
});
addEventListener('beforeunload',function(e){ if(cuesDirty){ e.preventDefault(); e.returnValue=''; } });

/* サーバーを再起動したのに画面が古いまま、を検知して知らせる（iPad Safariは特に残る） */
setInterval(function(){
  fetch('/__ver',{cache:'no-store'}).then(function(r){return r.text()}).then(function(v){
    if(!v || v===$('ver').textContent) return;
    var b=$('ver');
    b.textContent=v+' ← 再読み込み';
    b.style.cssText='background:#ff9b3d;color:#111;font-weight:800;border-radius:6px;padding:2px 6px;cursor:pointer';
    b.onclick=function(){ location.reload(true); };
  }).catch(function(){});
}, 20000);

/* 分割モーダル */
var isKata=function(c){return /[゠-ヿ]/.test(c)}, isKanji=function(c){return /[一-鿿]/.test(c)},
    isHira=function(c){return /[぀-ゟ]/.test(c)}, isLat=function(c){return /[A-Za-z0-9']/.test(c)};
var NG_PREV="のなにはがをでとへもっーゃゅょ、・「『（【“‘", NG_NEXT="、。ーっゃゅょ！？」』）】…・”’";
function safeJp(s,b){
  if(b<=0||b>=s.length) return false;
  var p=s[b-1], q=s[b];
  if(p==='、') return true;
  if(NG_PREV.indexOf(p)>=0||NG_NEXT.indexOf(q)>=0) return false;
  if(isKata(p)&&isKata(q)) return false;
  if(isLat(p)&&isLat(q)) return false;
  if(isKanji(p)&&isKanji(q)) return false;
  if(isHira(q)) return false;
  return true;
}
var SM={i:-1,ew:[],jc:[],ec:{},jc2:{}};
function openSplit(i){
  SM={i:i, ew:cues[i].eng.split(/\\s+/).filter(Boolean), jc:cues[i].jpn.split(''), ec:{}, jc2:{}};
  drawSplit(); $('splitM').classList.add('on');
}
function splitParts(){
  var c=cues[SM.i];
  var eb=[0], jb=[0], k;
  for(k in SM.ec) if(SM.ec[k]) eb.push(+k);
  for(k in SM.jc2) if(SM.jc2[k]) jb.push(+k);
  eb.sort(function(a,b){return a-b}); jb.sort(function(a,b){return a-b});
  eb.push(SM.ew.length); jb.push(SM.jc.length);
  var K=Math.max(eb.length,jb.length)-1, eng=[], jpn=[];
  for(var n=0;n<K;n++){
    eng.push(eb[n]!==undefined&&eb[n+1]!==undefined?SM.ew.slice(eb[n],eb[n+1]).join(' '):'');
    jpn.push(jb[n]!==undefined&&jb[n+1]!==undefined?SM.jc.slice(jb[n],jb[n+1]).join(''):'');
  }
  var tot=0; eng.forEach(function(x){tot+=x.length}); tot=tot||1;
  var span=Math.max(0.8,c.end-c.start), out=[], acc=0;
  for(var n2=0;n2<K;n2++){
    var st=c.start+span*acc/tot; acc+=eng[n2].length;
    out.push({eng:eng[n2],jpn:jpn[n2],start:f2(st),end:f2(c.start+span*acc/tot)});
  }
  if(out.length) out[out.length-1].end=f2(c.end);
  return out;
}
function drawSplit(){
  var en=$('sp-en'), jp=$('sp-jp'); en.innerHTML=''; jp.innerHTML='';
  SM.ew.forEach(function(w,k){
    if(k>0){ var d=document.createElement('div'); d.className='cut ok'+(SM.ec[k]?' on':''); d.dataset.e=k; en.appendChild(d); }
    var s=document.createElement('div'); s.className='chip'; s.textContent=w; en.appendChild(s);
  });
  var js=SM.jc.join('');
  SM.jc.forEach(function(ch,k){
    if(k>0){ var ok=safeJp(js,k); var d=document.createElement('div');
      d.className='cut '+(ok?'ok':'ng')+(SM.jc2[k]?' on':''); d.dataset.j=k; jp.appendChild(d); }
    var s=document.createElement('div'); s.className='chip'; s.textContent=ch; jp.appendChild(s);
  });
  jp.style.display=SM.jc.length?'':'none';
  var parts=splitParts();
  $('sp-pv').innerHTML='';
  parts.forEach(function(p){
    var l=document.createElement('div'); l.className='l';
    var n=document.createElement('div'); n.className='n'; n.textContent=f2(p.start)+'s';
    var box=document.createElement('div');
    var e=document.createElement('div'); e.className='e'; e.textContent=p.eng;
    var j=document.createElement('div'); j.className='j'; j.textContent=p.jpn;
    box.appendChild(e); box.appendChild(j); l.appendChild(n); l.appendChild(box);
    $('sp-pv').appendChild(l);
  });
}
$('sp-en').addEventListener('click',function(e){ var d=e.target.closest('.cut'); if(!d)return;
  var k=d.dataset.e; SM.ec[k]=!SM.ec[k]; drawSplit(); });
$('sp-jp').addEventListener('click',function(e){ var d=e.target.closest('.cut'); if(!d)return;
  var k=d.dataset.j; SM.jc2[k]=!SM.jc2[k]; drawSplit(); });
function autoSplit(K){
  SM.ec={}; SM.jc2={};
  var js=SM.jc.join('');
  for(var k=1;k<K;k++){
    var ei=Math.round(SM.ew.length*k/K); if(ei>0&&ei<SM.ew.length) SM.ec[ei]=true;
    if(!SM.jc.length) continue;
    var ideal=Math.round(SM.jc.length*k/K), best=null, lim=Math.max(4,Math.round(SM.jc.length*0.3));
    for(var d=0;d<=lim&&best===null;d++){
      var cand=d===0?[ideal]:[ideal-d,ideal+d];
      for(var n=0;n<cand.length;n++){ var q=cand[n];
        if(q>0&&q<SM.jc.length&&safeJp(js,q)&&!SM.jc2[q]){ best=q; break; } }
    }
    if(best!==null) SM.jc2[best]=true;
  }
  drawSplit();
}
$('sp-a2').onclick=function(){autoSplit(2)};
$('sp-a3').onclick=function(){autoSplit(3)};
$('sp-clear').onclick=function(){ SM.ec={}; SM.jc2={}; drawSplit(); };
$('sp-cancel').onclick=function(){ $('splitM').classList.remove('on'); };
$('sp-ok').onclick=function(){
  var parts=splitParts();
  if(parts.length<2){ alert('切る位置を1つ以上えらんでください'); return; }
  var args=[SM.i,1].concat(parts);
  Array.prototype.splice.apply(cues,args);
  cuesDirty=true; $('splitM').classList.remove('on'); renderEditor(); drawCueList();
  $('cs-msg').textContent='未保存';
};

function saveCfg(){
  upd();
  return fetch('config.json',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(cfg)})
    .then(function(r){return r.json()}).then(function(){ $('msg').textContent='保存しました'; });
}
$('save').onclick=saveCfg;
$('getpv').onclick=function(){
  $('getpv').disabled=true; $('pvlog').textContent='取得中…（数分）';
  fetch('fetch-pv',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({yt:$('yt').value.trim()})});
  var iv=setInterval(function(){ fetch('pv-status').then(function(r){return r.json()}).then(function(j){
    $('pvlog').textContent=j.phase;
    if(j.done){ clearInterval(iv); $('getpv').disabled=false;
      if(j.ok){ $('nopv').style.display='none'; pv.src='pv.mp4?'+Date.now(); pv.load(); } }
  }); },2000);
};
$('m-play').onclick=function(){ $('play').click(); };
$('m-start').onclick=function(){ $('setstart').click(); };
$('m-end').onclick=function(){ $('setend').click(); };
$('m-save').onclick=function(){ saveCfg(); };
$('render').onclick=function(){
  var span=cfg.end-cfg.start;
  if(span<3){ alert('区間が短すぎます'); return; }
  if(span>90 && !confirm(span.toFixed(0)+'秒です。Reelsは90秒程度までが扱いやすいですが続けますか？')) return;
  saveCfg().then(function(){
    $('render').disabled=true; $('rlog').style.display='block'; $('rlog').textContent='書き出し中…';
    fetch('render',{method:'POST'});
    var iv=setInterval(function(){ fetch('render').then(function(r){return r.json()}).then(function(j){
      $('rlog').textContent=j.log; $('rlog').scrollTop=1e9;
      if(j.done){ clearInterval(iv); $('render').disabled=false; }
    }); },1500);
  });
};
</script></body></html>`; };

/* ---------- リール: 設定・PV取得・レンダー ---------- */
const reelCfgPath = (slug) => path.join(assetsOf(slug), "reel-config.json");
const pvPath = (slug) => path.join(AGENT, slug, "reel", "assets", "pv.mp4");
const readReelCfg = (slug) => {
  let c = { start: 0, end: 0, comment: "", title: "", artist: "", subUp: 0, subScale: 1 };
  if (fs.existsSync(reelCfgPath(slug))) { try { c = { ...c, ...JSON.parse(fs.readFileSync(reelCfgPath(slug), "utf-8")) }; } catch {} }
  if (!c.title || !c.artist) {
    const metaPath = path.join(assetsOf(slug), "meta.json");
    if (fs.existsSync(metaPath)) { try { const m = JSON.parse(fs.readFileSync(metaPath, "utf-8")); c.title = c.title || m.title || ""; c.artist = c.artist || m.artist || ""; } catch {} }
  }
  if (!c.title || !c.artist) {
    try {
      const st = fs.readFileSync(path.join(ROOT, "src/data/songs.ts"), "utf-8");
      const line = st.split("\n").find(l => l.includes(`/songs/${slug}'`)) || "";
      c.title = c.title || (line.match(/title:\s*"([^"]+)"/) || [])[1] || slug;
      c.artist = c.artist || (line.match(/artists:\s*'([^']+)'/) || [])[1] || "";
    } catch {}
  }
  return c;
};

let pvJob = { running: false, phase: "", done: false, ok: false };
function fetchPv(slug, yt) {
  if (pvJob.running) return;
  pvJob = { running: true, phase: "URLを解決中", done: false, ok: false };
  (async () => {
    let url = yt;
    if (!url) {
      const metaPath = path.join(assetsOf(slug), "meta.json");
      if (fs.existsSync(metaPath)) { try { url = JSON.parse(fs.readFileSync(metaPath, "utf-8")).url; } catch {} }
    }
    if (!url) {
      const astro = path.join(ROOT, "src/pages/songs", `${slug}.astro`);
      if (fs.existsSync(astro)) { const id = (fs.readFileSync(astro, "utf-8").match(/youtubeId="([\w-]{11})"/) || [])[1]; if (id) url = `https://www.youtube.com/watch?v=${id}`; }
    }
    if (!url) { pvJob = { running: false, phase: "YouTube URLが見つかりません", done: true, ok: false }; return; }
    if (!/^https?:/.test(url)) url = `https://www.youtube.com/watch?v=${url}`;
    pvJob.phase = "映像をダウンロード中…";
    fs.mkdirSync(path.dirname(pvPath(slug)), { recursive: true });
    const p = spawn("yt-dlp", ["-f", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080]", "--merge-output-format", "mp4",
      "--no-playlist", "-o", pvPath(slug), url], { env: process.env });
    p.on("close", (code) => {
      const ok = code === 0 && fs.existsSync(pvPath(slug));
      pvJob = { running: false, phase: ok ? "完了" : "ダウンロードに失敗", done: true, ok };
    });
  })();
}

const reelRenderStates = new Map();
function runReelRender(slug) {
  const prev = reelRenderStates.get(slug);
  if (prev && prev.running) return;
  const st = { running: true, log: "", done: false, ok: false };
  reelRenderStates.set(slug, st);
  const c = readReelCfg(slug);
  const a = [path.join(AGENT, "src", "gen-reel.mjs"), "--slug", slug, "--start", String(c.start), "--end", String(c.end),
    "--comment", c.comment || "", "--title", c.title || "", "--artist", c.artist || "",
    "--sub-up", String(c.subUp || 0), "--sub-scale", String(c.subScale || 1), "--render"];
  const p = spawn(process.execPath, a, { cwd: AGENT, env: process.env });
  const push = (d) => { st.log = (st.log + String(d).replace(/\r/g, "\n").split("\n").filter(Boolean).slice(-1).map(x => x.slice(0, 160) + "\n").join("")).slice(-2500); };
  p.stdout.on("data", push); p.stderr.on("data", push);
  p.on("close", (code) => { st.running = false; st.done = true; st.ok = code === 0; push(code === 0 ? "\n完了: reel/renders/" + slug + "-reel.mp4\n" : "\n失敗\n"); });
}

/* ---------- トップページ（曲一覧＋YouTube取り込み） ---------- */
const homeHtml = () => {
  const songs = listSongs();
  const rows = songs.map(s => `<a class="song" href="/edit/${s.slug}/">
    <span class="nm">${s.slug}</span>
    <span class="meta">${s.count}キュー${s.translated < s.count ? ` / 訳あり${s.translated}` : ""}${s.rendered ? " / mp4あり" : ""}</span>
    <span class="go">編集 ▶</span></a>`).join("\n");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>歌詞動画エディタ</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0d0f13;color:#e8e8ea;font:15px/1.6 -apple-system,"Hiragino Sans",sans-serif;padding:22px 16px 60px}
.wrap{max-width:680px;margin:0 auto}
h1{font-size:19px;margin:0 0 4px}
.sub{color:#8fa3bd;font-size:13px;margin-bottom:20px}
.card{background:#141922;border:1px solid #232a36;border-radius:14px;padding:18px;margin-bottom:18px}
h2{font-size:15px;margin:0 0 10px;color:#b9ff2e}
input{background:#171b23;border:1px solid #2a3140;color:#e8e8ea;border-radius:9px;padding:11px 12px;width:100%;font:inherit;margin-bottom:10px}
button{background:#b9ff2e;color:#111;border:none;border-radius:9px;padding:12px 18px;font-weight:700;font-size:15px;cursor:pointer;width:100%}
button:disabled{opacity:.5}
.song{display:flex;align-items:center;gap:12px;padding:13px 8px;border-bottom:1px solid #1e242f;text-decoration:none;color:#e8e8ea;border-radius:9px}
.song:hover{background:#1a212c}
.song .nm{font-weight:700;flex:1}
.song .meta{color:#8fa3bd;font-size:12px}
.song .go{color:#b9ff2e;font-size:13px;white-space:nowrap}
#prog{display:none;margin-top:12px}
#phase{font-weight:700;color:#b9ff2e}
#jlog{white-space:pre-wrap;font-size:12px;color:#8fa3bd;background:#0e1219;border-radius:9px;padding:10px;max-height:180px;overflow:auto;margin-top:8px}
.note{color:#6b7a90;font-size:12px;margin-top:8px}
</style></head><body><div class="wrap">
<h1>歌詞動画エディタ</h1>
<div class="sub">YouTubeのURLを貼ると、音源取得→文字起こし→字幕キュー生成まで自動。あとはブラウザで微調整。</div>
<div class="card">
  <h2>＋ 新しい曲を取り込む</h2>
  <input id="url" placeholder="YouTube URL（https://www.youtube.com/watch?v=…）" inputmode="url">
  <input id="slug" placeholder="slug（例: lose-yourself。半角小文字とハイフン）">
  <input id="title" placeholder="曲名（動画の見出しに使用・任意）">
  <input id="artist" placeholder="アーティスト（任意）">
  <button id="go">取り込み開始</button>
  <div class="note">記事対訳（full-lines.json）がある曲は英日キュー、無い曲は文字起こしの英語のみ（日本語は編集画面で入力）。文字起こしは数分かかります。</div>
  <div id="prog"><span id="phase"></span><div id="jlog"></div></div>
</div>
<div class="card">
  <h2>編集できる曲</h2>
  ${rows || '<div style="color:#8fa3bd;padding:8px">まだありません。上のフォームから取り込んでください。</div>'}
</div>
</div>
<script>
const $=(id)=>document.getElementById(id);
$('url').addEventListener('input',()=>{
  if($('slug').value) return;
});
$('go').onclick=()=>{
  const url=$('url').value.trim(), slug=$('slug').value.trim().toLowerCase();
  if(!url){ alert('YouTube URLを入れてください'); return; }
  if(!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)){ alert('slugは半角小文字・数字・ハイフンで（例: lose-yourself）'); return; }
  $('go').disabled=true; $('prog').style.display='block'; $('phase').textContent='開始…';
  fetch('/create',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({url,slug,title:$('title').value.trim(),artist:$('artist').value.trim()})})
    .then(r=>r.json()).then(j=>{
      if(j.error){ $('phase').textContent='エラー: '+j.error; $('go').disabled=false; return; }
      poll(slug);
    });
};
function poll(slug){
  const iv=setInterval(()=>fetch('/job').then(r=>r.json()).then(j=>{
    $('phase').textContent=j.phase+(j.running?'…':'');
    $('jlog').textContent=j.log; $('jlog').scrollTop=1e9;
    if(j.done){
      clearInterval(iv); $('go').disabled=false;
      if(j.ok){ $('phase').textContent='完了。編集画面へ移動します…'; setTimeout(()=>location.href='/edit/'+slug+'/',900); }
      else $('phase').textContent='失敗: '+(j.error||'');
    }
  }),1500);
}
// 取り込み中にページを開いたときも進捗を表示
fetch('/job').then(r=>r.json()).then(j=>{ if(j.running){ $('go').disabled=true; $('prog').style.display='block'; poll(j.slug); } });
</script></body></html>`;
};

/* ---------- HTTPサーバー ---------- */
const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  const json = (obj, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };

  if (url === "/") {
    if (defaultSlug && hasCues(defaultSlug) && req.headers["x-seen-home"] !== "1" && !req.headers.referer) {
      // --slug 指定時はダイレクトに編集画面へ（一覧へは編集画面の「◀ 曲一覧」リンクで戻れる）
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(homeHtml());
  }

  if (url === "/theme" && req.method === "GET") return json(readProdColors(AGENT));
  if (url === "/theme" && req.method === "POST") {
    let body = ""; req.on("data", d => body += d);
    req.on("end", () => {
      try { json(writeProdColors(AGENT, JSON.parse(body))); }
      catch (e) { json({ error: String(e.message) }, 400); }
    });
    return;
  }

  if (url === "/create" && req.method === "POST") {
    let body = ""; req.on("data", d => body += d);
    req.on("end", () => {
      try {
        const { url: yt, slug, title, artist } = JSON.parse(body);
        if (job.running) return json({ error: "別の取り込みが実行中です" });
        if (!YT_RE.test(yt || "")) return json({ error: "YouTubeのURLではありません" });
        if (!SLUG_RE.test(slug || "")) return json({ error: "slugが不正です" });
        startImport(yt, slug, title, artist);
        json({ ok: true });
      } catch (e) { json({ error: String(e.message) }, 400); }
    });
    return;
  }
  if (url === "/job") return json({ running: job.running, slug: job.slug, phase: job.phase, log: job.log, done: job.done, ok: job.ok, error: job.error });
  if (url === "/__ver") { res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" }); return res.end(VER); }

  const m = url.match(/^\/edit\/([a-z0-9][a-z0-9-]{1,60})(\/(.*))?$/);
  if (m) {
    const slug = m[1], sub = m[3] || "";
    if (!hasCues(slug)) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end("この曲のキューがまだありません"); }
    if (m[2] === undefined) { res.writeHead(302, { location: `/edit/${slug}/` }); return res.end(); }
    if (sub === "") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(editorHtml(slug)); }

    if (sub === "reel" || sub === "reel/") {
      if (sub === "reel") { res.writeHead(302, { location: `/edit/${slug}/reel/` }); return res.end(); }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(reelHtml(slug));
    }
    if (sub === "reel/config.json" && req.method === "GET") {
      return json({ ...readReelCfg(slug), hasPv: fs.existsSync(pvPath(slug)) });
    }
    if (sub === "reel/config.json" && req.method === "POST") {
      let body = ""; req.on("data", d => body += d);
      req.on("end", () => {
        try {
          const c = JSON.parse(body);
          let s = Math.max(0, Math.round((parseFloat(c.start) || 0) * 100) / 100);
          let e = Math.max(0, Math.round((parseFloat(c.end) || 0) * 100) / 100);
          if (e && e < s) { const t = s; s = e; e = t; }      // 逆転していたら入れ替える
          if (!e || e - s < 1) e = Math.round((s + 45) * 100) / 100; // 未設定/短すぎは既定45秒
          const out = {
            start: s,
            end: e,
            comment: String(c.comment || "").slice(0, 400),
            title: String(c.title || "").slice(0, 120),
            artist: String(c.artist || "").slice(0, 120),
            subUp: Math.max(-400, Math.min(1400, parseInt(c.subUp, 10) || 0)),
            subScale: Math.max(0.6, Math.min(1.8, parseFloat(c.subScale) || 1)),
          };
          fs.writeFileSync(reelCfgPath(slug), JSON.stringify(out, null, 2));
          json({ ok: true });
          console.log(`[${slug}] reel config saved (${out.start}–${out.end}s)`);
        } catch (e) { json({ error: String(e.message) }, 400); }
      });
      return;
    }
    if (sub === "reel/fetch-pv" && req.method === "POST") {
      let body = ""; req.on("data", d => body += d);
      req.on("end", () => { let yt = ""; try { yt = JSON.parse(body).yt || ""; } catch {} fetchPv(slug, yt); json({ ok: true }); });
      return;
    }
    if (sub === "reel/pv-status") return json(pvJob);
    if (sub === "reel/render") {
      if (req.method === "POST") { runReelRender(slug); return json({}); }
      const st = reelRenderStates.get(slug) || { log: "", done: false, ok: false, running: false };
      return json({ log: st.log, done: st.done && !st.running, ok: st.ok });
    }
    if (sub === "reel/pv.mp4") {
      const file = pvPath(slug);
      if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      const size = fs.statSync(file).size;
      const range = req.headers.range;
      if (range) {
        const rm = /bytes=(\d*)-(\d*)/.exec(range) || [];
        const start = parseInt(rm[1] || "0", 10), end = rm[2] ? parseInt(rm[2], 10) : size - 1;
        res.writeHead(206, { "content-type": "video/mp4", "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes", "content-length": end - start + 1 });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, { "content-type": "video/mp4", "content-length": size, "accept-ranges": "bytes" });
      return fs.createReadStream(file).pipe(res);
    }
    if (sub === "cues.json" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" }); return res.end(fs.readFileSync(cuesPathOf(slug)));
    }
    if (sub === "fa-words.json" && req.method === "GET") {
      const p = path.join(assetsOf(slug), "fa_words.json");
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(fs.existsSync(p) ? fs.readFileSync(p) : "null");
    }
    if (sub === "cues.json" && req.method === "POST") {
      let body = ""; req.on("data", d => body += d);
      req.on("end", () => {
        try {
          const cues = JSON.parse(body).map(c => {
            const o = { eng: c.eng, jpn: c.jpn, start: Math.round(c.start * 100) / 100, end: Math.round(c.end * 100) / 100 };
            if (typeof c.conf === "number") o.conf = c.conf;      // 自動生成の信頼度（要確認マーク用）
            if (Array.isArray(c.flags) && c.flags.length) o.flags = c.flags;
            if (c.color) o.color = c.color;                       // EN文字色（パンチライン等）
            if (c.jpColor) o.jpColor = c.jpColor;                 // JP文字色
            if (typeof c.scale === "number" && c.scale !== 1) o.scale = c.scale; // 拡大倍率
            if (Array.isArray(c.stagger)) {
              o.stagger = c.stagger;    // 時間差表示の手動カット位置（[]=強制オフ）
              if (c.staggerT && typeof c.staggerT === "object" && !Array.isArray(c.staggerT)) {
                const t = {};
                for (const k of Object.keys(c.staggerT)) { const n = Number(c.staggerT[k]); if (Number.isFinite(n)) t[k] = Math.round(n * 100) / 100; }
                if (Object.keys(t).length) o.staggerT = t;   // 語インデックス→実測秒（自動判定のFA語頭秒を上書き）
              }
            }
            if (typeof c.jpT === "number") o.jpT = Math.round(c.jpT * 100) / 100;   // 訳が出る秒（絶対秒・手動固定）
            return o;
          }).filter(c => (c.eng || c.jpn));
          for (const c of cues) if (c.end < c.start + 0.4) c.end = Math.round((c.start + 0.4) * 100) / 100;
          backupToHistory(slug);
          fs.copyFileSync(cuesPathOf(slug), path.join(assetsOf(slug), "full-cues.bak.json"));
          fs.writeFileSync(cuesPathOf(slug), JSON.stringify(cues, null, 2));
          json({ ok: true, count: cues.length });
          console.log(`[${slug}] saved ${cues.length} cues`);
        } catch (e) { json({ error: String(e.message) }, 400); }
      });
      return;
    }
    if (sub === "history" && req.method === "GET") {
      const dir = histDirOf(slug);
      const items = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(f => /^full-cues\..+\.json$/.test(f)).sort().reverse().map(f => {
        let count = 0;
        try { count = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")).length; } catch {}
        const mm = f.match(/^full-cues\.(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.json$/);
        return { file: f, label: mm ? `${mm[2]}/${mm[3]} ${mm[4]}:${mm[5]}:${mm[6]}` : f, count };
      });
      return json(items);
    }
    if (sub === "restore" && req.method === "POST") {
      let body = ""; req.on("data", d => body += d);
      req.on("end", () => {
        try {
          const { file } = JSON.parse(body);
          if (!/^full-cues\.[\d-]+\.json$/.test(file || "")) return json({}, 400);
          const src = path.join(histDirOf(slug), file);
          if (!fs.existsSync(src)) return json({}, 404);
          backupToHistory(slug);
          fs.copyFileSync(src, cuesPathOf(slug));
          json({ cues: JSON.parse(fs.readFileSync(cuesPathOf(slug), "utf-8")) });
          console.log(`[${slug}] restored from ${file}`);
        } catch (e) { json({ error: String(e.message) }, 400); }
      });
      return;
    }
    if (sub === "srt" && req.method === "POST") {
      const files = writeSrt(slug); console.log(`[${slug}] srt: ${files.join(", ")}`);
      return json({ files });
    }
    if (sub === "render") {
      if (req.method === "POST") { runRender(slug); return json({}); }
      const st = renderStateOf(slug);
      return json({ log: st.log, done: st.done && !st.running, ok: st.ok });
    }
    if (sub === "audio.mp3" || sub === "cover.jpg") {
      const file = path.join(assetsOf(slug), sub === "audio.mp3" ? "audio-full.mp3" : "cover.jpg");
      if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      const size = fs.statSync(file).size;
      const type = sub === "audio.mp3" ? "audio/mpeg" : "image/jpeg";
      const range = req.headers.range;
      if (range) {
        const rm = /bytes=(\d*)-(\d*)/.exec(range) || [];
        const start = parseInt(rm[1] || "0", 10), end = rm[2] ? parseInt(rm[2], 10) : size - 1;
        res.writeHead(206, { "content-type": type, "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes", "content-length": end - start + 1 });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes" });
      return fs.createReadStream(file).pipe(res);
    }
  }
  res.writeHead(404); res.end();
});

// Tailscale（入っていれば外出先・モバイル回線からでも同じURLで届く）
function tailscaleUrl() {
  for (const bin of ["/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"]) {
    if (!fs.existsSync(bin)) continue;
    try {
      const j = JSON.parse(execFileSync(bin, ["status", "--json"], { encoding: "utf-8", timeout: 4000 }));
      if (j.BackendState !== "Running") return null;
      const ip = (j.Self?.TailscaleIPs || []).find(a => a.includes("."));
      const host = (j.Self?.DNSName || "").replace(/\.$/, "");
      return ip ? { ip: `http://${ip}:${PORT}`, host: host ? `http://${host}:${PORT}` : null } : null;
    } catch { return null; }
  }
  return null;
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`歌詞動画エディタ（YouTube取り込み対応） ${VER}`);
  console.log(`  ※画面のコードは起動時に固定されます。cue-editor.mjs を直したら必ず再起動してください`);
  console.log(`  PC:     http://localhost:${PORT}`);
  for (const [, list] of Object.entries(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family !== "IPv4" || ni.internal) continue;
      if (ni.address.startsWith("100.")) continue;
      console.log(`  スマホ: http://${ni.address}:${PORT}  (同じWi-Fi)`);
    }
  }
  const ts = tailscaleUrl();
  if (ts) {
    console.log(`  外出先: ${ts.ip}  ← まずこれ（Tailscale ONなら4G/5G・別Wi-Fiでも可）`);
    if (ts.host) console.log(`          ${ts.host}  (MagicDNS名。Safariが検索に飛ぶ時は上のIPを使う)`);
    console.log(`  ※Macがスリープすると切れます。長く使うなら別ターミナルで: caffeinate -dis`);
  }
  if (defaultSlug) console.log(`  直行:   http://localhost:${PORT}/edit/${defaultSlug}/`);
});
