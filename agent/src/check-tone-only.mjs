#!/usr/bin/env node
/**
 * Standalone tone-gate checker (no Genius fetch, no network).
 * Replicates pre-push-check.mjs's checkCriticTone() exactly, for fast local iteration
 * while rewriting dashes / critic-tone violations across many files.
 * Usage: node agent/src/check-tone-only.mjs <slug-or-path> [<slug-or-path> ...]
 */
import { readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';

const projectRoot = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const songsDir = join(projectRoot, 'src/pages/songs');

const CRITIC_HARD = [
  '圧巻', '秀逸', '通奏低音', '言語の経済性', 'リリシズムの核', 'にほかならない', 'に他ならない',
  '先駆けとして', 'として位置づけ', 'として位置付け', 'スタイルを確立', '多層的に読める',
  'と言えるだろう', 'と言えよう', 'ではないだろうか', 'なのである', 'と言っても過言ではない',
  'たらしめ', '諦観', '省察',
];
const CRITIC_SOFT = [
  '唯一無二', '色褪せ', '金字塔', '不朽の', '真骨頂', 'を体現', 'に昇華', '極北', 'いわば',
  '凝縮されて', '奥行きを与え', '証左', '大仰',
];
const READER_CMD_RE = /て(?:ください|下さい)|声に出して/g;
const DASH_RE = /[—–―]/g;
const ASSERT_RE = /(?<![んな])だ。|である。/g;
const ASSERT_LIMIT = 5;

function jpBody(raw) {
  let body = raw.replace(/^---[\s\S]*?\n---/, '');
  body = body.replace(/<Fragment\b[^>]*slot="(?:eng|jpn)"[^>]*>[\s\S]*?<\/Fragment>/g, ' ');
  body = body.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/g, ' ');
  body = body.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/g, ' ');
  body = body.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
  return body;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node agent/src/check-tone-only.mjs <slug-or-path> [...]');
  process.exit(1);
}

let anyFailed = false;
for (const arg of args) {
  const slug = basename(arg, '.astro');
  const file = join(songsDir, `${slug}.astro`);
  if (!existsSync(file)) {
    console.warn(`⚠️  Not found: ${file}`);
    continue;
  }
  const body = jpBody(readFileSync(file, 'utf-8'));
  const hits = [];
  const an = (body.match(ASSERT_RE) || []).length;
  if (an > ASSERT_LIMIT) hits.push(`体言止め断定(だ。/である。)×${an}＞許容${ASSERT_LIMIT}`);
  for (const w of CRITIC_HARD) {
    const n = (body.match(new RegExp(w, 'g')) || []).length;
    if (n) hits.push(`${w}×${n}`);
  }
  const dn = (body.match(DASH_RE) || []).length;
  if (dn) hits.push(`ダッシュ(—/–/―)×${dn}`);

  const warns = [];
  for (const w of CRITIC_SOFT) {
    const n = (body.match(new RegExp(w, 'g')) || []).length;
    if (n) warns.push(`${w}×${n}`);
  }
  const cn = (body.match(READER_CMD_RE) || []).length;
  if (cn) warns.push(`読者への命令形×${cn}`);
  if (warns.length) console.log(`⚠ [TONE] ${slug}: 推奨改善（ブロックなし）→ ${warns.join(' / ')}`);

  if (hits.length) {
    console.log(`❌ [TONE] ${slug}: 評論家口調（ブロック）→ ${hits.join(' / ')}`);
    anyFailed = true;
  } else {
    console.log(`✅ [TONE] ${slug}: 評論家口調ブロックなし（だ。/である。×${an}／許容${ASSERT_LIMIT}）`);
  }
}

process.exit(anyFailed ? 1 : 0);
