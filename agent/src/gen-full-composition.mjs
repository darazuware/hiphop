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

// title/artist: 引数 > meta.json（YouTube取り込み曲） > songs.ts > slug
let title = getArg("title"), artist = getArg("artist");
if (!title || !artist) {
  const metaPath = path.join(AGENT, slug, "assets", "meta.json");
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      title = title || meta.title;
      artist = artist || meta.artist;
    } catch {}
  }
}
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

// word-gap stagger: 行を割らずに、実発声の「間」で後半の語群を遅らせて表示する
const noStagger = args.includes("--no-stagger");
const WORD_GAP_TH = parseFloat(getArg("word-gap", "0.35"));
const faWordsPath = path.join(AGENT, slug, "assets", "fa_words.json");
let faWords = null;
if (fs.existsSync(faWordsPath)) {   // 語秒は訳の後出し判定にも使うので --no-stagger でも読む
  try { faWords = JSON.parse(fs.readFileSync(faWordsPath, "utf-8")); } catch {}
}
function segsFromCuts(cuts, words, faw, overrides) {
  const bounds = [0, ...cuts, words.length];
  const segs = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const from = bounds[i], to = bounds[i + 1];
    const ov = overrides && typeof overrides[from] === "number" ? overrides[from] : null;
    segs.push({ text: words.slice(from, to).join(" "), revealT: ov != null ? ov : faw[from].s });
  }
  return segs;
}

// 間の無い密なラップ行（歌唱の「間」を検出できない）はガード[D]対象外の一括分割方式では拾えないため、
// 実発声の語秒に沿って一定語数ごとに区切って"流す"（typewriter的に音に追従させる）。
// 意味の切れ目ではなく機械的な語数割りだが、静止したブロックが4秒近く動かないよりは声に同期して見える。
const FLOW_GROUP = parseInt(getArg("flow-group", "3"), 10);       // 何語ごとに区切るか
const FLOW_MIN_WORDS = parseInt(getArg("flow-min-words", "6"), 10); // これ未満は対象外（既に短い）
const FLOW_MIN_SPAN = parseFloat(getArg("flow-min-span", "2.0"));   // 発声span がこれ未満なら対象外（短い行はflowの割に訳の表示時間が削れるので割に合わない）
const noFlow = args.includes("--no-flow");

function buildSegments(cue, faw) {
  if (!faw || !Array.isArray(faw) || !faw.length) return null;
  const words = (cue.eng || "").trim().split(/\s+/).filter(Boolean);
  if (words.length !== faw.length) return null; // whisper再文字起こし等でズレていたら安全側でスキップ

  if (Array.isArray(cue.stagger)) {
    // エディタで手動固定済み。[]なら常に一括表示（自動判定もflowも無視）
    // staggerT: 語インデックス→実測秒（自動判定のFA語頭秒がズレている時のエディタ側の手動上書き）
    const cuts = cue.stagger.filter((k) => k > 0 && k < words.length);
    return cuts.length ? segsFromCuts(cuts, words, faw, cue.staggerT) : null;
  }

  // 1) 実発声の「間」で切る（優先）
  const gapCuts = [];
  for (let k = 1; k < faw.length; k++) if (faw[k].s - faw[k - 1].e > WORD_GAP_TH) gapCuts.push(k);
  if (gapCuts.length) return segsFromCuts(gapCuts, words, faw);

  // 2) 間が無い密なラップ行は、一定語数ごとに実発声タイミングで区切って流す
  if (!noFlow && words.length >= FLOW_MIN_WORDS) {
    const span = faw[faw.length - 1].e - faw[0].s;
    if (span >= FLOW_MIN_SPAN) {
      const flowCuts = [];
      for (let k = FLOW_GROUP; k < words.length; k += FLOW_GROUP) flowCuts.push(k);
      if (flowCuts.length) return segsFromCuts(flowCuts, words, faw);
    }
  }
  return null;
}

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
const payload = cues.map((c, i) => {
  const entry = { e: c.eng, j: c.jpn, s: c.start, d: c.end };
  const segs = noStagger ? null : buildSegments(c, faWords && faWords[i]);
  if (segs && segs.length > 1) entry.segs = segs;
  if (typeof c.scale === "number" && c.scale !== 1) entry.sc = c.scale;   // 強調したい行の文字サイズ倍率
  if (c.color) entry.co = c.color;
  if (c.jpColor) entry.jco = c.jpColor;
  // 最後の語が歌われ始める時刻（＝落ちが着地する瞬間）。訳はここまで伏せる
  const faw = faWords && faWords[i];
  const wn = (c.eng || "").trim().split(/\s+/).filter(Boolean).length;
  if (faw && faw.length && faw.length === wn) entry.lw = Math.round(faw[faw.length - 1].s * 100) / 100;
  if (typeof c.jpT === "number") entry.jt = c.jpT; // 訳の出現秒（エディタで実測固定・絶対秒）
  return entry;
});

// 日本語の出るタイミング。after-en＝英語が出そろってから（先に訳が見えるネタバレを防ぐ）
const jpTiming = getArg("jp-timing", "after-en");
const JP_DELAY = parseFloat(getArg("jp-delay", "0.16"));        // sync時の遅延
// 訳を遅らせるほどネタバレは減るが、訳を読む時間も減る。キュー尺が2秒前後のラップでは
// 1.2秒遅らせると読字速度が14字/秒（字幕の目安は4〜8字/秒）になり実質読めない。既定は控えめ。
// JP_MIN_SHOWは「表示時間の確保」であって「英語より前に出す理由」にしてはいけない
// （segsがある行でこれを大きくすると、最後の語群が出る前に訳が見えるスポイラーになる。実測で修正済み）。
const JP_MIN_SHOW = parseFloat(getArg("jp-min-show", "0.3"));   // どうしても収まらない時だけ前倒しする最終フロア
const JP_MAX_DELAY = parseFloat(getArg("jp-max-delay", "0.7")); // segsが無い行にだけ効く遅延上限
const JP_FRAC = parseFloat(getArg("jp-frac", "0.35"));          // 語秒もsegsも無い行は尺のこの割合だけ遅らせる

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
      const JP_TIMING = ${JSON.stringify(jpTiming)};
      const JP_DELAY = ${JP_DELAY};
      const JP_MIN_SHOW = ${JP_MIN_SHOW}, JP_MAX_DELAY = ${JP_MAX_DELAY}, JP_FRAC = ${JP_FRAC};
      // 改行(\\n)は <br> にする。テキストはtextContent経由なのでHTMLは混入しない
      function putText(host, s){
        String(s == null ? "" : s).split("\\n").forEach((part, k) => {
          if (k) host.appendChild(document.createElement("br"));
          host.appendChild(document.createTextNode(part));
        });
      }
      const stage = document.getElementById("stage");
      const ondeckEl = document.getElementById("ondeck");
      const ondeckEn = ondeckEl.querySelector(".en");

      // build line nodes
      const nodes = CUES.map((c, i) => {
        const el = document.createElement("div");
        el.className = "line";
        el.id = "ln" + i;
        const en = document.createElement("div"); en.className = "en";
        if (c.segs && c.segs.length > 1) {
          c.segs.forEach((seg, si) => {
            const sp = document.createElement("span"); sp.className = "seg";
            putText(sp, seg.text);
            en.appendChild(sp);
            if (si < c.segs.length - 1) en.appendChild(document.createTextNode(" "));
          });
        } else {
          putText(en, c.e);
        }
        const jp = document.createElement("div"); jp.className = "jp";
        putText(jp, c.j);
        if (c.sc) { en.style.fontSize = (76 * c.sc) + "px"; jp.style.fontSize = (44 * c.sc) + "px"; }
        if (c.co) en.style.color = c.co;
        if (c.jco) jp.style.color = c.jco;
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

        // word-gap stagger: 行の後半語群を、実発声タイミングまで遅らせて表示（行は割らない）
        const REVEAL_DUR = 0.24;
        let lastReveal = inT;
        if (c.segs && c.segs.length > 1) {
          const segEls = el.querySelectorAll(".en .seg");
          const FADE_LEAD = 0.16; // 行全体のfade-outが始まる outT からのリード
          const minRevealT = inT + 0.15;
          const maxRevealT = Math.max(minRevealT, outT - FADE_LEAD - REVEAL_DUR); // fade-outと重ならない上限
          c.segs.forEach((seg, si) => {
            if (si === 0) return; // 先頭語群は行本体のfromToに乗る
            const segEl = segEls[si];
            tl.set(segEl, { opacity: 0 }, 0);
            const revealT = Math.min(Math.max(seg.revealT, minRevealT), maxRevealT);
            tl.to(segEl, { opacity: 1, duration: REVEAL_DUR, ease: "power2.out" }, revealT);
            if (revealT > lastReveal) lastReveal = revealT;
          });
        }
        // 日本語。訳を英語と同時に全部出すと落ちが先に割れるので、既定(after-en)では
        // 全行で「英語が出そろう／最後の語が歌われ始める」まで訳を伏せる（アンチスポイラーが最優先）。
        // JP_MIN_SHOW は「表示時間を確保したい」という願望に過ぎず、これを理由に英語より前へ
        // 訳を出してはいけない（segsが複数あるのにJP_MAX_DELAYで打ち切ると、最後の語群が出る前に
        // 訳が先に見えてしまう＝旧バグ）。segsがある行はlastRevealへの追従を最優先し、
        // JP_MAX_DELAYはsegsが無い行（c.lw頼み・尺割合頼み）にだけ効かせる。
        let jpAt = inT + JP_DELAY;
        if (typeof c.jt === "number") {
          jpAt = c.jt; // エディタで実測固定済み。自動判定(after-en等)より優先
        } else if (JP_TIMING === "after-en") {
          let base;
          if (lastReveal > inT) base = lastReveal + REVEAL_DUR * 0.7;
          else if (c.lw != null) base = Math.min(c.lw, inT + JP_MAX_DELAY);
          else base = Math.min(inT + (outT - inT) * JP_FRAC, inT + JP_MAX_DELAY);
          base = Math.max(inT + 0.2, base);
          jpAt = Math.min(base, outT - JP_MIN_SHOW); // 収まらない時だけ表示時間を削って間に合わせる（baseより前には出さない）
        }
        tl.fromTo(el.querySelector(".jp"), { opacity: 0 }, { opacity: 1, duration: 0.34, ease: "power2.out" }, jpAt);
      });

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;

fs.writeFileSync(outPath, html);
console.log(`wrote ${outPath}`);
console.log(`duration ${DUR}s, ${cues.length} lines`);
