#!/usr/bin/env node
/**
 * gen-full-composition.mjs
 * full-cues.json から横型(1920x1080)フル歌詞動画のHyperFrames作曲HTMLを生成する。
 * eng(白・大)+jpn(金)を同一タイミングでキネティック表示。歌詞は一切stdoutに出さない。
 *
 * Usage: node agent/src/gen-full-composition.mjs --slug <slug> [--title T] [--artist A]
 * 出力: agent/{slug}/compositions/full.html
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT = path.resolve(__dirname, "..");
const ROOT = path.resolve(AGENT, "..");

const args = process.argv.slice(2);
const getArg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  if (i !== -1) return args[i + 1];
  const kv = args.find((a) => a.startsWith(`--${n}=`));
  return kv ? kv.split("=")[1] : d;
};

const slug = getArg("slug");
if (!slug) { console.error("--slug required"); process.exit(1); }

// title/artist from songs.ts if not given
let title = getArg("title"), artist = getArg("artist");
if (!title || !artist) {
  const st = fs.readFileSync(path.join(ROOT, "src/data/songs.ts"), "utf-8");
  const line = st.split("\n").find((l) => l.includes(`/songs/${slug}'`)) || "";
  title = title || line.match(/title:\s*"([^"]+)"/)?.[1] || slug;
  artist = artist || line.match(/artists:\s*.([^,'"]+)/)?.[1]?.trim() || "";
}

const cuesPath = path.join(AGENT, slug, "assets", "full-cues.json");
const cues = JSON.parse(fs.readFileSync(cuesPath, "utf-8"));
const audioDur = Math.max(...cues.map((c) => c.end)) + 1.5;
const DUR = Math.round(audioDur * 100) / 100;

// dedicated render project dir: agent/{slug}/full/index.html
// assets must live INSIDE the served project dir (CLI serves full/ over http; ../ escapes root → 404)
const outDir = path.join(AGENT, slug, "full");
const outAssets = path.join(outDir, "assets");
fs.mkdirSync(outAssets, { recursive: true });
fs.copyFileSync(path.join(AGENT, slug, "assets", "cover.jpg"), path.join(outAssets, "cover.jpg"));
fs.copyFileSync(path.join(AGENT, slug, "assets", "audio-full.mp3"), path.join(outAssets, "audio-full.mp3"));
let audioFile = "assets/audio-full.mp3";
const outPath = path.join(outDir, "index.html");

const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// data payload (eng/jpn stay in the file only, never printed)
const payload = cues.map((c) => ({ e: c.eng, j: c.jpn, s: c.start, d: c.end }));

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>${esc(title)} — Lyric Video</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&family=Noto+Sans+JP:wght@500;700&display=block" rel="stylesheet" />
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: #000; font-family: "Inter", sans-serif; }
      #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; }
      #bg { position: absolute; inset: -6%; z-index: 0;
        background-image: url("assets/cover.jpg"); background-size: cover; background-position: center;
        filter: blur(46px) brightness(0.34) saturate(1.1); transform: scale(1.12); will-change: transform; }
      #tint { position: absolute; inset: 0; z-index: 1;
        background: radial-gradient(120% 80% at 50% 40%, rgba(0,0,0,0.15), rgba(0,0,0,0.72) 78%); }
      /* header lower-third */
      #header { position: absolute; left: 72px; top: 60px; z-index: 5; display: flex; align-items: center; gap: 26px; }
      #cover { width: 120px; height: 120px; border-radius: 12px; object-fit: cover;
        box-shadow: 0 10px 40px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.14); }
      #meta { color: #fff; }
      #meta .t { font-size: 40px; font-weight: 900; letter-spacing: -0.5px; line-height: 1.05; }
      #meta .a { font-size: 26px; font-weight: 600; color: #ffd24a; margin-top: 6px; letter-spacing: 0.5px; }
      /* lyric stage */
      #stage { position: absolute; left: 0; right: 0; top: 0; bottom: 0; z-index: 4; }
      .line { position: absolute; left: 50%; top: 50%; width: 1560px;
        transform: translate(-50%, -50%); text-align: center; opacity: 0; will-change: opacity, transform; }
      .line .en { color: #fff; font-weight: 800; font-size: 76px; line-height: 1.1; letter-spacing: -1px;
        text-shadow: 0 4px 30px rgba(0,0,0,0.6); }
      .line .jp { color: #ffd24a; font-family: "Noto Sans JP", sans-serif; font-weight: 700; font-size: 44px;
        line-height: 1.3; margin-top: 26px; text-shadow: 0 4px 24px rgba(0,0,0,0.55); }
      /* next-line preview */
      #ondeck { position: absolute; left: 50%; bottom: 132px; transform: translateX(-50%); z-index: 4;
        width: 1400px; text-align: center; opacity: 0; }
      #ondeck .en { color: rgba(255,255,255,0.5); font-weight: 600; font-size: 34px; line-height: 1.15; }
      /* progress + watermark */
      #barwrap { position: absolute; left: 0; right: 0; bottom: 0; height: 6px; z-index: 6; background: rgba(255,255,255,0.12); }
      #bar { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: left center; transform: scaleX(0);
        background: linear-gradient(90deg, #ffd24a, #ff8a3c); }
      #wm { position: absolute; right: 44px; bottom: 34px; z-index: 6; color: rgba(255,255,255,0.66);
        font-size: 24px; font-weight: 700; letter-spacing: 1px; }
      /* intro title card (歌唱前のインストゥルメンタル区間を埋める) */
      #intro { position: absolute; inset: 0; z-index: 7; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 30px; opacity: 0; }
      #intro img { width: 340px; height: 340px; border-radius: 20px; object-fit: cover;
        box-shadow: 0 24px 80px rgba(0,0,0,0.7); border: 1px solid rgba(255,255,255,0.16); }
      #intro .t { color: #fff; font-size: 84px; font-weight: 900; letter-spacing: -2px; }
      #intro .a { color: #ffd24a; font-size: 38px; font-weight: 700; letter-spacing: 1px; margin-top: -14px; }
      #intro .s { color: rgba(255,255,255,0.55); font-family: "Noto Sans JP", sans-serif;
        font-size: 26px; font-weight: 500; letter-spacing: 4px; margin-top: 8px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${DUR}">
      <audio src="${audioFile}" data-start="0" data-duration="${DUR}"></audio>
      <section class="clip" data-start="0" data-duration="${DUR}" data-track-index="1" style="position:absolute;inset:0;">
        <div id="bg"></div>
        <div id="tint"></div>
        <div id="header">
          <img id="cover" src="assets/cover.jpg" alt="" />
          <div id="meta"><div class="t">${esc(title)}</div><div class="a">${esc(artist)}</div></div>
        </div>
        <div id="stage"></div>
        <div id="ondeck"><div class="en"></div></div>
        <div id="barwrap"><div id="bar"></div></div>
        <div id="wm">waxthink.com</div>
        <div id="intro">
          <img src="assets/cover.jpg" alt="" />
          <div class="t">${esc(title)}</div>
          <div class="a">${esc(artist)}</div>
          <div class="s">LYRICS ＋ 日本語対訳</div>
        </div>
      </section>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const DUR = ${DUR};
      const CUES = ${JSON.stringify(payload)};
      const stage = document.getElementById("stage");
      const ondeckEl = document.getElementById("ondeck");
      const ondeckEn = ondeckEl.querySelector(".en");

      // build line nodes
      const nodes = CUES.map((c, i) => {
        const el = document.createElement("div");
        el.className = "line";
        el.id = "ln" + i;
        const en = document.createElement("div"); en.className = "en"; en.textContent = c.e;
        const jp = document.createElement("div"); jp.className = "jp"; jp.textContent = c.j;
        el.appendChild(en); el.appendChild(jp);
        stage.appendChild(el);
        return el;
      });

      const tl = gsap.timeline({ paused: true });
      // background slow ken-burns across whole duration
      tl.fromTo("#bg", { scale: 1.12 }, { scale: 1.26, ease: "none", duration: DUR }, 0);
      // progress bar
      tl.fromTo("#bar", { scaleX: 0 }, { scaleX: 1, ease: "none", duration: DUR }, 0);
      // intro title card: 最初の歌詞が出るまでの無字幕区間を埋める（4秒以上あるときだけ）
      const FIRST = CUES.length ? CUES[0].s : 0;
      const introOut = Math.max(0, FIRST - 1.0);
      if (FIRST >= 4) {
        tl.fromTo("#intro", { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 1.0, ease: "power2.out" }, 0.3);
        tl.to("#intro", { opacity: 0, scale: 1.04, duration: 0.8, ease: "power2.in" }, introOut);
      }
      // header intro（タイトルカードが消えてから）
      tl.fromTo("#header", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" },
        FIRST >= 4 ? introOut + 0.4 : 0.2);

      // per-line kinetic show/hide (seek-safe absolute times)
      CUES.forEach((c, i) => {
        const el = nodes[i];
        const inT = Math.max(0, c.s);
        const outT = Math.max(inT + 0.5, c.d);
        tl.fromTo(el, { opacity: 0, y: 42 }, { opacity: 1, y: 0, duration: 0.42, ease: "power3.out" }, inT);
        tl.to(el, { opacity: 0, y: -30, duration: 0.32, ease: "power2.in" }, outT - 0.16);
        // stagger eng then jpn for a "flowing" feel
        tl.fromTo(el.querySelector(".jp"), { opacity: 0 }, { opacity: 1, duration: 0.34, ease: "power2.out" }, inT + 0.16);
      });

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;

fs.writeFileSync(outPath, html);
console.log(`wrote ${outPath}`);
console.log(`duration ${DUR}s, ${cues.length} lines`);
