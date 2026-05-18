#!/usr/bin/env node
/**
 * Checks lyric line coverage between a Genius lyrics file and the .astro article.
 * Usage: node agent/src/check-lyrics-coverage.mjs <slug>
 * Example: node agent/src/check-lyrics-coverage.mjs juicy
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node check-lyrics-coverage.mjs <slug>');
  process.exit(1);
}

const projectRoot = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const lyricsPath = `/tmp/lyrics-${slug}.txt`;
const astroPath = join(projectRoot, 'src/pages/songs', `${slug}.astro`);

// --- Load files ---
let lyricsRaw, astroRaw;
try {
  lyricsRaw = readFileSync(lyricsPath, 'utf-8');
} catch {
  console.error(`Lyrics file not found: ${lyricsPath}`);
  console.error('Fetch lyrics first: node agent/src/genius.mjs <song-title> <artist>');
  process.exit(1);
}
try {
  astroRaw = readFileSync(astroPath, 'utf-8');
} catch {
  console.error(`Astro file not found: ${astroPath}`);
  process.exit(1);
}

// --- Parse Genius lyrics: extract lyric lines (skip headers, empty, Genius preamble) ---
function parseLyricLines(raw) {
  const lines = raw.split('\n');
  const result = [];
  let inLyrics = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Genius preamble ends at first [Section] header
    if (trimmed.startsWith('[')) {
      inLyrics = true;
      continue; // skip section headers themselves
    }
    if (!inLyrics) continue;

    // Skip parenthetical stage directions that are entire lines like "(Laughter)"
    if (/^\(.*\)$/.test(trimmed)) continue;

    result.push(trimmed);
  }
  return result;
}

// --- Extract eng slot text from astro file ---
function extractEngLines(astro) {
  const result = [];
  const blockRe = /<Fragment\s+slot="eng">([\s\S]*?)<\/Fragment>/g;
  let match;
  while ((match = blockRe.exec(astro)) !== null) {
    const inner = match[1];
    // Preserve QuickSlang word="" attribute text before stripping tags
    const withWords = inner.replace(/<QuickSlang\s+word="([^"]+)"[^>]*>/g, '$1');
    const stripped = withWords
      .replace(/<[^>]+>/g, ' ')  // remove remaining tags
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();

    // Split on line breaks (represented by spaces after tag removal)
    // Each logical line in the slot is separated by <br /> which became spaces
    const subLines = stripped.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
    result.push(...subLines);
  }
  return result;
}

// --- Normalize for comparison: lowercase, strip punctuation, collapse whitespace ---
function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/["""]/g, '"')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Check if a lyric line is covered by a specific eng line ---
function isLineMatch(lyricLine, engLine) {
  const lyricNorm = normalize(lyricLine);
  if (lyricNorm.length < 4) return true; // skip very short lines like "Yeah"

  // Check if lyric norm appears as substring in eng line (or vice versa)
  if (engLine.includes(lyricNorm) || lyricNorm.includes(engLine)) return true;
  
  // Partial match: at least 60% of lyric words appear in eng line
  const lyricWords = lyricNorm.split(' ').filter(w => w.length > 2);
  if (lyricWords.length === 0) return true;
  const matchCount = lyricWords.filter(w => engLine.includes(w)).length;
  if (matchCount / lyricWords.length >= 0.6) return true;
  
  return false;
}

// --- Main ---
const lyricLines = parseLyricLines(lyricsRaw);
const engLines = extractEngLines(astroRaw);
const engNorms = engLines.map(normalize);

const uncovered = [];
const covered = [];
let engIndex = 0;

for (const line of lyricLines) {
  let found = false;
  // Search forward from the current pointer
  for (let i = engIndex; i < engNorms.length; i++) {
    if (isLineMatch(line, engNorms[i])) {
      found = true;
      engIndex = i + 1; // Advance pointer to enforce sequential order
      break;
    }
  }
  
  if (found) {
    covered.push(line);
  } else {
    uncovered.push(line);
  }
}

const total = lyricLines.length;
const coveredCount = covered.length;
const pct = total === 0 ? 100 : Math.round((coveredCount / total) * 100);

console.log(`\n=== Lyrics Coverage: ${slug} ===`);
console.log(`Covered: ${coveredCount}/${total} lines (${pct}%)`);
console.log(`LyricsBlock components in .astro: ${(astroRaw.match(/<LyricsBlock/g) || []).length}`);

const THRESHOLD = 85; // % — repetition/filler lines in outros are OK to omit

if (uncovered.length === 0) {
  console.log('\n✅ All lyric lines are covered!\n');
} else if (pct >= THRESHOLD) {
  console.log(`\n⚠️  ${uncovered.length} uncovered line(s) (above ${THRESHOLD}% threshold — check if filler/repetition):\n`);
  uncovered.forEach((line, i) => {
    console.log(`  ${i + 1}. ${line}`);
  });
  console.log('');
} else {
  console.log(`\n❌ ${uncovered.length} uncovered line(s) — below ${THRESHOLD}% threshold:\n`);
  uncovered.forEach((line, i) => {
    console.log(`  ${i + 1}. ${line}`);
  });
  console.log('\nAdd these lines to LyricsBlock components in the .astro file.\n');
  process.exit(1);
}
