#!/usr/bin/env node
/**
 * check-short-alignment.mjs
 * ショート動画のアライメント診断ツール
 * 歌詞テキストを一切出力せず、タイミング構造のみを報告する
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_ROOT = path.resolve(__dirname, '..');

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node check-short-alignment.mjs <slug>');
  console.error('Example: node check-short-alignment.mjs if-i-ruled-the-world');
  process.exit(1);
}

const dir = path.join(AGENT_ROOT, slug);
if (!fs.existsSync(dir)) {
  console.error(`❌ Directory not found: ${dir}`);
  process.exit(1);
}

let hasError = false;

// --- transcript.json 解析 ---
const transcriptPath = path.join(dir, 'assets', 'transcript.json');
let transcriptStats = null;
if (fs.existsSync(transcriptPath)) {
  const data = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8'));
  const entries = Array.isArray(data) ? data : (data.segments || data.words || []);
  const starts = entries.map(e => parseFloat(e.start || e.begin || 0)).filter(n => !isNaN(n));
  const ends = entries.map(e => parseFloat(e.end || 0)).filter(n => !isNaN(n));
  transcriptStats = {
    count: entries.length,
    first: Math.min(...starts),
    last: Math.max(...starts),
    duration: ends.length ? Math.max(...ends) : Math.max(...starts),
  };
  console.log(`[transcript.json] ${transcriptStats.count} entries, ${transcriptStats.first.toFixed(2)}s–${transcriptStats.duration.toFixed(2)}s`);
} else {
  console.log('[transcript.json] not found — skipping');
}

// --- HTML アニメーション解析 ---
const htmlFiles = [
  path.join(dir, 'compositions', 'song.html'),
  path.join(dir, 'index.html'),
  path.join(dir, 'compositions', 'lyrics.html'),
];

for (const htmlPath of htmlFiles) {
  if (!fs.existsSync(htmlPath)) continue;
  const rel = path.relative(dir, htmlPath);
  const content = fs.readFileSync(htmlPath, 'utf-8');

  // show("#bN", start, end) lyric block calls（コメント行を除外）
  const showCalls = [...content.matchAll(/^[ \t]+show\(["']#?b(\d+)["'],\s*([\d.]+),\s*([\d.]+)\)/gm)]
    .map(m => ({ block: parseInt(m[1]), start: parseFloat(m[2]), end: parseFloat(m[3]) }))
    .sort((a, b) => a.start - b.start);

  // GSAP tl.to/set positions（イントロ等の直接アニメーション、コメント行を除外）
  const gsapPositions = [...content.matchAll(/^[ \t]+tl\.(?:to|set|fromTo|from)\([^)]*,\s*([\d.]+)\s*\)/gm)]
    .map(m => parseFloat(m[1]))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);

  // data-start attributes
  const dataStarts = [...content.matchAll(/data-start=["']([\d.]+)["']/g)]
    .map(m => parseFloat(m[1]))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);

  console.log(`\n[${rel}]`);

  if (showCalls.length > 0) {
    const blockStarts = showCalls.map(s => s.start);
    console.log(`  Lyric blocks: ${showCalls.length} (b${showCalls[0].block}–b${showCalls[showCalls.length-1].block})`);
    console.log(`  Timing: ${showCalls[0].start.toFixed(1)}s – ${showCalls[showCalls.length-1].end.toFixed(1)}s`);

    if (transcriptStats) {
      const audioDur = transcriptStats.duration;
      const covered = showCalls[showCalls.length-1].end - showCalls[0].start;
      const coverage = (covered / audioDur * 100).toFixed(1);
      console.log(`  Coverage: ${covered.toFixed(1)}s / audio ${audioDur.toFixed(1)}s = ${coverage}%`);

      // ギャップ検出 (3秒以上の空白を探す)
      const gaps = [];
      for (let i = 0; i < showCalls.length - 1; i++) {
        const gap = showCalls[i + 1].start - showCalls[i].end;
        if (gap > 3) {
          gaps.push({ from: showCalls[i].end.toFixed(1), to: showCalls[i+1].start.toFixed(1), dur: gap.toFixed(1) });
        }
      }

      // ゼロ長ブロック検出
      const zeroLen = showCalls.filter(s => s.end <= s.start);

      if (gaps.length > 0) {
        hasError = true;
        console.log(`  ❌ Gaps (>3s): ${gaps.map(g => `${g.from}s–${g.to}s (${g.dur}s)`).join(', ')}`);
      } else {
        console.log(`  ✅ No large gaps`);
      }

      if (zeroLen.length > 0) {
        hasError = true;
        console.log(`  ❌ Zero-length blocks: ${zeroLen.map(s => `b${s.block}(${s.start}s)`).join(', ')}`);
      }

      if (parseFloat(coverage) < 80) {
        hasError = true;
        console.log(`  ❌ Coverage too low: ${coverage}% (need ≥80%)`);
      } else {
        console.log(`  ✅ Coverage OK: ${coverage}%`);
      }
    }
  } else {
    console.log(`  GSAP positions: ${gsapPositions.length} → [${gsapPositions.map(n => n.toFixed(1)).join(', ')}]`);
    console.log(`  data-start:     ${dataStarts.length} → [${dataStarts.map(n => n.toFixed(1)).join(', ')}]`);
    if (gsapPositions.length === 0 && dataStarts.length === 0) {
      hasError = true;
      console.log(`  ❌ No animation timing found`);
    }
  }
}

// --- hyperframes.json 解析 (nas-minimal format) ---
const hyperframesPath = path.join(dir, 'hyperframes.json');
if (fs.existsSync(hyperframesPath)) {
  const hf = JSON.parse(fs.readFileSync(hyperframesPath, 'utf-8'));
  const frames = hf.registry || hf.frames || hf;
  const count = Array.isArray(frames) ? frames.length : Object.keys(frames).length;
  console.log(`\n[hyperframes.json] ${count} frames`);
  if (Array.isArray(frames) && frames.length > 0) {
    const starts = frames.map(f => parseFloat(f.start || f.t || 0)).filter(n => !isNaN(n)).sort((a, b) => a - b);
    const ends = frames.map(f => parseFloat(f.end || 0)).filter(n => !isNaN(n));
    console.log(`  Range: ${starts[0]?.toFixed(2)}s–${(ends.length ? Math.max(...ends) : starts[starts.length - 1])?.toFixed(2)}s`);
  }
}

console.log('');
if (hasError) {
  console.log('❌ Alignment issues detected — regenerate with correct transcript mapping');
  process.exit(1);
} else {
  console.log('✅ Alignment OK');
  process.exit(0);
}
