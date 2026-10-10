#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const root = new URL('../../', import.meta.url).pathname;
const slug = '93-til-infinity';
const json = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const assets = `agent/${slug}/assets/`;
const evidence = json(assets + 'playback-timing.json');
const rows = json(assets + 'units-timestamps.json');
const units = json(assets + 'units.json');
const page = readFileSync(join(root, `src/pages/songs/${slug}.astro`), 'utf8');
const ids = [...page.matchAll(/TS\["([\w-]+)"\]\.t\b/g)].map(m => m[1]);
assert.equal(evidence.videoId, '4Z0TeaTzo_U');
assert.equal(evidence.duration, 286);
assert.equal(evidence.timingSourceDuration, evidence.duration);
assert.ok(page.includes(`youtubeId="${evidence.videoId}"`));
assert.ok(page.includes(`const YT = "${evidence.videoId}"`));
assert.ok(page.includes(`songDuration={${evidence.duration}}`));
assert.equal(ids.length, 25);
assert.deepEqual(units.map(u => u.id), ids);
assert.deepEqual(rows.map(u => u.id), ids);
let prev = -Infinity;
for (const row of rows) {
  if (evidence.pending.includes(row.id)) {
    assert.equal(row.t, null);
    assert.equal(row.source, 'pending');
    continue;
  }
  assert.equal(row.t, Math.floor(evidence.lineStarts[row.id]));
  assert.equal(row.source, 'synced');
  assert.equal(row.approx, false);
  assert.ok(row.t >= prev && row.t < evidence.duration);
  prev = row.t;
}
for (const marker of evidence.markers) assert.ok(page.includes(`data-player-marker data-t="${marker.t}" data-mc="${marker.mc}"`));
assert.ok(readFileSync(join(root, 'src/layouts/SongLayout.astro'), 'utf8').includes("lc.includes('chorus')"));
const metaArg = process.argv.indexOf('--metadata');
if (metaArg >= 0) {
  const video = JSON.parse(readFileSync(process.argv[metaArg + 1], 'utf8'));
  assert.equal(video.id, evidence.videoId);
  assert.equal(video.duration, evidence.duration);
  assert.equal(video.playable_in_embed, true);
}
if (process.argv.includes('--built')) {
  const html = readFileSync(join(root, `dist/songs/${slug}/index.html`), 'utf8');
  assert.ok(html.includes(`youtube.com/embed/${evidence.videoId}`));
  const seeks = [...html.matchAll(/data-seek="([\d.]+)"/g)].map(m => Number(m[1]));
  assert.deepEqual(seeks, rows.filter(r => r.t !== null).map(r => r.t));
  assert.equal(seeks.length, 24);
  assert.ok(!html.includes('data-seek="262"'));
}
// The generator must preserve old measurements and must never resurrect a pending guess.
const tmp = mkdtempSync(join(tmpdir(), '93-timing-proof-'));
try {
  const dir = join(tmp, 'agent/fixture/assets');
  mkdirSync(dir, { recursive: true });
  const fixture = [
    { id: 'manual', manualSec: 5, timingPending: true, syncedSec: 20, fallbackT: 30 },
    { id: 'official', captionSec: 6, syncedSec: 20, fallbackT: 30 },
    { id: 'synced', syncedSec: 7, fallbackT: 30 },
    { id: 'pending', timingPending: true, syncedSec: 8, fallbackT: 30 },
    { id: 'legacy', fallbackT: 9 },
    { id: 'absent', mvAbsent: true, manualSec: 10, fallbackT: 30 },
  ];
  writeFileSync(join(dir, 'units.json'), JSON.stringify(fixture));
  execFileSync(process.execPath, [join(root, 'agent/src/gen-fallback-timestamps.mjs'), '--slug', 'fixture'], { cwd: tmp, stdio: 'pipe' });
  const output = JSON.parse(readFileSync(join(dir, 'units-timestamps.json'), 'utf8'));
  assert.deepEqual(output.map(r => r.t), [5, 6, 7, null, 9, null]);
  const hash = createHash('sha256').update(JSON.stringify(output)).digest('hex');
  execFileSync(process.execPath, [join(root, 'agent/src/gen-fallback-timestamps.mjs'), '--slug', 'fixture'], { cwd: tmp, stdio: 'pipe' });
  assert.equal(createHash('sha256').update(readFileSync(join(dir, 'units-timestamps.json'), 'utf8')).digest('hex'), createHash('sha256').update(JSON.stringify(output, null, 2)).digest('hex'));
  assert.ok(hash);
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log('PASS: 286-second full audio; 24 sourced seeks; 1 pending seek hidden; chronological cards; chorus markers; measured-value precedence and regeneration.');
