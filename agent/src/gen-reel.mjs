#!/usr/bin/env node
/**
 * gen-reel.mjs
 * 縦型(1080x1920)リール作曲を生成する。中央に16:9のPV映像、その上に英日字幕、
 * 上帯にコメント、下帯に曲名/アーティスト。full-cues.json の指定区間だけを切り出す。
 * 歌詞テキストは一切stdoutに出さない（件数と秒数のみ）。
 *
 * Usage:
 *   node agent/src/gen-reel.mjs --slug lose-yourself --start 56 --end 104 \
 *     [--comment "コメント"] [--title "曲名"] [--artist "アーティスト"] [--yt <url|id>] [--render]
 *
 * 出力: agent/{slug}/reel/index.html（＋ --render で renders/{slug}-reel.mp4）
 * 注意: PV映像の再利用は docs/shorts-strategy.md の著作権方針の対象外＝YouTubeへは上げない前提。
 */
import fs from "fs";
import path from "path";
import { execFileSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT = path.resolve(__dirname, "..");
const ROOT = path.resolve(AGENT, "..");

const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(`--${n}`); if (i !== -1) return args[i + 1]; const kv = args.find(a => a.startsWith(`--${n}=`)); return kv ? kv.split("=")[1] : d; };
const has = (n) => args.includes(`--${n}`);

const slug = getArg("slug");
if (!slug) { console.error("--slug required"); process.exit(1); }
const START = parseFloat(getArg("start", "0"));
let END = parseFloat(getArg("end", "0"));
if (!END || END <= START) { console.error("--start / --end を秒で指定（例: --start 56 --end 104）"); process.exit(1); }
const SPAN = Math.round((END - START) * 100) / 100;
if (SPAN > 90) console.warn(`⚠ ${SPAN}s — Reelsは90秒程度が扱いやすい`);

const assets = path.join(AGENT, slug, "assets");
const reelDir = path.join(AGENT, slug, "reel");
const reelAssets = path.join(reelDir, "assets");
fs.mkdirSync(reelAssets, { recursive: true });

/* ---------- PV映像の取得 ---------- */
const videoPath = path.join(reelAssets, "pv.mp4");
if (!fs.existsSync(videoPath)) {
  let yt = getArg("yt");
  if (!yt) {
    const metaPath = path.join(assets, "meta.json");
    if (fs.existsSync(metaPath)) { try { yt = JSON.parse(fs.readFileSync(metaPath, "utf-8")).url; } catch {} }
  }
  if (!yt) {
    const astro = path.join(ROOT, "src/pages/songs", `${slug}.astro`);
    if (fs.existsSync(astro)) yt = (fs.readFileSync(astro, "utf-8").match(/youtubeId="([\w-]{11})"/) || [])[1];
  }
  if (!yt) { console.error("PV映像がありません。--yt <YouTube URL or ID> を指定してください"); process.exit(1); }
  const url = /^https?:/.test(yt) ? yt : `https://www.youtube.com/watch?v=${yt}`;
  console.log("PV映像をダウンロード中…");
  const r = spawnSync("yt-dlp", ["-f", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080]", "--merge-output-format", "mp4",
    "--no-playlist", "-o", videoPath, url], { stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0 || !fs.existsSync(videoPath)) { console.error("ダウンロードに失敗"); process.exit(1); }
}
const probe = (f, s) => { try { return execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", s, "-of", "csv=p=0", f], { encoding: "utf-8" }).trim(); } catch { return ""; } };
const vDur = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", videoPath], { encoding: "utf-8" }).trim());
if (END > vDur) { console.error(`--end ${END}s が映像の長さ ${vDur.toFixed(1)}s を超えています`); process.exit(1); }

/* ---------- キューの切り出し ---------- */
const cues = JSON.parse(fs.readFileSync(path.join(assets, "full-cues.json"), "utf-8"))
  .filter(c => c.end > START + 0.15 && c.start < END - 0.15)
  .map(c => ({
    eng: c.eng, jpn: c.jpn,
    start: Math.max(0, Math.round((c.start - START) * 100) / 100),
    end: Math.min(SPAN, Math.round((c.end - START) * 100) / 100),
  }))
  .filter(c => c.end > c.start + 0.2);
if (!cues.length) { console.error("この区間にキューがありません"); process.exit(1); }

/* ---------- タイトル/アーティスト/コメント ---------- */
let title = getArg("title"), artist = getArg("artist");
const comment = getArg("comment", "");
if (!title || !artist) {
  const metaPath = path.join(assets, "meta.json");
  if (fs.existsSync(metaPath)) { try { const m = JSON.parse(fs.readFileSync(metaPath, "utf-8")); title = title || m.title; artist = artist || m.artist; } catch {} }
}
if (!title || !artist) {
  const st = fs.readFileSync(path.join(ROOT, "src/data/songs.ts"), "utf-8");
  const line = st.split("\n").find(l => l.includes(`/songs/${slug}'`)) || "";
  title = title || line.match(/title:\s*"([^"]+)"/)?.[1] || slug;
  artist = artist || line.match(/artists:\s*'([^']+)'/)?.[1] || "";
}

const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const payload = cues.map(c => ({ e: c.eng, j: c.jpn, s: c.start, d: c.end }));
const DUR = SPAN;
// PVの実アスペクト比に合わせて中央の映像帯を決める（4:3のMVを16:9枠に入れて切り落とさない）
const vW = parseInt(probe(videoPath, "stream=width"), 10) || 1920;
const vH = parseInt(probe(videoPath, "stream=height"), 10) || 1080;
// 4:3のMVでも切らずに見せる。上下の帯は最低320pxずつ確保
const VID_H = Math.min(1280, Math.round(1080 * vH / vW));
const VID_TOP = Math.round((1920 - VID_H) / 2);
console.log(`PV ${vW}x${vH} → 映像帯 1080x${VID_H}（上下の帯 各${VID_TOP}px）`);

const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>${esc(title)} — Reel</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&family=Noto+Sans+JP:wght@500;700;900&display=block" rel="stylesheet" />
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #08090c; font-family: "Inter", sans-serif; }
      #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; }
      #bgfill { position: absolute; inset: 0; z-index: 0; background:
        radial-gradient(120% 60% at 50% 34%, #161a22 0%, #08090c 70%); }
      #pv { position: absolute; left: 0; top: ${VID_TOP}px; width: 1080px; height: ${VID_H}px; z-index: 1; object-fit: contain; background: #000; }
      /* 映像の上下端をなじませる */
      #vfade { position: absolute; left: 0; top: ${VID_TOP}px; width: 1080px; height: ${VID_H}px; z-index: 2; pointer-events: none;
        background: linear-gradient(180deg, rgba(8,9,12,0.55) 0%, rgba(8,9,12,0) 16%, rgba(8,9,12,0) 34%, rgba(8,9,12,0.72) 88%, rgba(8,9,12,0.92) 100%); }
      /* 字幕はPVの上に重ねる */
      #subs { position: absolute; left: 0; top: ${VID_TOP}px; width: 1080px; height: ${VID_H}px; z-index: 3; }
      .line { position: absolute; left: 54px; right: 54px; bottom: 34px; text-align: center; opacity: 0; will-change: opacity, transform; }
      .line .en { color: #fff; font-weight: 800; font-size: 52px; line-height: 1.12; letter-spacing: -0.5px;
        text-shadow: 0 3px 18px rgba(0,0,0,0.92), 0 0 40px rgba(0,0,0,0.6); }
      .line .jp { color: #ffd24a; font-family: "Noto Sans JP", sans-serif; font-weight: 700; font-size: 34px;
        line-height: 1.35; margin-top: 14px; text-shadow: 0 3px 16px rgba(0,0,0,0.92); }
      /* 上帯: コメント */
      #top { position: absolute; left: 64px; right: 64px; top: ${Math.max(90, Math.round(VID_TOP * 0.3))}px; z-index: 4; text-align: center; }
      #top .c { color: #fff; font-family: "Noto Sans JP", sans-serif; font-weight: 900; font-size: 54px; line-height: 1.42;
        letter-spacing: -0.5px; }
      #top .rule { width: 92px; height: 5px; background: #ffd24a; border-radius: 3px; margin: 38px auto 0; }
      /* 下帯: 曲情報 */
      #bottom { position: absolute; left: 64px; right: 64px; bottom: ${Math.max(110, Math.round(VID_TOP * 0.26))}px; z-index: 4; text-align: center; }
      #bottom .t { color: #fff; font-size: 62px; font-weight: 900; letter-spacing: -1px; line-height: 1.08; }
      #bottom .a { color: #ffd24a; font-size: 38px; font-weight: 700; margin-top: 14px; letter-spacing: 1px; }
      #bottom .s { color: rgba(255,255,255,0.42); font-family: "Noto Sans JP", sans-serif; font-size: 27px;
        font-weight: 500; letter-spacing: 3px; margin-top: 26px; }
      #barwrap { position: absolute; left: 0; right: 0; bottom: 0; height: 8px; z-index: 6; background: rgba(255,255,255,0.1); }
      #bar { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: left center; transform: scaleX(0);
        background: linear-gradient(90deg, #ffd24a, #ff8a3c); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="${DUR}">
      <video id="pv" src="assets/pv.mp4" data-start="0" data-duration="${DUR}" data-media-start="${START}" data-track-index="0" muted playsinline></video>
      <audio id="pvaudio" src="assets/pv.mp4" data-start="0" data-duration="${DUR}" data-media-start="${START}" data-track-index="9" data-volume="1"></audio>
      <section class="clip" data-start="0" data-duration="${DUR}" data-track-index="1" style="position:absolute;inset:0;">
        <div id="bgfill"></div>
      </section>
      <section class="clip" data-start="0" data-duration="${DUR}" data-track-index="2" style="position:absolute;inset:0;">
        <div id="vfade"></div>
        <div id="subs"></div>
        <div id="top">
          ${esc(comment).split(/\\n|\n/).filter(Boolean).map(l => `<div class="c">${l}</div>`).join("\n          ") || '<div class="c"></div>'}
          <div class="rule"></div>
        </div>
        <div id="bottom">
          <div class="t">${esc(title)}</div>
          <div class="a">${esc(artist)}</div>
          <div class="s">対訳 waxthink.com</div>
        </div>
        <div id="barwrap"><div id="bar"></div></div>
      </section>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const DUR = ${DUR};
      const CUES = ${JSON.stringify(payload)};
      const subs = document.getElementById("subs");
      const nodes = CUES.map((c) => {
        const el = document.createElement("div");
        el.className = "line";
        const en = document.createElement("div"); en.className = "en"; en.textContent = c.e;
        const jp = document.createElement("div"); jp.className = "jp"; jp.textContent = c.j;
        el.appendChild(en); el.appendChild(jp);
        subs.appendChild(el);
        return el;
      });

      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#bar", { scaleX: 0 }, { scaleX: 1, ease: "none", duration: DUR }, 0);
      tl.fromTo("#top", { opacity: 0, y: -18 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, 0.1);
      tl.fromTo("#bottom", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, 0.25);

      CUES.forEach((c, i) => {
        const el = nodes[i];
        const inT = Math.max(0, c.s);
        const outT = Math.max(inT + 0.4, c.d);
        tl.fromTo(el, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }, inT);
        tl.to(el, { opacity: 0, y: -16, duration: 0.24, ease: "power2.in" }, Math.max(inT + 0.3, outT - 0.14));
        tl.fromTo(el.querySelector(".jp"), { opacity: 0 }, { opacity: 1, duration: 0.26, ease: "power2.out" }, inT + 0.12);
      });

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;

fs.writeFileSync(path.join(reelDir, "index.html"), html);
console.log(`wrote ${path.join(reelDir, "index.html")}`);
console.log(`区間 ${START}s–${END}s（${SPAN}s）/ ${cues.length}キュー / 1080x1920`);

if (has("render")) {
  fs.mkdirSync(path.join(reelDir, "renders"), { recursive: true });
  const r = spawnSync("npx", ["hyperframes@0.6.46", "render", ".", "-o", `renders/${slug}-reel.mp4`, "--fps", "30"],
    { cwd: reelDir, stdio: ["ignore", "inherit", "inherit"] });
  process.exit(r.status || 0);
}
