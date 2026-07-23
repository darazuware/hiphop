#!/usr/bin/env node
/**
 * fa_words.json の語間ギャップで full-cues.json を分割する（gap分割）。
 * 「間」でだけ切り、機能語は後ろの断片へ寄せ、1語孤立は併合する。
 * 新断片の start は単語秒から正確に埋まる。jpn は先頭断片に残す（続き断片は空＝人手/語感で分割）。
 *
 * Usage:
 *   node agent/src/fa-split.mjs --slug <slug> [--th 0.30]        # ドライラン（件数のみ）
 *   node agent/src/fa-split.mjs --slug <slug> [--th 0.30] --apply # full-cues.json を書き換え（履歴バックアップ）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT = path.resolve(__dirname, "..");
const getArg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);
const slug = getArg("slug");
if (!slug) { console.error("Usage: node agent/src/fa-split.mjs --slug <slug> [--th 0.30] [--apply]"); process.exit(1); }
const TH = parseFloat(getArg("th", "0.30"));
const MINW = 2;
const FUNC = new Set("a an the and or but of for to in on at with my your his her its it is i'm i'ma so no now yo".split(" "));

const assets = path.join(AGENT, slug, "assets");
const cuesPath = path.join(assets, "full-cues.json");
const wordsPath = path.join(assets, "fa_words.json");
if (!fs.existsSync(wordsPath)) { console.error(`[fa-split] ${wordsPath} が無い（先に fa-align.mjs）`); process.exit(2); }
const cues = JSON.parse(fs.readFileSync(cuesPath, "utf8"));
const W = JSON.parse(fs.readFileSync(wordsPath, "utf8"));

const out = [];
let breaks = 0;
cues.forEach((c, ci) => {
  const wl = W[ci];
  if (!wl || wl.length === 0) { out.push({ ...c }); return; }
  const cut = new Set();
  for (let i = 0; i < wl.length - 1; i++) if (wl[i + 1].s - wl[i].e > TH) cut.add(i);
  for (const i of [...cut]) if (FUNC.has(wl[i].w) && i > 0) { cut.delete(i); cut.add(i - 1); }
  let frags = [], cur = [];
  for (let i = 0; i < wl.length; i++) { cur.push(i); if (cut.has(i)) { frags.push(cur); cur = []; } }
  if (cur.length) frags.push(cur);
  const merged = [];
  for (const f of frags) { if (f.length < MINW && merged.length) merged[merged.length - 1].push(...f); else merged.push(f); }
  if (merged.length > 1 && merged[0].length < MINW) { merged[1].unshift(...merged[0]); merged.shift(); }
  if (merged.length > 1) breaks += merged.length - 1;
  merged.forEach((f, fi) => {
    let head = 0;
    while (head < f.length - 1 && (wl[f[head + 1]].s - wl[f[head]].e) > TH) head++;
    const start = +wl[f[head]].s.toFixed(2);
    out.push({ eng: f.map(i => wl[i].w).join(" "), jpn: fi === 0 ? (c.jpn || "") : "", start, end: c.end });
  });
});
// 断片の end を後続の start で埋める（連続タイムライン）。原cue境界の end は保持。
for (let i = 0; i < out.length - 1; i++) if (out[i + 1].start > out[i].start) out[i].end = out[i + 1].start;

console.log(`[fa-split] ${cues.length} -> ${out.length} cues (+${breaks} breaks, th=${TH})`);
if (has("apply")) {
  const histDir = path.join(assets, "cue-history");
  fs.mkdirSync(histDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(cuesPath, path.join(histDir, `full-cues.${ts}.json`));
  fs.writeFileSync(cuesPath, JSON.stringify(out, null, 2));
  console.log(`[fa-split] applied. backup -> cue-history/full-cues.${ts}.json`);
} else {
  console.log("[fa-split] dry-run（--apply で書き換え）");
}
