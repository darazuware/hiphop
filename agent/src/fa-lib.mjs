/**
 * fa-lib.mjs — フォースドアライメント系スクリプトの共通部品。
 * 歌詞テキストは一切stdoutに出さない（構造・件数・秒数のみ）。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AGENT = path.resolve(__dirname, "..");

export const assetsOf = (slug) => path.join(AGENT, slug, "assets");
export const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/** fa-align.py の norm と同じトークン化（MMS_FA は a-z と ' のみ） */
export function faTokens(s) {
  return (s || "").toLowerCase().replace(/[’]/g, "'")
    .replace(/[^a-z' ]/g, " ").split(/\s+/).filter((w) => /[a-z]/.test(w));
}

/** 表示語（記号付きの元の見た目）を保ったままの分割 */
export const dispWords = (s) => (s || "").trim().split(/\s+/).filter(Boolean);

/** cue-history へ世代バックアップ（cue-editor と同じ場所） */
export function backupCues(slug) {
  const dir = path.join(assetsOf(slug), "cue-history");
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(assetsOf(slug), "full-cues.json");
  if (!fs.existsSync(src)) return null;
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  const dst = path.join(dir, `full-cues.${stamp}.json`);
  fs.copyFileSync(src, dst);
  return path.basename(dst);
}

/**
 * FA語列の健全性を見て信頼度(0..1)と要因フラグを返す。
 * 低いほど「人が波形を見て直すべき行」。
 */
export function scoreWords(words, opts = {}) {
  const flags = [];
  if (!words || !words.length) return { conf: 0, flags: ["no-fa"] };
  let conf = 1;
  const durs = words.map((w) => w.e - w.s);
  const avg = durs.reduce((a, b) => a + b, 0) / durs.length;
  if (avg < 0.05) { conf -= 0.45; flags.push("word-too-short"); }
  if (avg > 1.2) { conf -= 0.35; flags.push("word-too-long"); }
  if (durs.some((d) => d <= 0)) { conf -= 0.5; flags.push("zero-dur"); }
  const maxGap = words.slice(1).reduce((m, w, i) => Math.max(m, w.s - words[i].e), 0);
  if (maxGap > (opts.gapTh ?? 0.9)) { conf -= 0.2; flags.push(`inner-gap-${maxGap.toFixed(1)}s`); }
  const span = words[words.length - 1].e - words[0].s;
  if (span > (opts.spanTh ?? 9)) { conf -= 0.25; flags.push(`span-${span.toFixed(1)}s`); }
  if (words.length === 1) { conf -= 0.1; flags.push("single-word"); }
  return { conf: Math.max(0, Math.round(conf * 100) / 100), flags };
}

/** 秒配列の統計（デバッグ表示用） */
export function stat(arr) {
  if (!arr.length) return "n=0";
  const a = arr.slice().sort((x, y) => x - y);
  const q = (p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  const abs = arr.map(Math.abs).sort((x, y) => x - y);
  return `n=${a.length} p10=${q(0.1).toFixed(2)} med=${q(0.5).toFixed(2)} p90=${q(0.9).toFixed(2)} |med|=${abs[Math.floor(abs.length / 2)].toFixed(2)}`;
}
