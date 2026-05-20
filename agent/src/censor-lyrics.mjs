#!/usr/bin/env node
/**
 * 歌詞伏字化スクリプト (AdSense 対応)
 *
 * .astro ファイル内の profanity をすべて伏字化する。
 * フロントマター (---) は対象外。スラッグ・インポートパスは変更なし。
 *
 * Usage:
 *   node agent/src/censor-lyrics.mjs          # 全曲処理
 *   node agent/src/censor-lyrics.mjs cream    # 指定曲のみ
 *
 * 伏字ルール:
 *   nigga / niggas / niggaz → n***a / n***as / n***az
 *   nigger / niggers        → n***er / n***ers
 *   fuck / fucking 等       → f**k / f**king 等
 *   bitch / bitches 等      → b***h / b***hes 等
 *   shit / shitty / bullshit 等 → s**t / s**ty / bulls**t 等
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const songsDir = join(projectRoot, 'src/pages/songs');

function censorText(text) {
  return text
    // n-word: nigga / niggas / niggaz / nigger / niggers / niggy etc.
    // \b at start only — compound forms rare but covered
    .replace(/\bnigg(a(?:z|s)?|er(?:s)?|y|edy)/gi, (_m, suffix) => 'n***' + suffix)
    // f-word: standalone and compound (fuck, fucking, motherfucker, etc.)
    // match "fuck" wherever it appears in a word
    .replace(/fuck(in'?g?|ed|er[sz]?|[sz])?/gi, (_m, suffix = '') => 'f**k' + suffix)
    // b-word
    .replace(/\bbitch(es|in'?g?)?/gi, (_m, suffix = '') => 'b***h' + suffix)
    // s-word: standalone and compound (shit, bullshit, shitpacker, shitty, etc.)
    // no trailing \b — covers compound words
    .replace(/shit(t(?:y|ier|iest|ing)|[sz])?/gi, (_m, suffix = '') => 's**t' + (suffix || ''));
}

function processFile(filePath) {
  const original = readFileSync(filePath, 'utf-8');

  // Split off frontmatter (---...---) — leave it untouched
  const fmMatch = original.match(/^(---[\s\S]*?---\n)([\s\S]*)$/);
  let frontmatter = '';
  let body = original;
  if (fmMatch) {
    frontmatter = fmMatch[1];
    body = fmMatch[2];
  }

  // Censor the body but skip import lines and slug prop values
  const censored = body
    .split('\n')
    .map(line => {
      // Don't touch import statements
      if (/^\s*import\s/.test(line)) return line;
      // Don't touch the slug prop (URL must not change)
      if (/slug=/.test(line) && !/slot=/.test(line)) return line;
      return censorText(line);
    })
    .join('\n');

  const result = frontmatter + censored;
  if (result === original) return false;
  writeFileSync(filePath, result, 'utf-8');
  return true;
}

const slugArg = process.argv[2];
const files = slugArg
  ? [join(songsDir, `${slugArg}.astro`)]
  : readdirSync(songsDir)
      .filter(f => f.endsWith('.astro'))
      .map(f => join(songsDir, f));

let changed = 0;
for (const filePath of files) {
  try {
    const wasChanged = processFile(filePath);
    const name = filePath.split('/').pop();
    if (wasChanged) {
      console.log(`✅ 伏字化: ${name}`);
      changed++;
    } else {
      console.log(`   スキップ: ${name}`);
    }
  } catch (e) {
    console.error(`❌ エラー: ${filePath} — ${e.message}`);
  }
}

console.log(`\n完了: ${changed}/${files.length} ファイルを更新しました。`);
