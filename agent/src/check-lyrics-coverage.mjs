#!/usr/bin/env node
/**
 * Checks lyric line coverage between a Genius lyrics file and the .astro article.
 * Usage: node agent/src/check-lyrics-coverage.mjs <slug>
 * Example: node agent/src/check-lyrics-coverage.mjs juicy
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const slug = process.argv[2];
const verbose = process.argv.includes('--verbose');
if (!slug) {
  console.error('Usage: node check-lyrics-coverage.mjs <slug> [--verbose]');
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
// Also expands censored forms (f**k → fuck, n***a → nigga) so censor-lyrics.mjs
// output still matches against Genius lyrics.
function normalize(s) {
  return s
    .toLowerCase()
    // Expand censored forms before stripping symbols
    .replace(/f\*\*k(in'?g?|ed|er[sz]?|[sz])?\b/g, (_m, suffix = '') => 'fuck' + (suffix || ''))
    .replace(/n\*{2,}(a[sz]?|er[sz]?|y|edy)\b/g, (m, suffix) => 'nigg' + suffix)
    .replace(/b\*{2,}h(es|in'?g?)?\b/g, (m, suffix = '') => 'bitch' + suffix)
    .replace(/s\*{2,}t(t(?:y|ier|iest|ing)|[sz])?\b/g, (m, suffix = '') => 'shit' + (suffix || ''))
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
  // normalize() already expands censored forms (f**k → fuck etc.), so no special skip needed
  const engNorm = normalize(engLine);
  if (engNorm.length < 4) return true;

  const engWords = engNorm.split(' ').filter(w => w.length > 3);
  if (engWords.length === 0) return true;

  const matchCount = engWords.filter(w => geniusCorpus.includes(w)).length;
  return matchCount / engWords.length >= 0.7;
}

// --- Page-type detection: learning型 (学習解説主体) vs 従来型 (歌詞対訳) ---
// learning型は LearningUnit コンポーネントを使い、歌詞は用例断片のみ引用する。
function isLearningPage(astro) {
  return /<LearningUnit[\s>]/.test(astro) || /\bimport\s+LearningUnit\b/.test(astro);
}

// --- 日本語文字数カウント（ひらがな・カタカナ・漢字・々ー）---
function countJpChars(s) {
  return (s.match(/[぀-ゟ゠-ヿ一-鿿々ー]/g) || []).length;
}

// --- jpn スロット（和訳）テキストを抽出 ---
function extractJpnSlotText(astro) {
  const re = /<Fragment\s+slot="jpn">([\s\S]*?)<\/Fragment>/g;
  let m, out = [];
  while ((m = re.exec(astro)) !== null) out.push(m[1].replace(/<[^>]+>/g, ' '));
  return out.join(' ');
}

// --- frontmatter とタグを除いた本文テキスト ---
function bodyText(astro) {
  return astro.replace(/^---[\s\S]*?\n---/, '').replace(/<[^>]+>/g, ' ');
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
const learning = isLearningPage(astroRaw);
const luCount = (astroRaw.match(/<LearningUnit[\s>]/g) || []).length;
const lbCount = (astroRaw.match(/<LyricsBlock/g) || []).length;

console.log(`\n=== Lyrics Coverage: ${slug} ${learning ? '[learning型]' : '[従来型]'} ===`);
console.log(`eng引用がGenius行を含む割合: ${coveredCount}/${total} lines (${pct}%)`);
console.log(`Components: LearningUnit=${luCount}, LyricsBlock=${lbCount}`);

let hasError = false;

// ── [B] ハルシネーションチェック（両タイプ必須）──────────────────────────
// SKIP_B=1（Genius不完全フェッチ時に pre-push-check が設定）は失敗ブロックせず警告に降格。
const skipB = process.env.SKIP_B === '1';
if (hallucinated.length === 0) {
  console.log('\n✅ [B] No hallucinations — all .astro eng lines match Genius.');
} else if (skipB) {
  console.log(`\n⚠️  [B] ${hallucinated.length} possible mismatch(es) — Genius fetch incomplete, [B] skipped（要手動確認）`);
} else {
  console.log(`\n❌ [B] ${hallucinated.length} hallucinated line(s) — not found in Genius lyrics`);
  if (verbose) hallucinated.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
  console.log('  → Run with --verbose to see flagged lines. Verify against Genius and correct.');
  hasError = true;
}

if (learning) {
  // ── learning型: 独自性・引用最小性・構造を検証。[A]下限は適用しない ──────
  const COLUMN_MIN = 1200;       // コラム基準の独自解説量
  const MAX_COVERAGE = 60;       // これ以上のeng引用率＝全行掲載の疑い

  // [C] 独自性: 独自解説JP文字数 > 英語引用量 かつ 1200字以上
  const engChars = engLines.join(' ').replace(/\s/g, '').length;
  const jpnSlotChars = countJpChars(extractJpnSlotText(astroRaw));
  const totalJp = countJpChars(bodyText(astroRaw));
  const indepJp = totalJp - jpnSlotChars;
  const ratio = engChars > 0 ? (indepJp / engChars) : Infinity;
  console.log(`\n[C] 独自性: 独自解説JP=${indepJp}字 / 英語引用=${engChars}字 (${ratio === Infinity ? '∞' : ratio.toFixed(1)}倍) ・ 基準${COLUMN_MIN}字`);
  if (indepJp <= engChars) {
    console.log('❌ [C] 独自解説が英語引用を上回っていない（解説が主役になっていない）');
    hasError = true;
  } else if (indepJp < COLUMN_MIN) {
    console.log(`❌ [C] 独自解説 ${indepJp}字 < 基準 ${COLUMN_MIN}字`);
    hasError = true;
  } else {
    console.log('✅ [C] 独自解説が主体（英語引用を上回り・コラム基準クリア）');
  }

  // [D] 引用最小性（著作権）: 全行歌詞掲載でないこと
  console.log(`\n[D] 引用最小性: eng引用カバレッジ=${pct}%（上限${MAX_COVERAGE}%）`);
  if (pct >= MAX_COVERAGE) {
    console.log('❌ [D] 学習ページなのに歌詞をほぼ全行引用している疑い（用例断片に削減せよ）');
    hasError = true;
  } else {
    console.log('✅ [D] 引用は最小限（全行掲載ではない）');
  }

  // [E] タイムスタンプ構造（任意・ブロックしない）: 各ユニットに t= プロップがあるか
  const luTags = astroRaw.match(/<LearningUnit[\s\S]*?>/g) || [];
  const luWithT = luTags.filter(tag => /\bt=\{/.test(tag)).length;
  console.log(`\n[E] タイムスタンプ: ${luWithT}/${luCount} ユニットに t= プロップあり（任意）`);
  if (luCount > 0 && luWithT < luCount) {
    console.log('⚠️  [E] 一部ユニットに頭出しリンク用の t= がない（任意・ブロックしない）');
  } else if (luCount > 0) {
    console.log('✅ [E] 全ユニットに頭出しタイムスタンプあり');
  }

  console.log('\nℹ️  [A] 全行カバレッジ判定は learning型では適用しない（全行非掲載が正常）');
} else {
  // ── 従来型: [A] 全行カバレッジ閾値を維持 ────────────────────────────────
  const THRESHOLD = 35; // 著作権対策でeng引用を核ライン限定に削減したため
  if (uncovered.length === 0) {
    console.log('\n✅ [A] No omissions — all Genius lines are covered.');
  } else if (pct >= THRESHOLD) {
    console.log(`\n⚠️  [A] ${uncovered.length} omitted line(s) (above ${THRESHOLD}% — likely filler/repetition)`);
    if (verbose) uncovered.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
  } else {
    console.log(`\n❌ [A] ${uncovered.length} omitted line(s) — below ${THRESHOLD}% threshold`);
    if (verbose) uncovered.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
    console.log('  → Run with --verbose to see missing lines. Add them to LyricsBlock components.');
    hasError = true;
  }
}

console.log('');
if (hasError) process.exit(1);
