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
  const all = [];
  let inLyrics = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Genius preamble ends at first [Section] header (may be embedded mid-line)
    if (/\[/.test(trimmed)) {
      inLyrics = true;
      // Extract any lyric content that follows the header on the same line
      const afterHeader = trimmed.replace(/^.*\[[^\]]+\]\s*/, '').trim();
      if (afterHeader && !/^\(.*\)$/.test(afterHeader)) all.push(afterHeader);
      continue;
    }
    if (!inLyrics) continue;

    // Skip parenthetical stage directions that are entire lines like "(Laughter)"
    if (/^\(.*\)$/.test(trimmed)) continue;

    all.push(trimmed);
  }

  // Skip lines that appear 3+ times — repeated sample hooks / filler not worth enforcing
  const freq = new Map();
  for (const l of all) freq.set(normalize(l), (freq.get(normalize(l)) ?? 0) + 1);
  const result = all.filter(l => freq.get(normalize(l)) < 3);
  return result;
}

// Raw version (no repeat-filtering) — used to build the B-check corpus
function parseLyricLinesRaw(raw) {
  const lines = raw.split('\n');
  const result = [];
  let inLyrics = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/\[/.test(trimmed)) {
      inLyrics = true;
      const afterHeader = trimmed.replace(/^.*\[[^\]]+\]\s*/, '').trim();
      if (afterHeader && !/^\(.*\)$/.test(afterHeader)) result.push(afterHeader);
      continue;
    }
    if (!inLyrics) continue;
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

// --- Check if an eng line is backed by Genius lyrics (checked against full corpus) ---
// An eng slot may combine multiple Genius lines into one block, so we check word-level
// coverage against the entire Genius lyrics joined as a single string.
function isEngLineCovered(engLine, geniusCorpus) {
  const engNorm = normalize(engLine);
  if (engNorm.length < 4) return true;

  const engWords = engNorm.split(' ').filter(w => w.length > 3);
  if (engWords.length === 0) return true;

  const matchCount = engWords.filter(w => geniusCorpus.includes(w)).length;
  return matchCount / engWords.length >= 0.7;
}

// --- Main ---
const lyricLines = parseLyricLines(lyricsRaw);        // deduped (3+ repeats removed) — used for [A]
const allLyricLines = parseLyricLinesRaw(lyricsRaw);  // all lines incl. repeats — used for [B] corpus
const engLines = extractEngLines(astroRaw);
const engNorms = engLines.map(normalize);
const lyricNorms = lyricLines.map(normalize);

// Direction A: Genius → .astro (omission check)
// Non-sequential: Genius and .astro may order sections differently
const uncovered = [];
const covered = [];

for (const line of lyricLines) {
  const found = engNorms.some(engNorm => isLineMatch(line, engNorm));
  if (found) {
    covered.push(line);
  } else {
    uncovered.push(line);
  }
}

// Direction B: .astro → Genius (hallucination check)
// Use all lines (incl. repeats) for corpus so repeated-but-valid lines aren't flagged
const geniusCorpus = allLyricLines.map(normalize).join(' ');
const hallucinated = [];
for (const engLine of engLines) {
  if (!isEngLineCovered(engLine, geniusCorpus)) {
    hallucinated.push(engLine);
  }
}

const total = lyricLines.length;
const coveredCount = covered.length;
const pct = total === 0 ? 100 : Math.round((coveredCount / total) * 100);

console.log(`\n=== Lyrics Coverage: ${slug} ===`);
console.log(`Covered: ${coveredCount}/${total} lines (${pct}%)`);
console.log(`LyricsBlock components in .astro: ${(astroRaw.match(/<LyricsBlock/g) || []).length}`);

const THRESHOLD = 85;
let hasError = false;

// Report omissions
if (uncovered.length === 0) {
  console.log('\n✅ [A] No omissions — all Genius lines are covered.');
} else if (pct >= THRESHOLD) {
  console.log(`\n⚠️  [A] ${uncovered.length} omitted line(s) (above ${THRESHOLD}% — likely filler/repetition):`);
  uncovered.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
} else {
  console.log(`\n❌ [A] ${uncovered.length} omitted line(s) — below ${THRESHOLD}% threshold:`);
  uncovered.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
  console.log('  → Add these to LyricsBlock components.');
  hasError = true;
}

// Report hallucinations
if (hallucinated.length === 0) {
  console.log('\n✅ [B] No hallucinations — all .astro eng lines match Genius.');
} else {
  console.log(`\n❌ [B] ${hallucinated.length} hallucinated line(s) — not found in Genius lyrics:`);
  hallucinated.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
  console.log('  → Verify against Genius and correct these lines.');
  hasError = true;
}

console.log('');
if (hasError) process.exit(1);
