import fs from 'fs';
import path from 'path';

const dir = 'src/data/slang-pages';
const args = process.argv.slice(2);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
const all = Object.fromEntries(files.map(f => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]));
const targets = args.length ? args : Object.keys(all);
const slangTs = fs.readFileSync('src/data/slang.ts', 'utf8');
const slangWords = new Set([...slangTs.matchAll(/word:\s*["']([^"']+)["']/g)].map(m => m[1].toLowerCase()));

const MIN_JP = 1800;
const REQ = { slug: 's', word: 's', reading: 's', pos: 's', category: 's', level: 's', title: 's', description: 's', summary: 'a', sections: 'a', origin: 'a', examples: 'a', inSongs: 'a', compare: 'a', pitfalls: 'a', faq: 'a', related: 'a', stats: 's' };
const DASH = /[—–―]|──|ーー/;
const CMD = /てください|しましょう|してみて(?:ね|。)|覚えておこう|注意しよう|確認しよう/;

const jpStrings = e => {
  const out = [];
  const walk = (v, k) => {
    if (typeof v === 'string') { if (k !== 'en' && k !== 'quote' && k !== 'slug' && k !== 'word' && k !== 'term') out.push(v); }
    else if (Array.isArray(v)) v.forEach(x => walk(x, k));
    else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) walk(vv, kk);
  };
  walk(e);
  return out;
};
const jpCount = s => (s.match(/[぀-ヿ㐀-鿿]/g) || []).length;
const sentences = e => jpStrings(e).flatMap(s => s.split(/(?<=[。！？])/)).map(s => s.trim()).filter(s => jpCount(s) >= 25);

const others = {};
for (const [k, e] of Object.entries(all)) others[k] = new Set(sentences(e));

let fail = 0;
for (const slug of targets) {
  const e = all[slug];
  const res = [];
  const ok = (name, cond) => res.push([name, !!cond]);
  if (!e) { console.log(`❌ ${slug}: ファイルなし`); fail++; continue; }
  ok('必須キー', Object.entries(REQ).every(([k, t]) => t === 's' ? typeof e[k] === 'string' && e[k].length > 0 : Array.isArray(e[k]) && e[k].length > 0) && e.slug === slug);
  const jp = jpStrings(e).reduce((n, s) => n + jpCount(s), 0);
  ok(`日本語字数(${jp}≥${MIN_JP})`, jp >= MIN_JP);
  ok(`例文(${e.examples?.length}≥6)`, e.examples?.length >= 6 && e.examples.every(x => x.en && x.ja && x.note));
  ok(`曲での使われ方(${e.inSongs?.length}≥6)`, e.inSongs?.length >= 6 && e.inSongs.every(x => x.artist && x.song && x.note));
  ok('似た表現/注意/FAQ/関連', e.compare?.length >= 3 && e.pitfalls?.length >= 3 && e.faq?.length >= 3 && e.related?.length >= 3);
  ok('quote短い断片(≤8語)', (e.inSongs || []).every(x => !x.quote || x.quote.split(/\s+/).length <= 8));
  ok('ダッシュなし', !jpStrings(e).some(s => DASH.test(s)) && !(e.examples || []).some(x => DASH.test(x.en)));
  ok('読者命令形なし', !jpStrings(e).some(s => CMD.test(s)));
  ok('1要素2文以内', [...e.summary, ...e.origin, ...e.sections.flatMap(s => s.body)].every(p => (p.replace(/「[^」]*」/g, '').match(/[。！？]/g) || []).length <= 2));
  const dup = [...sentences(e)].filter(s => Object.entries(others).some(([k, set]) => k !== slug && set.has(s)));
  ok(`他語ページと25字以上重複(${dup.length})`, dup.length === 0);
  const missing = (e.related || []).filter(r => !all[r] && ![...slangWords].some(w => w.includes(r.toLowerCase())));
  ok(`related実在(${missing.length}件欠)`, missing.length === 0);
  const bad = res.filter(r => !r[1]);
  if (bad.length) fail++;
  console.log(`${bad.length ? '❌' : '✅'} ${slug}${bad.length ? '  ' + bad.map(r => '❌' + r[0]).join(' ') : ''}`);
}
process.exit(fail ? 1 : 0);
