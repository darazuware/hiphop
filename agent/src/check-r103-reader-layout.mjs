#!/usr/bin/env node
// R-103: prose formatting must not inject markup into component attributes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const malformedAttribute = source => /\b(?:desc|word|heading|title|alt)="[^"]*<(?:\/?p\b|br\b)/.test(source);
if (process.argv.includes('--self-test')) {
  const good = '<QuickSlang desc="定義。補足" />';
  const bad = ['<QuickSlang desc="定義。</p><p>補足" />', '<QuickSlang desc="定義。<br />補足" />'];
  const pass = !malformedAttribute(good) && bad.every(malformedAttribute);
  console.log(pass ? 'PASS attribute regression fixtures' : 'FAIL attribute regression fixtures');
  process.exit(pass ? 0 : 1);
}
const source = readFileSync(fileURLToPath(new URL('../../src/pages/songs/93-til-infinity.astro', import.meta.url)), 'utf8');
const checks = [];
const check = (name, ok) => checks.push({ name, ok });
const prose = source.replace(/<Fragment slot="(?:eng|jpn|usage)">[\s\S]*?<\/Fragment>/g, '');
check('component attributes contain no paragraph or break markup', !malformedAttribute(source));
check('requested wording and erroneous geography removed', !/深刻|Shaolin|行は引きません|そっと混ぜ|[^条事]件[。、]/.test(prose));
check('all 25 timed learning units retained', (source.match(/<LearningUnit\b/g) || []).length === 25);
check('8 captioned photos: 5 user-supplied, 3 Commons credits retained', (source.match(/<figure class="context-photo"/g) || []).length === 8 && (source.match(/<figcaption>/g) || []).length === 8 && (source.match(/data-image-source="user-provided"/g) || []).length === 5 && (source.match(/写真：/g) || []).length === 3);
check('4 image-backed release references', (source.match(/<AmazonMusicReference query=/g) || []).length === 4 && [...source.matchAll(/<AmazonMusicReference\b[^>]*\/>/g)].every(m => /cover="[^"]+"/.test(m[0])));
check('record summary precedes the intro', source.indexOf('slot="record"') < source.indexOf('slot="intro"') && source.includes('id="record-summary"'));
check('sample player lives in the sample topic', source.includes('sampleInContent={true}') && source.indexOf('id="sample-topic-player"') > source.indexOf('<section id="behind"'));
check('table of contents has a return link', source.includes('id="article-toc"') && source.includes('href="#article-toc"'));
const photoParagraphs = { forty: 'そのまま酒の呼び名にしています。', timbs: '定番アイテムでした。', blunt: '別の語で言い直しています。', greenbacks: 'この呼び名がついています。', 'hiero-casual': 'アンダーグラウンドの主役たちです。', 'oakland-city': '"The Town" とも呼ばれます）。' };
check('6 requested photos immediately follow their explanation', Object.entries(photoParagraphs).every(([id, text]) => {
  const end = source.indexOf('</p>', source.indexOf(text)) + 4;
  return source.slice(end).trimStart().startsWith(`<figure class="context-photo" id="photo-${id}"`);
}));
check('user-selected purchase links retained', source.includes('https://www.amazon.co.jp/dp/B00008FS5U/?tag=wax1124-22') && source.includes('https://jp.mercari.com/item/m86391808150?afid=3150124771'));
let punctuationBreaks = 0;
for (const p of prose.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
  if (/uppercase tracking-widest/.test(p[1]) || p[2].includes('▶')) continue;
  const text = p[2].replace(/<[^>]+>/g, '');
  const punctuation = (text.match(/[、。]/g) || []).length;
  const breaks = (p[2].match(/<br\s*\/>/g) || []).length;
  if (breaks < Math.max(0, punctuation - 1)) punctuationBreaks++;
}
check('prose punctuation has visible breaks', punctuationBreaks === 0);
for (const {name,ok} of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
process.exit(checks.every(c => c.ok) ? 0 : 1);
