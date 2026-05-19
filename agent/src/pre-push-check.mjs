#!/usr/bin/env node
/**
 * Pre-push lyrics coverage check.
 * Called by agent/hooks/pre-push with a list of changed song .astro paths.
 * Fetches lyrics from Genius and runs check-lyrics-coverage.mjs for each.
 */

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const projectRoot = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');

// --- Load env ---
let apiKey = process.env.GENIUS_ACCESS_TOKEN;
if (!apiKey) {
  try {
    const env = readFileSync(join(projectRoot, 'agent/.env'), 'utf-8');
    const match = env.match(/GENIUS_ACCESS_TOKEN=(.+)/);
    if (match) apiKey = match[1].trim();
  } catch {}
}
if (!apiKey) {
  console.error('❌ GENIUS_ACCESS_TOKEN not found in agent/.env');
  process.exit(1);
}

// --- Parse songs.ts for title/artist lookup ---
const songsTs = readFileSync(join(projectRoot, 'src/data/songs.ts'), 'utf-8');
function getSongMeta(slug) {
  const re = new RegExp(
    `slug:\\s*['"]\/songs\/${slug}['"][^}]+?title:\\s*['"]([^'"]+)['"][^}]+?artists:\\s*['"]([^'"]+)['"]`,
    's'
  );
  const m = songsTs.match(re);
  return m ? { title: m[1], artist: m[2] } : null;
}

// --- Fetch lyrics (skip if recent cache exists) ---
async function fetchLyrics(title, artist, slug) {
  const cachePath = `/tmp/lyrics-${slug}.txt`;
  try {
    const stat = statSync(cachePath);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < 2 * 60 * 60 * 1000) {
      const cached = readFileSync(cachePath, 'utf-8');
      console.log(`  Using cached lyrics (${Math.round(ageMs / 60000)}m old)`);
      return cached.split('\n').length;
    }
  } catch {}
  const { getLyrics } = require(join(projectRoot, 'agent/node_modules/genius-lyrics-api/index.js'));
  const lyrics = await getLyrics({ apiKey, title, artist, optimizeQuery: false });
  if (!lyrics) throw new Error('No lyrics returned');
  writeFileSync(cachePath, lyrics);
  return lyrics.split('\n').length;
}

// --- Main ---
const changedPaths = process.argv.slice(2);
if (changedPaths.length === 0) {
  console.log('No song files changed, skipping lyrics check.');
  process.exit(0);
}

let anyFailed = false;

for (const filePath of changedPaths) {
  const slug = basename(filePath, '.astro');
  console.log(`\n🎵 Checking: ${slug}`);

  const meta = getSongMeta(slug);
  if (!meta) {
    console.warn(`  ⚠️  Song not found in songs.ts: ${slug} — skipping`);
    continue;
  }

  try {
    const lines = await fetchLyrics(meta.title, meta.artist, slug);
    console.log(`  Fetched ${lines} lines from Genius`);
  } catch (e) {
    console.warn(`  ⚠️  Genius fetch failed: ${e.message} — skipping`);
    continue;
  }

  try {
    execSync(
      `node ${join(projectRoot, 'agent/src/check-lyrics-coverage.mjs')} ${slug}`,
      { stdio: 'inherit', cwd: projectRoot }
    );
  } catch {
    anyFailed = true;
  }
}

if (anyFailed) {
  console.error('\n❌ Lyrics check failed. Fix issues before pushing.');
  process.exit(1);
}

console.log('\n✅ All lyrics checks passed.');
