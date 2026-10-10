#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const source = read('src/pages/songs/ny-state-of-mind.astro');
const proof = JSON.parse(read('docs/ny-state-of-mind-reader-2026-10.json'));
const timestamps = JSON.parse(read('agent/ny-state-of-mind/assets/units-timestamps.json'));
const quoteSlots = source.match(/<Fragment slot="(?:eng|jpn|usage)">[\s\S]*?<\/Fragment>/g) ?? [];
const hash = s => createHash('sha256').update(s).digest('hex');
const checks = {
  '11 units and original 28 quotation/translation/usage slots preserved': (source.match(/<LearningUnit\b/g)??[]).length===11 && quoteSlots.length===28 && hash(quoteSlots.join('\n'))===proof.preservation.quoteSlotSHA256,
  '11 estimates retain original data; no asserted measurements': timestamps.length===11 && timestamps.every(u=>u.source==='fallback'&&u.approx===true&&u.manualSec==null&&u.captionSec==null) && hash(read('agent/ny-state-of-mind/assets/units-timestamps.json'))===proof.preservation.timestampSHA256,
  'verified official audio and video duration': source.includes('const YT = "hI8A14Qcv68"')&&source.includes('youtubeId="hI8A14Qcv68"')&&source.includes('songDuration={296}')&&source.includes('11か所とも字幕による照合・実測が済んでいない'),
  'intro slot and navigable table of contents': source.includes('slot="intro"')&&source.includes('id="article-toc"')&&source.includes('href="#article-toc"')&&['story','units','background','behind','legacy','listen-more'].every(id=>source.includes(`id="${id}"`)&&source.includes(`href="#${id}"`)),
  'one credited historical-context photo with explicit reuse terms': (source.match(/<figure\b[^>]*class="[^"]*\bcontext-photo\b[^"]*"/g)??[]).length===5&&source.includes('Jim.henderson')&&source.includes('パブリックドメイン公開')&&source.includes('2009年')&&source.includes('原本を掲載、改変なし')&&existsSync(new URL('public/images/context/ny-state-of-mind/queensbridge-vernon.jpg',root)),
  '4 supplied image originals and requested placements': proof.userPhotoRevision.assets.every(a=>hash(readFileSync(new URL(a.file,root)))===a.sha256) && ['scarface','ej','grants','ceelo'].every(id=>source.includes(`id="photo-${id}"`)) && (source.match(/data-image-source="user-provided"/g)??[]).length===4,
  '2 contextual Amazon links retain issued tag and tracking': source.includes('position="ny-scarface"')&&source.includes('data-affiliate-position="ny-ej-brandy"'),
  'specified Scarface DVD retains direct target, jacket and purchase wording': (()=>{ const card=source.match(/<AmazonMusicReference\b[^>]*position="ny-scarface"[\s\S]*?\/>/)?.[0]??''; return card.includes('/dp/B006QJSACY?')&&card.includes('tag=wax1124-22')&&card.includes('linkId=3782d361e0e6ab4a55089586e906e082')&&card.includes('title="スカーフェイス [DVD]"')&&card.includes('71NL7LHndKL._AC_SY445_SX342_QL70_ML2_.jpg')&&card.includes('label="このDVDをAmazonで購入"')&&card.includes('coverLabel="スカーフェイスのDVDをAmazonで購入 [PR]"')&&!card.includes('/s?')&&!card.includes('探す')&&!card.includes('Blu-ray'); })(),
  'album track number corrected': source.includes('Illmatic · 2曲目')&&!source.includes('3曲目'),
  'contextual purchase paths use existing issued IDs and positions': source.includes('tag=wax1124-22')&&source.includes('position="ny-background-illmatic"')&&source.includes('data-affiliate-position="ny-listen-more"'),
  'reflow markup is excluded from component attributes': !/\b(?:desc|word|heading|title|alt)="[^"]*<(?:\/?p\b|br\b)/.test(source),
};
for(const [name,ok]of Object.entries(checks))console.log(`${ok?'PASS':'FAIL'} ${name}`);
process.exit(Object.values(checks).every(Boolean)?0:1);
