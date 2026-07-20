#!/usr/bin/env node
/**
 * align-and-chunk.mjs
 * full-lines.json(全歌詞87行・eng/jpn)をwhisper単語列にNeedleman-Wunsch大域アライメントし、
 * 各行をカンマ単位でeng/jpn並行チャンクに小分けして、単語タイムスタンプで各チャンクに時刻を付ける。
 * 歌詞テキストは出力しない（構造と件数のみ）。
 *
 * Usage: node agent/src/align-and-chunk.mjs --slug <slug> --whisper /tmp/x.json [--duration 327.5]
 * 出力: agent/{slug}/assets/full-cues.json  [{ eng, jpn, start, end }]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(`--${n}`); if (i !== -1) return args[i + 1]; const kv = args.find(a => a.startsWith(`--${n}=`)); return kv ? kv.split("=")[1] : d; };
const slug = getArg("slug");
if (!slug) { console.error("--slug required"); process.exit(1); }
const whisperPath = getArg("whisper", `/tmp/${slug}_full_whisper.json`);
const audioDur = parseFloat(getArg("duration", "0")) || null;

const norm = (s) => (s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// --- whisper words ---
const wj = JSON.parse(fs.readFileSync(whisperPath, "utf-8"));
const W = [];
for (const s of wj.transcription || []) {
  const t = norm((s.text || "").replace(/\[[^\]]*\]/g, ""));
  if (!t) continue;
  for (const tok of t.split(" ")) W.push({ w: tok, t: (s.offsets?.from ?? 0) / 1000 });
}
const DUR = audioDur || (W.length ? W[W.length - 1].t + 3 : 0);

// --- full lines ---
const lines = JSON.parse(fs.readFileSync(path.join(AGENT, slug, "assets", "full-lines.json"), "utf-8"));

// article word stream + per-line word ranges
const A = [];
const lineStart = [];
for (let li = 0; li < lines.length; li++) {
  const toks = norm(lines[li].eng).split(" ").filter(Boolean);
  lineStart.push(A.length);
  for (const w of toks) A.push({ w, li });
}
lineStart.push(A.length);

// --- Needleman-Wunsch ---
const n = A.length, m = W.length;
const MATCH = 2, MIS = -1, GAP = -1;
const prev = new Float32Array(m + 1), curr = new Float32Array(m + 1);
const move = new Uint8Array((n + 1) * (m + 1));
for (let j = 0; j <= m; j++) { prev[j] = j * GAP; move[j] = 2; }
for (let i = 1; i <= n; i++) {
  curr[0] = i * GAP; move[i * (m + 1)] = 1;
  const aw = A[i - 1].w;
  for (let j = 1; j <= m; j++) {
    const diag = prev[j - 1] + (aw === W[j - 1].w ? MATCH : MIS);
    const up = prev[j] + GAP, left = curr[j - 1] + GAP;
    let best = diag, mv = 0;
    if (up > best) { best = up; mv = 1; }
    if (left > best) { best = left; mv = 2; }
    curr[j] = best; move[i * (m + 1) + j] = mv;
  }
  prev.set(curr);
}
const alignedT = new Float64Array(n).fill(NaN);
let i = n, j = m;
while (i > 0 && j > 0) {
  const mv = move[i * (m + 1) + j];
  if (mv === 0) { if (A[i - 1].w === W[j - 1].w) alignedT[i - 1] = W[j - 1].t; i--; j--; }
  else if (mv === 1) i--; else j--;
}

// per-line start = first aligned word time in the line
const lineStartT = lines.map((_, li) => {
  for (let ai = lineStart[li]; ai < lineStart[li + 1]; ai++) if (!isNaN(alignedT[ai])) return alignedT[ai];
  return null;
});
// interpolate missing line starts
const known = lineStartT.map((t, k) => (t != null ? k : -1)).filter(k => k >= 0);
let directCount = known.length;
if (!known.length) { console.error("alignment failed"); process.exit(1); }
if (lineStartT[0] == null && known[0] > 0) {
  const f = known[0], back = Math.max(0, lineStartT[f] - f * 2.0);
  lineStartT[0] = back;
  for (let x = 1; x < f; x++) lineStartT[x] = back + (lineStartT[f] - back) / f * x;
}
for (let k = 0; k < known.length - 1; k++) {
  const a = known[k], b = known[k + 1], step = (lineStartT[b] - lineStartT[a]) / (b - a);
  for (let x = a + 1; x < b; x++) if (lineStartT[x] == null) lineStartT[x] = lineStartT[a] + step * (x - a);
}
const lastK = known[known.length - 1];
for (let x = lastK + 1; x < lines.length; x++) if (lineStartT[x] == null) lineStartT[x] = Math.min(DUR - 1, lineStartT[lastK] + (x - lastK) * 2.0);
for (let x = 1; x < lines.length; x++) if (lineStartT[x] < lineStartT[x - 1] + 0.15) lineStartT[x] = lineStartT[x - 1] + 0.15;

// --- chunking ---
// 方針(2026-07-20改訂): 細切れ禁止。長い行だけを2（超長文のみ3）に割る。
// 分割点はカンマ優先、各チャンク MIN_WORDS 語以上。日本語は「語の途中で切らない」安全境界のみ許可し、
// 安全に割れない行は分割しない（丸ごと1キューのまま出す）。
const MIN_WORDS = 5;        // 1チャンクの最小英単語数
const SPLIT_MIN_WORDS = 11; // これ未満の行は分割しない
const TRI_MIN_WORDS = 20;   // これ以上なら3分割まで許す
const JPN_MIN_CHARS = 7;    // 1チャンクの最小日本語文字数

function chunkEng(s) {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < SPLIT_MIN_WORDS) return [s];
  const K = words.length >= TRI_MIN_WORDS ? 3 : 2;
  // カンマ直後の語インデックスを分割候補に
  const commaIdx = [];
  for (let w = 0; w < words.length - 1; w++) if (/[,;]$/.test(words[w])) commaIdx.push(w + 1);
  const bounds = [0];
  for (let c = 1; c < K; c++) {
    const ideal = Math.round(words.length * c / K);
    let best = ideal, bd = 1e9;
    for (const q of commaIdx) { const d = Math.abs(q - ideal); if (d < bd && d <= 3) { bd = d; best = q; } }
    if (best - bounds[bounds.length - 1] < MIN_WORDS) continue;
    if (words.length - best < MIN_WORDS * (K - c)) continue;
    bounds.push(best);
  }
  bounds.push(words.length);
  const out = [];
  for (let b = 0; b < bounds.length - 1; b++) out.push(words.slice(bounds[b], bounds[b + 1]).join(" "));
  return out.length ? out : [s];
}

// 日本語の安全な分割境界か（語の途中・カタカナ語の途中・「の」直後などで切らない）
const isKatakana = (ch) => /[゠-ヿ]/.test(ch);
const isKanji = (ch) => /[一-鿿]/.test(ch);
const isLatin = (ch) => /[A-Za-z0-9']/.test(ch);
const NG_PREV = "のなにはがをでとへもっーゃゅょ、・「『（【“‘";
const NG_NEXT = "、。ーっゃゅょ！？」』）】…・”’";
function safeBoundary(jpn, b) {
  if (b <= 0 || b >= jpn.length) return false;
  const p = jpn[b - 1], q = jpn[b];
  if (p === "、") return true; // 読点直後は常に安全
  if (NG_PREV.includes(p) || NG_NEXT.includes(q)) return false;
  if (isKatakana(p) && isKatakana(q)) return false;
  if (isLatin(p) && isLatin(q)) return false;
  if (isKanji(p) && isKanji(q)) return false;
  if (/[぀-ゟ]/.test(q)) return false; // 次がひらがな＝活用語尾/助詞の途中の可能性が高い（読点直後のみ許可）
  return true;
}

// Japanese → exactly K parts. 安全境界が見つからない／短すぎる場合は null（＝行を割らない）。
function partitionJpn(jpn, engChunks) {
  const K = engChunks.length;
  if (K <= 1 || jpn.length < JPN_MIN_CHARS * K) return null;
  const totalE = engChunks.reduce((a, c) => a + c.length, 0) || 1;
  const win = Math.max(4, Math.round(jpn.length * 0.22));
  const bounds = [0];
  let acc = 0;
  for (let c = 0; c < K - 1; c++) {
    acc += engChunks[c].length;
    const ideal = Math.round(jpn.length * acc / totalE);
    let best = null, bd = 1e9;
    for (let d = 0; d <= win; d++) {
      for (const cand of d === 0 ? [ideal] : [ideal - d, ideal + d]) {
        if (cand - bounds[bounds.length - 1] < JPN_MIN_CHARS) continue;
        if (jpn.length - cand < JPN_MIN_CHARS * (K - 1 - c)) continue;
        if (!safeBoundary(jpn, cand)) continue;
        if (d < bd) { bd = d; best = cand; }
      }
      if (best != null) break;
    }
    if (best == null) return null;
    bounds.push(best);
  }
  bounds.push(jpn.length);
  const res = [];
  for (let b = 0; b < bounds.length - 1; b++) res.push(jpn.slice(bounds[b], bounds[b + 1]).trim());
  return res.length === K && res.every(Boolean) ? res : null;
}

const cues = [];
for (let li = 0; li < lines.length; li++) {
  const L = lines[li];
  const lineT = lineStartT[li];
  const lineEnd = li + 1 < lines.length ? lineStartT[li + 1] : Math.min(lineT + 4, DUR);
  const ec = chunkEng(L.eng);
  const jc = ec.length > 1 ? partitionJpn(L.jpn, ec) : null;
  if (ec.length >= 2 && jc && jc.length === ec.length) {
    let tokOff = 0;
    const chunkStartTok = [];
    for (let c = 0; c < ec.length; c++) { chunkStartTok.push(tokOff); tokOff += norm(ec[c]).split(" ").filter(Boolean).length; }
    const chunkT = chunkStartTok.map((off) => {
      const ai = lineStart[li] + off;
      for (let a = ai; a < lineStart[li + 1]; a++) if (!isNaN(alignedT[a])) return alignedT[a];
      return null;
    });
    if (chunkT[0] == null) chunkT[0] = lineT;
    for (let c = 1; c < chunkT.length; c++) {
      if (chunkT[c] == null) {
        let nextKnown = lineEnd, nk = -1;
        for (let d = c + 1; d < chunkT.length; d++) if (chunkT[d] != null) { nextKnown = chunkT[d]; nk = d; break; }
        const steps = (nk === -1 ? chunkT.length : nk) - (c - 1);
        chunkT[c] = chunkT[c - 1] + (nextKnown - chunkT[c - 1]) / steps;
      }
    }
    for (let c = 0; c < ec.length; c++) {
      const st = Math.max(lineT, chunkT[c]);
      const en = c + 1 < ec.length ? chunkT[c + 1] : lineEnd;
      cues.push({ eng: ec[c], jpn: jc[c], start: st, end: en });
    }
  } else {
    cues.push({ eng: L.eng, jpn: L.jpn, start: lineT, end: lineEnd });
  }
}

// clean monotonic + rounding + min duration
for (let k = 1; k < cues.length; k++) if (cues[k].start < cues[k - 1].start + 0.12) cues[k].start = cues[k - 1].start + 0.12;
for (let k = 0; k < cues.length; k++) {
  cues[k].start = Math.round(cues[k].start * 100) / 100;
  let en = k + 1 < cues.length ? Math.min(cues[k].end, cues[k + 1].start - 0.03) : cues[k].end;
  cues[k].end = Math.round(Math.max(cues[k].start + 0.4, en) * 100) / 100;
}

fs.writeFileSync(path.join(AGENT, slug, "assets", "full-cues.json"), JSON.stringify(cues, null, 2));

const gaps = [];
for (let k = 1; k < cues.length; k++) { const g = cues[k].start - cues[k - 1].end; if (g > 3) gaps.push(`${cues[k-1].end}s→${cues[k].start}s(${g.toFixed(1)})`); }
console.log(`lines ${lines.length} (direct-aligned ${directCount}/${lines.length}=${Math.round(directCount/lines.length*100)}%) → cues ${cues.length}`);
console.log(`span ${cues[0].start}s–${cues[cues.length-1].end}s (audio ${DUR.toFixed(1)}s)`);
console.log(`blank gaps >3s: ${gaps.length ? gaps.join(", ") : "none"}`);
