import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Return positions/counts only. Never emit lyric text, including on failure.
export function findQuoteOverlaps(source) {
  const units = [...source.matchAll(/<LearningUnit\b[\s\S]*?<\/LearningUnit>/g)].map((m, index) => {
    const quotes = [...m[0].matchAll(/<Fragment\s+slot="eng">([\s\S]*?)<\/Fragment>/g)].map(q => {
      const text = q[1].replace(/<QuickSlang\s+word="([^"]+)"[^>]*>/g, '$1')
        .replace(/<[^>]+>/g, ' ').replace(/&(?:apos|#39|#x27);/gi, "'")
        .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/[’‘]/g, "'");
      return text.toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)*/g) ?? [];
    });
    return { index: index + 1, line: source.slice(0, m.index).split('\n').length, quotes };
  });
  const contains = (a, b) => a.length >= b.length && a.some((_, i) => b.every((v, j) => a[i + j] === v));
  const overlaps = [];
  for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
    let sharedTokens = 0;
    for (const a of units[i].quotes) for (const b of units[j].quotes) {
      const shorter = a.length <= b.length ? a : b, longer = a.length <= b.length ? b : a;
      if (shorter.length >= 2 && contains(longer, shorter)) sharedTokens = Math.max(sharedTokens, shorter.length);
      for (let start = 0; start + 8 <= a.length; start++) if (contains(b, a.slice(start, start + 8))) sharedTokens = Math.max(sharedTokens, 8);
    }
    if (sharedTokens) overlaps.push({ firstUnit: units[i].index, secondUnit: units[j].index, sourceLines: [units[i].line, units[j].line], sharedTokens });
  }
  return overlaps;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const slug = process.argv[2];
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error('Usage: node agent/src/check-quote-overlap.mjs <slug>');
  const source = readFileSync(new URL(`../../src/pages/songs/${slug}.astro`, import.meta.url), 'utf8');
  const overlaps = findQuoteOverlaps(source);
  for (const o of overlaps) console.error(`FAIL overlapping quote: units ${o.firstUnit}/${o.secondUnit}, source lines ${o.sourceLines.join('/')}, ${o.sharedTokens} shared tokens; merge their explanations`);
  if (!overlaps.length) console.log('PASS cross-unit quotation overlap: zero');
  process.exitCode = overlaps.length ? 1 : 0;
}
