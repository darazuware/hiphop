#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const source = read('src/pages/songs/ny-state-of-mind.astro');
const proof = JSON.parse(read('docs/ny-state-of-mind-reader-2026-10.json'));
const extra = JSON.parse(read('docs/ny-state-of-mind-context-commerce-2026-10.json'));
const shop = JSON.parse(read('src/data/ny-state-of-mind-commerce.json'));
const revision = JSON.parse(read('docs/ny-state-of-mind-punchlines-2026-10.json'));
const newIDs = revision.newUnits.map(u => u.id);
const units = JSON.parse(read('agent/ny-state-of-mind/assets/units.json'));
const canonical = value => JSON.stringify(Array.isArray(value) ? value.map(v => JSON.parse(canonical(v))) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, JSON.parse(canonical(value[k]))])) : value);
const timestamps = JSON.parse(read('agent/ny-state-of-mind/assets/units-timestamps.json'));
const quoteSlots = source.match(/<Fragment slot="(?:eng|jpn|usage)">[\s\S]*?<\/Fragment>/g) ?? [];
const hash = s => createHash('sha256').update(s).digest('hex');
const checks = {
  '17 distinct units retain all original 28 quote slots in order': (source.match(/<LearningUnit\b/g)??[]).length===revision.unitCount && hash(quoteSlots.filter(q=>revision.originalSlotHashes.includes(hash(q))).join('\n'))===proof.preservation.quoteSlotSHA256,
  '11 original estimate records preserved; six new positions pending': timestamps.length===revision.unitCount && timestamps.filter(u=>!newIDs.includes(u.id)).length===11 && hash(canonical(timestamps.filter(u=>!newIDs.includes(u.id))))===revision.originalTimestampsHash && newIDs.every(id=>timestamps.some(u=>u.id===id&&u.t===null&&u.source==='pending'&&u.manualSec===null&&u.captionSec===null)&&units.some(u=>u.id===id&&u.timingPending===true&&u.fallbackT===null)) && hash(canonical(units.filter(u=>!newIDs.includes(u.id))))===revision.originalUnitsHash,
  'verified official audio and video duration': source.includes('const YT = "hI8A14Qcv68"')&&source.includes('youtubeId="hI8A14Qcv68"')&&source.includes('songDuration={296}')&&source.includes('既存11か所は字幕照合・実測が未完了'),
  'intro slot and navigable table of contents': source.includes('slot="intro"')&&source.includes('id="article-toc"')&&source.includes('href="#article-toc"')&&['story','units','background','behind','legacy','listen-more'].every(id=>source.includes(`id="${id}"`)&&source.includes(`href="#${id}"`)),
  'one credited historical-context photo with explicit reuse terms': (source.match(/<figure\b[^>]*class="[^"]*\bcontext-photo\b[^"]*"/g)??[]).length===7&&source.includes('Jim.henderson')&&source.includes('パブリックドメイン公開')&&source.includes('2009年')&&source.includes('原本を掲載、改変なし')&&existsSync(new URL('public/images/context/ny-state-of-mind/queensbridge-vernon.jpg',root)),
  '4 supplied image originals and requested placements': proof.userPhotoRevision.assets.every(a=>hash(readFileSync(new URL(a.file,root)))===a.sha256) && ['scarface','ej','grants','ceelo'].every(id=>source.includes(`id="photo-${id}"`)) && (source.match(/data-image-source="user-provided"/g)??[]).length===6,
  'contextual DVD Amazon and E&J Mercari purchase paths': source.includes('position="ny-scarface"')&&source.includes('position="ny-ej-mercari"')&&!source.includes('ny-ej-brandy'),
  'specified E&J listings retain photos and issued afid without Amazon search': ['m82177084030','m69069345363'].every(id=>source.includes(`https://jp.mercari.com/item/${id}?afid=3150124771`)&&source.includes(`photos/${id}_1.jpg`))&&source.includes('メルカリで見つけました。')&&!source.includes('E&JブランデーをAmazonで探す'),
  'specified Scarface DVD retains direct target, jacket and purchase wording': (()=>{ const card=source.match(/<AmazonMusicReference\b[^>]*position="ny-scarface"[\s\S]*?\/>/)?.[0]??''; return card.includes('/dp/B006QJSACY?')&&card.includes('tag=wax1124-22')&&card.includes('linkId=3782d361e0e6ab4a55089586e906e082')&&card.includes('title="スカーフェイス [DVD]"')&&card.includes('71NL7LHndKL._AC_SY445_SX342_QL70_ML2_.jpg')&&card.includes('label="このDVDをAmazonで購入"')&&card.includes('coverLabel="スカーフェイスのDVDをAmazonで購入 [PR]"')&&!card.includes('/s?')&&!card.includes('探す')&&!card.includes('Blu-ray'); })(),
  '2 additional supplied originals and six image-source credits': extra.assets.every(a=>hash(readFileSync(new URL(a.file,root)))===a.sha256)&&['photo-capone','photo-queensbridge-collage'].every(id=>source.includes(`id="${id}"`)),
  '12 pictured direct product references retain verified source URL/image/merchant': Object.keys(shop).length===12&&extra.products.every(p=>Object.values(shop).some(c=>c.href===p.href&&c.cover===p.image&&c.position===p.position&&c.merchant===p.merchant))&&Object.entries(shop).every(([key,c])=>source.includes(`{...shop.${key}}`)&&c.cover.startsWith('https://')&&(c.merchant==='rakuten'?c.href==='https://a.r10.to/hgGKkn':new URL(c.href).searchParams.get('tag')==='wax1124-22')),
  'precise historical distinctions and BB airsoft product type': source.includes('1932年版『Scarface』')&&source.includes('1983年版『スカーフェイス』')&&source.includes('1932年版のリメイク')&&shop.tec9.artist.includes('BB弾用エアソフトガン')&&source.includes('1982年')&&!source.includes('KG-9はスウェーデンのインターダイナミックが開発した9mm×19弾を使用するサブマシンガン'),
  'requested E&J copy preserves user wording': source.includes('残念ながらE&amp;Jは日本での正規取扱いができる通販はありません。Amazonにもありませんでした。')&&source.includes('メルカリで見つけました。'),
  'album track number corrected': source.includes('Illmatic · 2曲目')&&!source.includes('3曲目'),
  'contextual purchase paths use existing issued IDs and positions': source.includes('tag=wax1124-22')&&source.includes('position="ny-background-illmatic"')&&source.includes('href="#purchase-illmatic"'),
  'TEC card follows the explanation without a contrived sales introduction': !source.includes('楽天には、KG-9')&&!source.includes('外形を知る入口')&&source.includes('id="purchase-tec9"'),
  'Capone introduction gives film context before version distinctions': source.indexOf('アル・カポネを題材にした映画は') < source.indexOf('1932年版『Scarface』') && shop.scarfaceStream.href===revision.streamProduct.resolved && shop.scarfaceStream.cover===revision.streamProduct.image && shop.scarfaceStream.title.includes('1983年版') && shop.scarfaceStream.href.includes('linkId=5d07974f4f99d61f9a89ecbcca9067f6'),
  'short synopsis and a collapsible point index': (()=>{const block=source.match(/<section\b[^>]*id="story"[\s\S]*?<\/section>/)?.[0]??''; const paragraphs=block.match(/<p\b[^>]*>[\s\S]*?<\/p>/g)??[]; return paragraphs.length===2&&paragraphs.join('').replace(/<[^>]*>/g,'').length<=200&&source.includes('id="point-index"')&&units.every(u=>source.includes(`href="#point-${u.id}"`)&&source.includes(`id="point-${u.id}"`));})(),
  'reflow markup is excluded from component attributes': !/\b(?:desc|word|heading|title|alt)="[^"]*<(?:\/?p\b|br\b)/.test(source),
};
for(const [name,ok]of Object.entries(checks))console.log(`${ok?'PASS':'FAIL'} ${name}`);
process.exit(Object.values(checks).every(Boolean)?0:1);
