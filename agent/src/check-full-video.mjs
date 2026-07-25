#!/usr/bin/env node
/**
 * check-full-video.mjs
 * 横長フル歌詞動画のDoD機械検証（歌詞テキストは一切出力しない・構造と件数のみ）。
 * ✅/❌サマリーを出し、❌が1つでもあれば exit 1。
 *
 * Usage: node agent/src/check-full-video.mjs {slug} [--require-render]
 *   --require-render: renders/{slug}-full.mp4 の存在と尺一致まで必須にする（最終確認用）
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith("--"));
const requireRender = args.includes("--require-render");
if (!slug) { console.error("usage: node agent/src/check-full-video.mjs {slug} [--require-render]"); process.exit(1); }

const assets = path.join(AGENT, slug, "assets");
const fullDir = path.join(AGENT, slug, "full");
let fails = 0, warns = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const ng = (m) => { console.log(`  ❌ ${m}`); fails++; };
const wn = (m) => { console.log(`  ⚠  ${m}`); warns++; };

const ffprobeDur = (file) => {
  try { return parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf-8" }).trim()); }
  catch { return null; }
};

console.log(`[FILES] ${slug}`);
const audioPath = path.join(assets, "audio-full.mp3");
const cuesPath = path.join(assets, "full-cues.json");
for (const [name, p] of [["audio-full.mp3", audioPath], ["cover.jpg", path.join(assets, "cover.jpg")], ["full-cues.json", cuesPath]]) {
  fs.existsSync(p) ? ok(name) : ng(`${name} がない`);
}
if (!fs.existsSync(cuesPath) || !fs.existsSync(audioPath)) { console.log(`\n❌ ${fails}件`); process.exit(1); }

const audioDur = ffprobeDur(audioPath);
audioDur ? ok(`音源 ${audioDur.toFixed(1)}s`) : ng("音源の尺が取れない（ffprobe失敗）");

console.log("[CUES] 構造");
let cues;
try { cues = JSON.parse(fs.readFileSync(cuesPath, "utf-8")); } catch (e) { ng("full-cues.json がJSONとして壊れている"); console.log(`\n❌ ${fails}件`); process.exit(1); }
if (!Array.isArray(cues) || !cues.length) ng("キューが0件");
else {
  ok(`${cues.length}キュー`);
  let overlap = 0, shortDur = 0, emptyEng = 0, nonMono = 0, badKeys = 0;
  let jpnFilled = 0, midWord = 0, tooLong = 0, maxGap = 0;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (typeof c.eng !== "string" || typeof c.jpn !== "string" || typeof c.start !== "number" || typeof c.end !== "number") { badKeys++; continue; }
    if (!c.eng.trim()) emptyEng++;
    if ((c.jpn || "").trim()) jpnFilled++;
    if (c.end - c.start < 0.4 - 1e-9) shortDur++;
    if (c.eng.split(/\s+/).length > 12) tooLong++;
    if (/^[、。ーっゃゅょ]/.test(c.jpn) || /^[぀-ゟ]、/.test(c.jpn)) midWord++;
    if (i > 0) {
      if (c.start < cues[i - 1].start) nonMono++;
      if (c.start < cues[i - 1].end - 0.01) overlap++;
      maxGap = Math.max(maxGap, c.start - cues[i - 1].end);
    }
  }
  badKeys ? ng(`型不正のキュー ${badKeys}件（eng/jpn/start/end）`) : ok("全キューの型OK");
  emptyEng ? ng(`engが空のキュー ${emptyEng}件`) : ok("engが空のキューなし");
  nonMono ? ng(`startが逆行 ${nonMono}件`) : ok("start単調増加");
  overlap ? ng(`時間の重なり ${overlap}件`) : ok("重なりなし");
  shortDur ? ng(`表示0.4s未満 ${shortDur}件`) : ok("最短表示OK（全て0.4s以上）");
  if (audioDur) {
    const last = cues[cues.length - 1].end, first = cues[0].start;
    (first >= 0 && last <= audioDur + 1.5) ? ok(`区間 ${first.toFixed(1)}s–${last.toFixed(1)}s（音源内）`) : ng(`キュー区間が音源(${audioDur.toFixed(1)}s)からはみ出る: ${first.toFixed(1)}–${last.toFixed(1)}s`);
  }
  maxGap > 8 ? wn(`最大の無字幕ギャップ ${maxGap.toFixed(1)}s（間奏なら正常）`) : ok(`無字幕ギャップ最大 ${maxGap.toFixed(1)}s`);
  tooLong ? wn(`13語以上の長い行 ${tooLong}件（分割推奨）`) : ok("長すぎる行なし");
  midWord ? wn(`日本語が語中開始の疑い ${midWord}件`) : ok("日本語の語中開始なし");
  const rate = Math.round(jpnFilled / cues.length * 100);
  if (jpnFilled === cues.length) ok("日本語 全行入力済み");
  else if (jpnFilled === 0) wn("日本語 全行未入力（whisper取り込み直後？）");
  else wn(`日本語 入力率 ${rate}%（未入力 ${cues.length - jpnFilled}行）`);
}

console.log("[FA] 強制アライメント整合");
{
  const fw = path.join(assets, "fa_words.json");
  if (!fs.existsSync(fw)) wn("fa_words.json 未生成（node agent/src/fa-align.mjs --slug " + slug + "）— 時刻が推定値のままの可能性");
  else {
    let W = null;
    try { W = JSON.parse(fs.readFileSync(fw, "utf-8")); } catch { ng("fa_words.json がJSONとして壊れている"); }
    if (W) {
      if (W.length !== cues.length) wn(`fa_words(${W.length}) と cues(${cues.length}) の件数不一致 → fa-align.mjs を再実行`);
      else {
        const tok = (s) => (s || "").toLowerCase().replace(/[’]/g, "'").replace(/[^a-z' ]/g, " ").split(/\s+/).filter((w) => /[a-z]/.test(w));
        let miss = 0, off = 0, worst = 0;
        for (let i = 0; i < cues.length; i++) {
          const wl = W[i], n = tok(cues[i].eng).length;
          if (!wl || wl.length !== n) { if (n) miss++; continue; }
          const d = Math.abs(cues[i].start - wl[0].s);
          if (d > 0.35) off++;
          worst = Math.max(worst, d);
        }
        miss ? wn(`FA語数がキュー本文と不一致 ${miss}件（分割後に fa-align 再実行を）`) : ok("全キューでFA語数一致");
        off ? wn(`startが実発声から0.35s以上ズレ ${off}件（最大${worst.toFixed(2)}s）→ fa-retime.mjs --apply`) : ok(`startは実発声に整合（最大ズレ ${worst.toFixed(2)}s）`);
      }
    }
  }
  const low = cues.filter((c) => typeof c.conf === "number" && c.conf < 0.6).length;
  if (low) wn(`要確認(conf<0.6) ${low}件 — エディタの✓lintで一覧・触れば消える`);
}

console.log("[COMP] 作曲");
const idx = path.join(fullDir, "index.html");
if (!fs.existsSync(idx)) wn("full/index.html 未生成（エディタの「再生成＋レンダー」または gen-full-composition.mjs で生成）");
else {
  const html = fs.readFileSync(idx, "utf-8");
  const m = html.match(/data-duration="([\d.]+)"/);
  const compDur = m ? parseFloat(m[1]) : null;
  const lastEnd = cues[cues.length - 1].end;
  if (!compDur) ng("index.html に data-duration がない");
  else if (Math.abs(compDur - (lastEnd + 1.5)) > 3) wn(`compの尺 ${compDur}s がキュー末尾+1.5s(${(lastEnd + 1.5).toFixed(1)}s)と乖離 → キュー更新後は再生成を`);
  else ok(`compの尺 ${compDur}s（キューと整合）`);
  for (const a of ["assets/cover.jpg", "assets/audio-full.mp3"]) {
    fs.existsSync(path.join(fullDir, a)) ? ok(`full/${a}`) : ng(`full/${a} がない（gen-full-compositionがコピーする）`);
  }
}

console.log("[MP4] レンダー");
const mp4 = path.join(fullDir, "renders", `${slug}-full.mp4`);
if (!fs.existsSync(mp4)) { requireRender ? ng("renders/*-full.mp4 がない") : wn("未レンダー"); }
else {
  const vDur = ffprobeDur(mp4);
  const lastEnd = cues[cues.length - 1].end;
  if (!vDur) ng("mp4の尺が取れない");
  else if (Math.abs(vDur - (lastEnd + 1.5)) > 3) (requireRender ? ng : wn)(`mp4の尺 ${vDur.toFixed(1)}s がキュー(${(lastEnd + 1.5).toFixed(1)}s)と乖離 → 再レンダーを`);
  else ok(`mp4 ${vDur.toFixed(1)}s（キューと整合・${(fs.statSync(mp4).size / 1e6).toFixed(0)}MB）`);
  if (fs.existsSync(idx) && fs.statSync(mp4).mtimeMs < fs.statSync(cuesPath).mtimeMs) wn("mp4がキュー保存より古い → 再レンダーを");
}

console.log(fails ? `\n❌ ${fails}件（⚠ ${warns}件）` : `\n✅ 合格（⚠ ${warns}件）`);
process.exit(fails ? 1 : 0);
