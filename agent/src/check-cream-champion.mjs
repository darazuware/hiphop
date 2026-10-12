import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import cheerio from 'cheerio-without-node-native';

const baseline = '45f3dbc726f645b9041f2f476dde960aa208d77a';
const mediaBaseline = '679d79d8dfc07266ee9cae794d8101e276389904';
const read = p => readFileSync(p, 'utf8');
const previous = p => execFileSync('git', ['show', `${baseline}:${p}`], {encoding:'utf8'});
const file = 'agent/cream/assets/units-timestamps.json';
const before = JSON.parse(previous(file));
const after = JSON.parse(read(file));
assert.equal(after.length, 24);
assert.deepEqual(after.map(u=>u.id).sort(), before.map(u=>u.id).sort());
const overrides = {'shaolin-land':31,'gold-tooth':34,'lo-goose':34.9,'runnin-up-gates':47,'tec-9':81,'cream-hook':86.5,'fifteen-bagged':112,'could-not-touch':112.8,'world-cell':129,'jakes-base':134,'whats-it-worth':144};
for (const old of before) {
  const current=after.find(u=>u.id===old.id);
  const expected=Object.hasOwn(overrides,old.id)?{...old,manualSec:overrides[old.id],t:overrides[old.id],source:'manual',approx:false}:old;
  assert.deepEqual(current,expected,`Only owner-backed override allowed: ${old.id}`);
}
const groups=JSON.parse(read('agent/cream/assets/reading-groups.json'));
assert.equal(groups.length,16);
assert.deepEqual(groups.flatMap(g=>g.members).sort(),before.map(u=>u.id).sort());
const requiredGroups={ 'g-off':['gold-tooth','lo-goose','g-off'], 'keys-seas':['keys-seas','mpv-forty-g'], 'fifteen-bagged':['fifteen-bagged','could-not-touch'], 'world-cell':['world-cell','life-is-hell'], 'jakes-base':['jakes-base','bones-staircase'], 'whats-it-worth':['whats-it-worth','old-earth'], 'livin-proof':['livin-proof','kick-truth'] };
for(const [id,members] of Object.entries(requiredGroups)) assert.deepEqual(groups.find(g=>g.id===id).members,members,id);
assert.equal(groups.find(g=>g.id==='g-off').seekId,'gold-tooth');
assert.equal(groups[2].id,'shaolin-land'); assert.equal(groups[3].id,'g-off');
for(const p of ['agent/cream/assets/units.json',file]) {
  const units=JSON.parse(read(p)); const times=units.filter(u=>u.t!=null).map(u=>u.t);
  assert.ok(times.every((t,i)=>!i||t>=times[i-1]),`Chronological records: ${p}`);
  assert.deepEqual(units.map(u=>u.id).sort(),before.map(u=>u.id).sort());
}
const inputBefore=JSON.parse(previous('agent/cream/assets/units.json'));
const inputAfter=JSON.parse(read('agent/cream/assets/units.json'));
assert.deepEqual(inputAfter.map(u=>u.id),after.map(u=>u.id));
for(const old of inputBefore) assert.deepEqual(inputAfter.find(u=>u.id===old.id),Object.hasOwn(overrides,old.id)?{...old,manualSec:overrides[old.id]}:old,`Preserve source text and other fields: ${old.id}`);
const source = read('src/pages/songs/cream.astro');
assert.match(source,/songDuration=\{242\}/);
assert.match(source,/guidedReading=\{true\}/);
assert.equal((source.match(/<LearningUnit\b/g)||[]).length,16);
const quoteSlots = s => [...s.matchAll(/<Fragment slot="(eng|jpn)">([\s\S]*?)<\/Fragment>/g)].map(m=>[m[1],m[2]]);
assert.deepEqual(quoteSlots(source),quoteSlots(execFileSync('git',['show',`${mediaBaseline}:src/pages/songs/cream.astro`],{encoding:'utf8'})),'Keep every lyric excerpt byte-identical to the approved review');
assert.equal(read(file),execFileSync('git',['show',`${mediaBaseline}:${file}`],{encoding:'utf8'}),'Keep all timestamp records byte-identical');
const media = JSON.parse(read('docs/cream-provided-media-2026-10.json'));
assert.equal(media.images.length,4);
for (const image of media.images.slice(0,3)) assert.ok(source.includes('/'+image.file.replace('public/','')),image.file);
assert.ok(source.includes('/'+media.images[3].file.replace('public/','')));
assert.equal((source.match(/<figure class="context-photo">/g)||[]).length,5);
assert.ok(!source.includes('/images/context/cream/stax-museum.jpg'));
assert.ok(source.indexOf('new-york-times-provided.png')>source.indexOf('自分の育った街を'));
assert.ok(source.indexOf('gold-tooth-provided.png')<source.indexOf('lo-goose-ai-provided.jpeg'));
assert.ok(source.indexOf('lo-goose-ai-provided.jpeg')<source.indexOf('続くG offでは'));
assert.ok(source.indexOf('mazda-mpv-official.png')>source.indexOf('次のMPVはMazda'));
assert.deepEqual(media.instagram.postURLs,[]);
assert.ok(!source.includes('href="https://lo-life.com/"'));
assert.equal((source.match(/>Pexelsより引用<\/a>/g)||[]).length,2);
for (const image of media.images.slice(0,2)) assert.ok(source.includes(`href="${image.originalImageURL}"`));
assert.ok(source.includes('<figcaption>参考画像（AI生成）</figcaption>'));
assert.ok(source.includes('初代マツダMPV。出典：'));
assert.ok(!source.includes('2011年の写真で'));
assert.ok(source.includes('Beyond My Ken / Wikimedia Commons'));
assert.ok(source.includes('CC BY-SA 4.0'));
assert.ok(source.includes(media.captionAndMapRevision.mapURL));
assert.equal((source.match(/<div class="context-map"><iframe\b/g)||[]).length,1);
assert.equal((source.match(/preciseSeek=\{true\}/g)||[]).length,16);
const quoteTokens = s => [...s.matchAll(/<Fragment slot="eng">([\s\S]*?)<\/Fragment>/g)].reduce((n,m)=>n+m[1].replace(/<QuickSlang[^>]*word="([^"]*)"[^>]*\/?>/g,'$1').replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length,0);
assert.ok(quoteTokens(source)<=quoteTokens(previous('src/pages/songs/cream.astro')));
const root = cheerio.load(read('dist/songs/cream/index.html'));
assert.equal(root('[data-seek]').length,15);
assert.equal(root('[data-player-stop]').length,15);
assert.equal(root('.context-map iframe').length,1);
assert.equal(root('.context-map iframe').attr('src'),media.captionAndMapRevision.mapURL);
assert.equal(root('#point-intro-vendor').find('[data-seek]').length,0);
for (const a of root('a[href^="#"]').toArray()) assert.ok(root(root(a).attr('href')).length,root(a).attr('href'));
assert.equal(root('[id^="point-"] .back-toc').length,16);
for (const id of ['story','units','background','sample','records','article-toc']) assert.match(root(`#${id}`).attr('style'), /scroll-margin-top:240px/);
const displayed=root('div[id^="point-"]').filter((_,e)=>root(e).find('.learning-unit').length).toArray();
assert.deepEqual(displayed.map(e=>root(e).attr('id').slice(6)),groups.map(g=>g.id));
for(const group of groups) {
  const wrapper=root(`#point-${group.id}`);
  assert.equal(wrapper.find('.learning-unit').length,1);
  for(const member of group.members) assert.equal(wrapper.find(`#point-${member}`).length+(member===group.id?1:0),1,member);
  const record=after.find(u=>u.id===group.seekId); const seek=wrapper.find('[data-seek]');
  assert.equal(seek.length,record.t===null?0:1);
  if(record.t!==null) assert.equal(Number(seek.attr('data-seek')),record.t,group.id);
}
const seekTimes=root('[data-seek]').toArray().map(e=>Number(root(e).attr('data-seek')));
assert.ok(seekTimes.every((t,i)=>!i||t>=seekTimes[i-1]));
const quoteChars=(s,slot)=>[...s.matchAll(new RegExp(`<Fragment slot="${slot}">([\\s\\S]*?)<\\/Fragment>`,'g'))].reduce((n,m)=>n+m[1].replace(/<[^>]+>/g,'').length,0);
for(const slot of ['eng','jpn']) assert.ok(quoteChars(source,slot)<=quoteChars(previous('src/pages/songs/cream.astro'),slot),slot);
const productLinks=root('a[data-affiliate-position^="cream-"]').toArray();
assert.equal(productLinks.length,5);
const layout=read('src/layouts/Layout.astro');
const start=layout.indexOf("document.addEventListener('click', function(event) {");
const end=layout.indexOf('\n    });',start)+ '\n    });'.length;
assert.ok(start>=0 && end>start);
for (const element of productLinks) {
  const link=root(element);
  const merchant=link.attr('data-affiliate-merchant');
  const url=new URL(link.attr('href'));
  assert.ok(link.attr('rel').split(/\s+/).includes('sponsored'));
  assert.ok(link.text().includes('[PR]') || link.attr('aria-label')?.includes('[PR]'));
  assert.equal(url.searchParams.get(merchant==='amazon'?'tag':'afid'),merchant==='amazon'?'wax1124-22':'3150124771');
  const parent=link.closest('aside');
  assert.ok(parent.find('img').length);
  const dataset={affiliateMerchant:merchant,affiliateItem:link.attr('data-affiliate-item'),affiliatePosition:link.attr('data-affiliate-position')};
  assert.ok(dataset.affiliateItem); assert.ok(dataset.affiliatePosition);
  for (const fallback of [false,true]) {
    let handler, payload;
    class Element { closest(){return {href:url.href,dataset};} }
    const window=fallback?{dataLayer:[]}:{gtag:(kind,event,data)=>{assert.equal(kind,'event');assert.equal(event,'affiliate_click');payload=data;}};
    runInNewContext(layout.slice(start,end),{document:{addEventListener:(_,fn)=>{handler=fn;}},Element,URL,window,location:{pathname:'/songs/cream/'}});
    handler({target:new Element()});
    if(fallback) payload=window.dataLayer[0];
    assert.equal(payload.slug,'cream'); assert.equal(payload.content_type,'song');
    assert.equal(payload.merchant,merchant); assert.equal(payload.position,dataset.affiliatePosition);
    assert.equal(payload.item,dataset.affiliateItem); assert.equal(payload.destination_host,url.hostname);
    assert.equal(payload.transport_type,'beacon');
  }
}
for (const p of ['src/pages/songs/ny-state-of-mind.astro','src/pages/songs/come-down.astro','src/pages/songs/93-til-infinity.astro','src/layouts/Layout.astro','src/layouts/SongLayout.astro','src/components/LearningUnit.astro','agent/src/publish-main.mjs']) assert.equal(read(p),previous(p),p);
console.log(JSON.stringify({pass:true,records:24,readingGroups:16,seek:15,unchangedRecords:13,humanOverrides:11,quoteTokensBefore:quoteTokens(previous('src/pages/songs/cream.astro')),quoteTokensAfter:quoteTokens(source),productLinks:productLinks.length,affiliateDispatch:'gtag and dataLayer fallback pass',otherArticlesAndPublisher:'unchanged',audiblePlayback:'see browser.json live review evidence',conversion:'merchant report / GA4 receipt not verified'},null,2));
