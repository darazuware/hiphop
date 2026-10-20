import fs from 'fs';
import path from 'path';

// 語ページの機械検証（歌詞コーパス照合）。コーパスは agent/corpus（gitignore・ローカルのみ）。
// 使い方: node agent/src/check-slang-facts.mjs [slug ...] [--corpus DIR] [--fix-stats]
const args = process.argv.slice(2);
const corpusDir = args.includes('--corpus') ? args[args.indexOf('--corpus') + 1] : 'agent/corpus';
const fixStats = args.includes('--fix-stats');
const slugs = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--corpus');
const pageDir = 'src/data/slang-pages';
if (!fs.existsSync(corpusDir)) { console.log(`❌ コーパスなし: ${corpusDir}`); process.exit(1); }

const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = t => t.normalize('NFKC').toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();
const ALIAS = { 'ghostface-killah': ['ghostface-killah'], 'atmosphere': ['atmosphere'] };

const artists = {};
let totalSongs = 0;
for (const a of fs.readdirSync(corpusDir)) {
  const d = path.join(corpusDir, a);
  if (!fs.statSync(d).isDirectory()) continue;
  artists[a] = fs.readdirSync(d).filter(f => f.endsWith('.txt')).map(f => {
    const raw = fs.readFileSync(path.join(d, f), 'utf8');
    totalSongs++;
    return { name: f.replace(/\.txt$/, ''), text: norm(raw.split('\n').filter(l => !l.startsWith('#')).join(' ')), lower: raw.toLowerCase() };
  });
}
const songSim = (title, fileName) => {
  const t = slugify(title).replace(/-/g, '');
  const f = fileName.replace(/-/g, '');
  return f.includes(t) || t.includes(f);
};

const files = fs.readdirSync(pageDir).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
const targets = slugs.length ? slugs : files;
let fail = 0;
for (const slug of targets) {
  const p = path.join(pageDir, slug + '.json');
  if (!fs.existsSync(p)) { console.log(`❌ ${slug}: ファイルなし`); fail++; continue; }
  const e = JSON.parse(fs.readFileSync(p, 'utf8'));
  const errs = [];
  for (const s of e.inSongs || []) {
    const dir = artists[slugify(s.artist)];
    if (!dir) { errs.push(`アーティスト未収録: ${s.artist}`); continue; }
    if (!s.quote) continue;
    const q = norm(s.quote);
    const hits = dir.filter(x => x.text.includes(q));
    if (!hits.length) errs.push(`引用が見つからない: ${s.artist} / ${s.song}`);
    else if (!hits.some(x => songSim(s.song, x.name))) errs.push(`曲名が不一致（実際は ${hits.map(x => x.name).slice(0, 2).join(', ')}）: ${s.song}`);
  }
  const word = e.word.toLowerCase().replace(/^'/, '');
  const re = new RegExp('(^|[^a-z])' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|es)?([^a-z]|$)');
  let songs = 0; const hitArtists = new Set();
  for (const [a, list] of Object.entries(artists)) for (const x of list) if (re.test(x.lower)) { songs++; hitArtists.add(a); }
  const perArtist = Object.entries(artists).map(([a, list]) => [a, list.filter(x => re.test(x.lower)).length]).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]);
  const display = a => (fs.readFileSync(path.join(corpusDir, a, fs.readdirSync(path.join(corpusDir, a))[0]), 'utf8').match(/^# (.+?) - /) || [, a])[1];
  const top = perArtist.slice(0, 2).map(([a]) => display(a));
  const unit = Math.round(totalSongs / 10) * 10;
  const expected = `解析に使ったヒップホップ約${unit}曲の歌詞のうち、${e.word} を含む曲は${songs}曲で、${Object.keys(artists).length}人中${hitArtists.size}人のラッパーに出てきました。` + (top.length === 2 ? `${top[0]} や ${top[1]} の曲に特に多く出てきます。` : top.length === 1 ? `${top[0]} の曲に出てきます。` : '') + (perArtist.length ? `出現数の多い順に並べると、内訳は${perArtist.slice(0, 5).map(([a, n]) => `${display(a)} ${n}曲`).join('、')}です。` : '');
  if ((e.stats || '') !== expected) {
    if (fixStats) { e.stats = expected; fs.writeFileSync(p, JSON.stringify(e, null, 2)); }
    else errs.push('stats が実測と不一致（--fix-stats で自動生成）');
  }
  if (errs.length) { fail++; console.log(`❌ ${slug}\n   ${errs.join('\n   ')}`); } else console.log(`✅ ${slug}`);
}
console.log(fail ? `\n${fail}件に問題あり` : '\n全て一致');
process.exit(fail ? 1 : 0);
