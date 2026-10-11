import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import cheerio from 'cheerio-without-node-native';

const baseline = 'dc99bae232f476f1ae50ac0071bfe53b40e08359';
const read = p => readFileSync(p, 'utf8');
const previous = p => execFileSync('git', ['show', `${baseline}:${p}`], {encoding:'utf8'});
const file = 'agent/cream/assets/units-timestamps.json';
const before = JSON.parse(previous(file));
const after = JSON.parse(read(file));
assert.equal(after.length, 24);
assert.deepEqual(after.map(u=>u.id).sort(), before.map(u=>u.id).sort());
for (const old of before.filter(u=>['manual','caption','mv-absent'].includes(u.source))) {
  assert.deepEqual(after.find(u=>u.id===old.id), old, `Preserve confirmed record: ${old.id}`);
}
for (const [id,t] of Object.entries({'fifteen-bagged':109.78,'bones-staircase':136.401})) {
  const u=after.find(u=>u.id===id);
  assert.equal(u.source,'caption'); assert.equal(u.t,t); assert.equal(u.approx,true);
  assert.equal(u.manualSec,null);
}
const source = read('src/pages/songs/cream.astro');
assert.match(source,/songDuration=\{242\}/);
assert.match(source,/guidedReading=\{true\}/);
assert.equal((source.match(/<LearningUnit\b/g)||[]).length,24);
assert.equal((source.match(/preciseSeek=\{true\}/g)||[]).length,24);
const quoteTokens = s => [...s.matchAll(/<Fragment slot="eng">([\s\S]*?)<\/Fragment>/g)].reduce((n,m)=>n+m[1].replace(/<QuickSlang[^>]*word="([^"]*)"[^>]*\/?>/g,'$1').replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length,0);
assert.ok(quoteTokens(source)<=quoteTokens(previous('src/pages/songs/cream.astro')));
const root = cheerio.load(read('dist/songs/cream/index.html'));
assert.equal(root('[data-seek]').length,23);
assert.equal(root('[data-player-stop]').length,23);
assert.equal(root('#point-intro-vendor').find('[data-seek]').length,0);
for (const a of root('a[href^="#"]').toArray()) assert.ok(root(root(a).attr('href')).length,root(a).attr('href'));
assert.equal(root('[id^="point-"] .back-toc').length,24);
for (const id of ['story','units','background','sample','records','article-toc']) assert.match(root(`#${id}`).attr('style'), /scroll-margin-top:240px/);
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
console.log(JSON.stringify({pass:true,units:24,seek:23,preservedManual:14,preservedCaption:7,mvAbsent:1,newCaptionCandidates:2,quoteTokensBefore:quoteTokens(previous('src/pages/songs/cream.astro')),quoteTokensAfter:quoteTokens(source),productLinks:productLinks.length,affiliateDispatch:'gtag and dataLayer fallback pass',otherArticlesAndPublisher:'unchanged',audiblePlayback:'not verified; embed unavailable in test browser',conversion:'merchant report / GA4 receipt not verified'},null,2));
