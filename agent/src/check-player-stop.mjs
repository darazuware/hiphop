#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const root = new URL('../../', import.meta.url);
const layout = readFileSync(new URL('src/layouts/SongLayout.astro', root), 'utf8');
const component = readFileSync(new URL('src/components/LearningUnit.astro', root), 'utf8');
assert.match(component, /<button\s+type="button"\s+data-player-stop\s+aria-label="再生を停止"/);
const handlerStart = layout.indexOf("document.addEventListener('click', (e: MouseEvent) => {");
const handlerEnd = layout.indexOf('\n    });', handlerStart) + '\n    });'.length;
const stateStart = layout.indexOf('function setPlaying(p: boolean)');
const stateEnd = layout.indexOf("    playBtn.addEventListener('click'", stateStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart && stateStart >= 0 && stateEnd > stateStart);
const code = transformSync(layout.slice(handlerStart, handlerEnd) + '\n' + layout.slice(stateStart, stateEnd), { loader: 'ts' }).code;
function harness({ ready, playing = false, pending = false }) {
  const calls = { pause: 0, seek: 0, play: 0, cancelled: 0, render: 0, prevented: 0 };
  let click;
  const context = {
    document: { addEventListener: (_, fn) => { click = fn; } },
    ytIframe: {}, ytReady: ready, playing, pendingPlay: pending, pendingSeek: 167,
    elapsed: 167, DURATION: 286, hasSeekedToStart: false, lastTick: 0, rafId: 1,
    iconPlay: { style: { display: pending || playing ? 'none' : 'block' } },
    iconPause: { style: { display: pending || playing ? 'block' : 'none' } },
    ytPlayer: { pauseVideo: () => calls.pause++, seekTo: () => calls.seek++, playVideo: () => calls.play++ },
    cancelAnimationFrame: () => calls.cancelled++, requestAnimationFrame: () => 2,
    loop: () => {}, updateFollowChip: () => {}, render: () => calls.render++,
  };
  runInNewContext(code, context);
  const press = kind => click({
    target: { closest: selector => selector === (kind === 'stop' ? '[data-player-stop]' : '[data-seek]') ? { getAttribute: () => '167' } : null },
    preventDefault: () => calls.prevented++,
  });
  return { context, calls, press };
}
for (const ready of [false, true]) {
  for (const playing of [false, true]) {
    const { context, calls, press } = harness({ ready, playing, pending: true });
    press('stop');
    press('stop');
    assert.equal(context.pendingPlay, false);
    assert.equal(context.playing, false);
    assert.equal(context.elapsed, 167);
    assert.equal(context.pendingSeek, 167);
    assert.equal(context.iconPlay.style.display, 'block');
    assert.equal(context.iconPause.style.display, 'none');
    assert.equal(calls.pause, ready ? 2 : 0);
    assert.equal(calls.seek + calls.play + calls.render, 0);
    assert.equal(calls.cancelled, playing ? 1 : 0);
    assert.equal(calls.prevented, 2);
  }
  const { context, calls, press } = harness({ ready });
  press('seek');
  assert.equal(calls.render, 1);
  assert.equal(calls.play, ready ? 1 : 0);
  assert.equal(context.pendingPlay, !ready);
  press('stop');
  assert.equal(context.pendingPlay, false);
  assert.equal(context.elapsed, 167);
}
if (process.argv.includes('--built')) {
  const html = readFileSync(new URL('dist/songs/93-til-infinity/index.html', root), 'utf8');
  assert.equal([...html.matchAll(/data-player-stop(?:\s|>)/g)].length, 24);
  assert.equal([...html.matchAll(/data-seek="/g)].length, 24);
}
console.log('PASS: stop pauses ready player, cancels queued play, preserves position, handles repeated/SVG clicks, and leaves seeking intact.');
