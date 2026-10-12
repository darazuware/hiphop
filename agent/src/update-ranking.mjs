#!/usr/bin/env node
/**
 * トップのランキングを Search Console の実クリック数（曲ページ・直近N日）で更新する。
 *
 * Usage:
 *   node agent/src/update-ranking.mjs [--days 28] [--repo <worktree>] [--apply]
 *
 * --repo 省略時は /Users/ktamatzmoto/Desktop/hiphop-review（reviewブランチ）。
 * --apply なしはdry-run。対象は songs.ts の tier "core" の曲のみ、上位3件。
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { google } from 'googleapis';

const AGENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(AGENT_ROOT, '.env') });

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const DAYS = Number(arg('--days', 28));
const REPO = arg('--repo', '/Users/ktamatzmoto/Desktop/hiphop-review');
const APPLY = process.argv.includes('--apply');
const TOP = 3;

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
  scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
});
const sc = google.searchconsole({ version: 'v1', auth });
const fmt = (d) => d.toISOString().slice(0, 10);
const end = new Date(); end.setDate(end.getDate() - 1);
const start = new Date(end); start.setDate(start.getDate() - DAYS);

const res = await sc.searchanalytics.query({
  siteUrl: process.env.GSC_SITE_URL,
  requestBody: { startDate: fmt(start), endDate: fmt(end), dimensions: ['page'], rowLimit: 1000 },
});

const clicks = new Map();
for (const r of res.data.rows ?? []) {
  const m = new URL(r.keys[0]).pathname.replace(/\/$/, '');
  if (m.startsWith('/songs/')) clicks.set(m, (clicks.get(m) ?? 0) + r.clicks);
}

const file = join(REPO, 'src/data/songs.ts');
let src = readFileSync(file, 'utf8');
const core = new Map();
for (const m of src.matchAll(/\{ slug: ['"](\/songs\/[^'"]+)['"],\s*title: (['"])(.*?)\2.*?artists: (['"])(.*?)\4.*?tier: "(\w+)"/g)) {
  if (m[6] === 'core') core.set(m[1], { title: m[3], artists: m[5] });
}

const ranked = [...core.keys()]
  .map((s) => ({ slug: s, clicks: clicks.get(s) ?? 0, ...core.get(s) }))
  .sort((a, b) => b.clicks - a.clicks)
  .slice(0, TOP);

console.log(`Search Console クリック数（直近${DAYS}日・曲ページ）`);
ranked.forEach((r, i) => console.log(` ${i + 1}. ${r.slug} — ${r.clicks}クリック`));

if (!APPLY) { console.log('(dry-run。--apply で songs.ts の ranking を更新)'); process.exit(0); }

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const block = `export const ranking = [\n${ranked
  .map((r) => `  { slug: "${r.slug}", title: "${esc(r.title)}", artists: "${esc(r.artists)}" },`)
  .join('\n')}\n];`;
const next = src.replace(/export const ranking = \[[\s\S]*?\n\];/, block);
if (next === src) { console.error('❌ ranking ブロックが見つからない'); process.exit(1); }
writeFileSync(file, next);
console.log('✅ songs.ts の ranking を更新');
