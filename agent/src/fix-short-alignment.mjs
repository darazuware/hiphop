#!/usr/bin/env node
/**
 * fix-short-alignment.mjs
 * transcript.json の単語タイムスタンプを使い、song.html の show() タイミングを自動修正する
 * 歌詞テキストをレスポンスに出力しない（スクリプト内部でのみ処理）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_ROOT = path.resolve(__dirname, '..');

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node fix-short-alignment.mjs <slug>');
  process.exit(1);
}

const dir = path.join(AGENT_ROOT, slug);
const transcriptPath = path.join(dir, 'assets', 'transcript.json');
const songHtmlPath = path.join(dir, 'compositions', 'song.html');

if (!fs.existsSync(transcriptPath)) {
  console.error(`❌ transcript.json not found: ${transcriptPath}`);
  process.exit(1);
}
if (!fs.existsSync(songHtmlPath)) {
  console.error(`❌ compositions/song.html not found: ${songHtmlPath}`);
  process.exit(1);
}

// --- transcript.json 読み込み ---
const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8'));
const words = (Array.isArray(transcript) ? transcript : (transcript.segments || transcript.words || []))
  .map(e => ({
    text: (e.text || e.word || '').toLowerCase().replace(/[^a-z0-9']/g, ''),
    start: parseFloat(e.start || 0),
    end: parseFloat(e.end || e.start || 0),
  }))
  .filter(w => w.text.length > 0);

// --- song.html から lyric ブロックと show() 抽出 ---
const htmlContent = fs.readFileSync(songHtmlPath, 'utf-8');

// ブロックのEN歌詞テキスト抽出（内部処理のみ）
// 外側の <div id="bN"> ... </div> を取得（入れ子divを考慮して正規表現でなくパース）
const blockRegex = /<div[^>]+id="(b\d+)"[^>]*>/g;
const blocks = [];
let m;
while ((m = blockRegex.exec(htmlContent)) !== null) {
  const id = m[1];
  const startIdx = m.index + m[0].length;
  // 対応する </div> を探す（ネスト考慮）
  let depth = 1, idx = startIdx;
  while (depth > 0 && idx < htmlContent.length) {
    const next = htmlContent.indexOf('<', idx);
    if (next === -1) break;
    if (htmlContent.slice(next, next + 2) === '</') depth--;
    else depth++;
    idx = next + 1;
  }
  const inner = htmlContent.slice(startIdx, idx - 1);

  // <div class="en"> ... </div> からEN部分を取得
  const enMatch = inner.match(/<div[^>]+class="[^"]*\ben\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    || inner.match(/<p[^>]*class="[^"]*\ben\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
    || inner.match(/<span[^>]*class="[^"]*\ben\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  const rawEn = enMatch
    ? enMatch[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim()
    : '';
  const firstWords = rawEn.toLowerCase().replace(/[^a-z0-9'\s]/g, '').split(/\s+/).filter(Boolean).slice(0, 5);
  if (firstWords.length > 0) blocks.push({ id, firstWords });
}

if (blocks.length === 0) {
  console.error('❌ No lyric blocks found in song.html (expected <div id="b1"> etc.)');
  process.exit(1);
}

// --- ブロックごとに開始時刻を transcript から検索 ---
function findBestMatch(targetWords, startSearch = 0) {
  let bestScore = -1;
  let bestIdx = -1;
  for (let i = startSearch; i < words.length; i++) {
    let score = 0;
    for (let j = 0; j < targetWords.length && i + j < words.length; j++) {
      if (words[i + j].text === targetWords[j]) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
      if (score === targetWords.length) break;
    }
  }
  return { idx: bestIdx, score: bestScore };
}

const audioDuration = Math.max(...words.map(w => w.end));
const alignedBlocks = [];
let searchFrom = 0;

for (let i = 0; i < blocks.length; i++) {
  const block = blocks[i];
  if (block.firstWords.length === 0) {
    alignedBlocks.push({ id: block.id, start: null, matched: false });
    continue;
  }
  const { idx, score } = findBestMatch(block.firstWords, searchFrom);
  if (idx >= 0 && score > 0) {
    const startTime = Math.max(0, words[idx].start - 0.1);
    alignedBlocks.push({ id: block.id, start: startTime, matched: score >= 1, idx });
    searchFrom = idx + 1;
  } else {
    alignedBlocks.push({ id: block.id, start: null, matched: false });
  }
}

// 未マッチブロックは前後から補間
for (let i = 0; i < alignedBlocks.length; i++) {
  if (alignedBlocks[i].start !== null) continue;
  const prev = alignedBlocks.slice(0, i).reverse().find(b => b.start !== null);
  const next = alignedBlocks.slice(i + 1).find(b => b.start !== null);
  if (prev && next) {
    const gap = next.start - prev.start;
    const step = gap / (alignedBlocks.slice(alignedBlocks.indexOf(prev), alignedBlocks.indexOf(next) + 1).length);
    alignedBlocks[i].start = prev.start + step * (i - alignedBlocks.indexOf(prev));
  } else if (prev) {
    alignedBlocks[i].start = prev.start + 3;
  } else if (next) {
    alignedBlocks[i].start = next.start - 3;
  }
  alignedBlocks[i].estimated = true;
}

// --- フェードアウト開始時刻を HTML から取得 ---
const fadeMatch = htmlContent.match(/"#fadeout"[\s\S]*?opacity:\s*1[\s\S]*?\},\s*([\d.]+)/);
const fadeStart = fadeMatch ? parseFloat(fadeMatch[1]) : (audioDuration - 3);

// --- show() calls を生成 ---
// 各ブロックの end は次のブロックの start（最後はfadeStart）
// ブロックのstartがfadeStartを超えた場合は等間隔に再配置
const maxStart = fadeStart - 1;
if (alignedBlocks[alignedBlocks.length - 1]?.start > maxStart) {
  // 最後のブロックの start が fadeStart を超えている → 最後のN個を再分配
  const lastValidIdx = alignedBlocks.findLastIndex(b => b.start <= maxStart);
  const base = lastValidIdx >= 0 ? alignedBlocks[lastValidIdx].start : 0;
  const overflow = alignedBlocks.slice(lastValidIdx + 1);
  const step = (maxStart - base) / (overflow.length + 1);
  overflow.forEach((b, i) => { b.start = base + step * (i + 1); b.estimated = true; });
}

const newShowCalls = alignedBlocks.map((block, i) => {
  const startSec = parseFloat(block.start.toFixed(1));
  let endSec = i + 1 < alignedBlocks.length
    ? parseFloat(Math.min(alignedBlocks[i + 1].start, fadeStart).toFixed(1))
    : parseFloat(fadeStart.toFixed(1));
  if (endSec <= startSec) endSec = parseFloat(Math.min(startSec + 2, fadeStart).toFixed(1));
  const flag = block.estimated ? ' // estimated' : (block.matched ? '' : ' // unmatched');
  return `      show("#${block.id}", ${startSec}, ${endSec});${flag}`;
}).join('\n');

// --- HTML の show() ブロックを置換 ---
// 行頭(改行直後)の空白+show("#b で始まる連続ブロックを一括置換（コメント行除外）
const showBlockRegex = /((?:\n[ \t]+show\(["']#b\d+["'][^\n]*)+)/;
const match = showBlockRegex.exec(htmlContent);
if (!match) {
  console.log('⚠️  Could not find show() block to replace — manual edit needed');
  console.log('Generated show() calls:');
  console.log(newShowCalls);
  process.exit(1);
}
const updatedHtml = htmlContent.slice(0, match.index) + '\n' + newShowCalls + htmlContent.slice(match.index + match[0].length);


// バックアップ作成
fs.writeFileSync(songHtmlPath + '.bak', htmlContent);
fs.writeFileSync(songHtmlPath, updatedHtml);

// --- 結果報告（タイミングのみ、テキストなし） ---
console.log(`✅ Aligned ${alignedBlocks.length} blocks`);
console.log(`   Audio duration: ${audioDuration.toFixed(1)}s`);
console.log(`   Coverage: ${alignedBlocks[0]?.start?.toFixed(1)}s – ${alignedBlocks[alignedBlocks.length-1]?.start?.toFixed(1)}s`);
const unmatched = alignedBlocks.filter(b => !b.matched || b.estimated).length;
if (unmatched > 0) {
  console.log(`   ⚠️  ${unmatched} block(s) used interpolated timing`);
}
console.log(`   Backup: compositions/song.html.bak`);
