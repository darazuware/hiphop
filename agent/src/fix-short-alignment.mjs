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

for (const p of [transcriptPath, songHtmlPath]) {
  if (!fs.existsSync(p)) { console.error(`❌ Not found: ${p}`); process.exit(1); }
}

// --- transcript.json: 単語のタイムスタンプ配列 ---
const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8'));
const words = (Array.isArray(transcript) ? transcript : (transcript.segments || transcript.words || []))
  .map(e => ({
    text: (e.text || e.word || '').toLowerCase().replace(/[^a-z0-9']/g, ''),
    start: parseFloat(e.start || 0),
    end: parseFloat(e.end || e.start || 0),
  }))
  .filter(w => w.text.length > 0);

const audioDuration = Math.max(...words.map(w => w.end));

// --- song.html から歌詞ブロックのEN単語数を抽出 ---
// void要素(<br><img>等)をdepthカウント対象外にして正確に抽出
const VOID_TAGS = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'source', 'wbr', 'area', 'base', 'col', 'embed', 'param', 'track']);

function extractBlockContent(html, startIdx) {
  let depth = 1, idx = startIdx;
  while (depth > 0 && idx < html.length) {
    const next = html.indexOf('<', idx);
    if (next === -1) break;
    if (html.slice(next, next + 2) === '</') {
      depth--;
    } else {
      const tagMatch = html.slice(next + 1).match(/^([a-zA-Z][a-zA-Z0-9]*)/);
      if (tagMatch && !VOID_TAGS.has(tagMatch[1].toLowerCase())) {
        depth++;
      }
    }
    idx = next + 1;
  }
  return html.slice(startIdx, idx - 1);
}

function extractEnWords(innerHtml) {
  // <div class="en"> または <p class="en"> などを探す
  const enMatch = innerHtml.match(/<(?:div|p|span)[^>]+class="[^"]*\ben\b[^"]*"[^>]*>/i);
  if (!enMatch) return [];
  const enStart = innerHtml.indexOf(enMatch[0]) + enMatch[0].length;
  const enTagMatch = enMatch[0].match(/^<(\w+)/);
  const enTag = enTagMatch[1];
  // EN要素内をextract
  const enInner = extractBlockContent(innerHtml, enStart);
  // HTMLタグを除去してテキスト取得
  const text = enInner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
}

const htmlContent = fs.readFileSync(songHtmlPath, 'utf-8');
const blockIdRegex = /<div[^>]+id="(b\d+)"[^>]*>/g;
const blocks = [];
let bm;
while ((bm = blockIdRegex.exec(htmlContent)) !== null) {
  const id = bm[1];
  const innerStart = bm.index + bm[0].length;
  const inner = extractBlockContent(htmlContent, innerStart);
  const enWords = extractEnWords(inner);
  blocks.push({ id, wordCount: enWords.length, enWords });
}

if (blocks.length === 0) {
  console.error('❌ No blocks found'); process.exit(1);
}

const totalBlockWords = blocks.reduce((s, b) => s + b.wordCount, 0);
console.log(`Blocks: ${blocks.length}, block words: ${totalBlockWords}, transcript words: ${words.length}`);
blocks.forEach(b => process.stderr.write(`  ${b.id}: ${b.wordCount} words\n`));

if (totalBlockWords === 0) {
  console.error('❌ No EN words extracted — check HTML class names'); process.exit(1);
}

// --- フェードアウト開始時刻をHTMLから取得 ---
const _fadeMatch = htmlContent.match(/"#fadeout"[\s\S]*?opacity:\s*1[\s\S]*?\},\s*([\d.]+)/);
const fadeStart = _fadeMatch ? parseFloat(_fadeMatch[1]) : (audioDuration - 3);

// フェードアウト前の最大単語インデックスを計算
const fadeWordLimit = words.findLastIndex(w => w.start <= fadeStart + 1);

// --- ブロックを transcript 単語インデックスにマッピング ---
function scoreWindow(blockWords, transWords, startIdx) {
  let score = 0;
  for (let i = 0; i < blockWords.length; i++) {
    if (startIdx + i < transWords.length && blockWords[i] === transWords[startIdx + i].text) {
      score++;
    }
  }
  return score;
}

const aligned = [];
let searchFrom = 0;

for (let i = 0; i < blocks.length; i++) {
  const block = blocks[i];
  if (block.wordCount === 0) {
    aligned.push({ id: block.id, wordIdx: searchFrom, estimated: true });
    continue;
  }

  // 検索上限: フェード直前までに収める（最終ブロックはフェード前が上限）
  const hardLimit = fadeWordLimit - block.wordCount + 1;
  const maxSearch = Math.min(hardLimit, searchFrom + 50);

  let bestScore = -1;
  let bestIdx = Math.min(searchFrom, hardLimit);

  for (let j = searchFrom; j <= maxSearch; j++) {
    const score = scoreWindow(block.enWords, words, j);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = j;
    }
  }

  aligned.push({
    id: block.id,
    wordIdx: bestIdx,
    wordCount: block.wordCount,
    score: bestScore,
    estimated: bestScore === 0,
  });

  searchFrom = bestIdx + Math.max(1, Math.floor(block.wordCount * 0.5));
}

// --- タイムスタンプ計算 ---
function wordStart(idx) {
  return words[Math.min(idx, words.length - 1)].start;
}
function wordEnd(idx) {
  return words[Math.min(idx, words.length - 1)].end;
}

// --- show() calls 生成 ---
const newShowCalls = aligned.map((block, i) => {
  const startTime = parseFloat(wordStart(block.wordIdx).toFixed(2));
  let endTime;
  if (i + 1 < aligned.length) {
    endTime = parseFloat(wordStart(aligned[i + 1].wordIdx).toFixed(2));
  } else {
    // 最終ブロック: 単語終了時刻 or フェードアウト
    const lastWordIdx = block.wordIdx + (block.wordCount || 1) - 1;
    endTime = parseFloat(Math.min(wordEnd(lastWordIdx) + 0.5, fadeStart).toFixed(2));
  }
  if (endTime <= startTime) endTime = parseFloat(Math.min(startTime + 2, fadeStart).toFixed(2));
  const flag = block.estimated ? ' // estimated' : '';
  return `      show("#${block.id}", ${startTime}, ${endTime});${flag}`;
}).join('\n');

// --- HTML の show() ブロックを置換 (行頭マッチ) ---
const showBlockRegex = /((?:\n[ \t]+show\(["']#b\d+["'][^\n]*)+)/;
const matchResult = showBlockRegex.exec(htmlContent);
if (!matchResult) {
  console.log('⚠️  show() block not found — printing generated calls:');
  console.log(newShowCalls);
  process.exit(1);
}

fs.writeFileSync(songHtmlPath + '.bak', htmlContent);
const updatedHtml = htmlContent.slice(0, matchResult.index) + '\n' + newShowCalls + htmlContent.slice(matchResult.index + matchResult[0].length);
fs.writeFileSync(songHtmlPath, updatedHtml);

// --- 結果報告 ---
const coverage = ((aligned[aligned.length-1] ? wordEnd(aligned[aligned.length-1].wordIdx + (aligned[aligned.length-1].wordCount||1) - 1) : 0) / audioDuration * 100).toFixed(1);
const estimatedCount = aligned.filter(b => b.estimated).length;

console.log(`✅ Aligned ${aligned.length} blocks`);
console.log(`   Audio: ${audioDuration.toFixed(1)}s  FadeStart: ${fadeStart.toFixed(1)}s`);
console.log(`   Coverage: ~${coverage}%`);
if (estimatedCount > 0) console.log(`   ⚠️  ${estimatedCount} block(s) used estimated timing`);
console.log(`   Backup: compositions/song.html.bak`);
