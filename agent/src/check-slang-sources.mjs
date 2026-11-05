import fs from 'fs';
import path from 'path';

// 語ページの「年・数値」を含む記述が、出典(sources)の本文で裏取りできるか機械検証する。
// sources: [{ url, note? }] を各ページJSONに持たせる。年が出典本文に無ければ❌。
// 取得できない出典（Etymonline 等のbotブロック）は {url, evidence, via} で原文の抜粋を記録し、その抜粋に年があるかを検証する。
// 使い方: node agent/src/check-slang-sources.mjs [slug ...] [--offline]
const args = process.argv.slice(2);
const offline = args.includes('--offline');
const slugs = args.filter(a => !a.startsWith('--'));
const dir = 'src/data/slang-pages';
const cacheDir = 'agent/.source-cache';
fs.mkdirSync(cacheDir, { recursive: true });
fs.writeFileSync(path.join(cacheDir, '.gitignore'), '*\n');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
const targets = slugs.length ? slugs : files;
const yearRe = /(?<![0-9])(1[5-9]\d\d|20[0-2]\d)(?![0-9])(?!年代)/g;
const bodyText = e => [...e.summary, ...e.origin, ...e.sections.flatMap(s => s.body), ...e.faq.map(f => f.a), ...e.pitfalls].join('\n');
const fetchText = async url => {
  const f = path.join(cacheDir, Buffer.from(url).toString('base64url').slice(0, 120) + '.txt');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  if (offline) return null;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (fact-check)' }, signal: AbortSignal.timeout(30000) });
      if (r.ok) {
        const t = (await r.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
        fs.writeFileSync(f, t);
        return t;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
  return null;
};

let fail = 0, noSrc = 0;
for (const slug of targets) {
  const e = JSON.parse(fs.readFileSync(path.join(dir, slug + '.json'), 'utf8'));
  const years = [...new Set([...bodyText(e).matchAll(yearRe)].map(m => m[1]))];
  if (!years.length) { console.log(`✅ ${slug} (年の記述なし)`); continue; }
  const srcs = e.sources || [];
  if (!srcs.length) { noSrc++; console.log(`⚠ ${slug}: 年の記述 ${years.join(',')} に出典なし`); continue; }
  const texts = [];
  for (const s of srcs) {
    if (s.evidence) { texts.push(s.evidence); continue; }
    const t = await fetchText(s.url);
    if (t) texts.push(t); else console.log(`   取得不可: ${s.url}`);
  }
  const missing = years.filter(y => !texts.some(t => t.includes(y)));
  if (missing.length) { fail++; console.log(`❌ ${slug}: 出典本文に無い年 ${missing.join(',')}`); } else console.log(`✅ ${slug} (${years.join(',')} を出典で確認)`);
}
console.log(`\n出典なし ${noSrc}件 / 不一致 ${fail}件`);
process.exit(fail || noSrc ? 1 : 0);
