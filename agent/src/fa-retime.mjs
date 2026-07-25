#!/usr/bin/env node
/**
 * fa-retime.mjs
 * full-cues.json の start/end を fa_words.json（強制アライメントの実測語秒）で焼き直す。
 * whisper＋NW補間の推定値をやめ、補間ゼロの実測に置き換えるのが目的。
 *
 * start = 先頭語の発声開始 - LEAD
 * end   = 次キューのstart直前まで保持（ただし末尾語 + HOLD を超えない／最低0.4秒）
 *
 * Usage:
 *   node agent/src/fa-retime.mjs --slug <slug>            # ドライラン（ズレ分布のみ）
 *   node agent/src/fa-retime.mjs --slug <slug> --apply    # 書き換え（cue-historyへ自動バックアップ）
 *   [--lead 0.06] [--hold 1.2] [--gap 0.03] [--conf]      # --conf でconf/flagsをキューに焼く
 *
 * 歌詞テキストは出力しない。
 */
import fs from "fs";
import path from "path";
import { assetsOf, readJson, faTokens, backupCues, scoreWords, stat } from "./fa-lib.mjs";

const getArg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);
const slug = getArg("slug");
if (!slug) { console.error("Usage: node agent/src/fa-retime.mjs --slug <slug> [--apply]"); process.exit(1); }

const LEAD = parseFloat(getArg("lead", "0.06"));
const HOLD = parseFloat(getArg("hold", "1.2"));
const GAP = parseFloat(getArg("gap", "0.03"));

const A = assetsOf(slug);
const cuesPath = path.join(A, "full-cues.json");
const wordsPath = path.join(A, "fa_words.json");
if (!fs.existsSync(cuesPath)) { console.error(`[fa-retime] full-cues.json が無い: agent/${slug}/assets/`); process.exit(2); }
if (!fs.existsSync(wordsPath)) { console.error(`[fa-retime] fa_words.json が無い → 先に node agent/src/fa-align.mjs --slug ${slug}`); process.exit(2); }

const cues = readJson(cuesPath);
const W = readJson(wordsPath);
if (W.length !== cues.length) {
  console.error(`[fa-retime] fa_words(${W.length}) と cues(${cues.length}) の件数が不一致 → fa-align.mjs を再実行`);
  process.exit(3);
}

const out = [];
const dS = [], dE = [];
let skipped = 0, lowConf = 0;

for (let i = 0; i < cues.length; i++) {
  const c = { ...cues[i] };
  const wl = W[i];
  const expect = faTokens(c.eng).length;
  // 語数不一致＝FAが今のキュー本文と対応していない → 触らない（安全側）
  if (!wl || !wl.length || wl.length !== expect) {
    if (expect > 0) skipped++;
    delete c.conf; delete c.flags;
    out.push(c);
    continue;
  }
  const { conf, flags } = scoreWords(wl);
  const ns = Math.max(0, wl[0].s - LEAD);
  dS.push(ns - cues[i].start);
  c.start = ns;
  c._oi = i;                                // 元index（差分表示用）
  c._we = wl[wl.length - 1].e;              // 末尾語の発声終了（end計算用・後で消す）
  if (has("conf")) { c.conf = conf; if (flags.length) c.flags = flags; }
  if (conf < 0.6) lowConf++;
  out.push(c);
}

// 単調化 → end を決める
out.sort((a, b) => a.start - b.start);
for (let i = 1; i < out.length; i++) if (out[i].start < out[i - 1].start + 0.1) out[i].start = out[i - 1].start + 0.1;
for (let i = 0; i < out.length; i++) {
  const c = out[i];
  const hardEnd = i + 1 < out.length ? out[i + 1].start - GAP : c.end;
  const soft = c._we != null ? c._we + HOLD : c.end;
  // 最低表示尺0.4秒は「次のキューに食い込まない範囲で」だけ効かせる（重なり厳禁）
  const en = Math.max(c.start + 0.05, Math.min(hardEnd, Math.max(soft, c.start + 0.4)));
  if (c._oi != null) dE.push(en - cues[c._oi].end);
  delete c._we; delete c._oi;
  c.start = Math.round(c.start * 100) / 100;
  c.end = Math.round(en * 100) / 100;
}

const moved = (th) => dS.filter((x) => Math.abs(x) > th).length;
console.log(`[fa-retime] ${slug}: cues ${cues.length} / FA適用 ${dS.length} / 語数不一致でスキップ ${skipped}`);
console.log(`  start ズレ(旧→新): ${stat(dS)}`);
console.log(`  動く行: >0.3s ${moved(0.3)} / >0.5s ${moved(0.5)} / >1.0s ${moved(1.0)}`);
if (has("conf")) console.log(`  要確認(conf<0.6): ${lowConf}`);

if (!has("apply")) { console.log("  ※ドライラン。反映するには --apply"); process.exit(0); }

const bak = backupCues(slug);
fs.writeFileSync(cuesPath, JSON.stringify(out, null, 2));
console.log(`[fa-retime] 書き換え完了（履歴: cue-history/${bak}）`);
