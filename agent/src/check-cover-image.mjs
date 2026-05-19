#!/usr/bin/env node
/**
 * Checks cover image validity for a song.
 * Usage: node agent/src/check-cover-image.mjs <slug>
 * Checks: file exists, is valid JPEG, is reasonably sized (>10KB)
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node check-cover-image.mjs <slug>');
  process.exit(1);
}

const projectRoot = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const coverPath = join(projectRoot, 'public/images/covers', `${slug}.jpg`);

let ok = true;

if (!existsSync(coverPath)) {
  console.log(`❌ [IMG] Cover not found: public/images/covers/${slug}.jpg`);
  ok = false;
} else {
  const stat = statSync(coverPath);
  const buf = readFileSync(coverPath);

  const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  if (!isJpeg) {
    console.log(`❌ [IMG] Not a valid JPEG: ${slug}.jpg (magic bytes: ${buf.slice(0,3).toString('hex')})`);
    ok = false;
  }

  if (stat.size < 10240) {
    console.log(`❌ [IMG] File too small (${stat.size} bytes) — likely corrupted or placeholder: ${slug}.jpg`);
    ok = false;
  }

  if (ok) {
    const kb = Math.round(stat.size / 1024);
    console.log(`✅ [IMG] Cover OK: ${slug}.jpg (${kb}KB, valid JPEG)`);
  }
}

process.exit(ok ? 0 : 1);
