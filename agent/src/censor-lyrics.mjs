#!/usr/bin/env node
/**
 * 歌詞伏字化スクリプト
 *
 * .astro ファイル内の profanity を AdSense 対応のために伏字化する。
 * 対象:
 *   - <Fragment slot="eng"> ... </Fragment> 内の歌詞
 *   - highlights={[...]} プロップ内の歌詞引用
 *   - description="..." プロップ内の引用
 * 非対象:
 *   - <Fragment slot="jpn"> (和訳)
 *   - <Fragment slot="explanation"> (解説)
 *
 * Usage:
 *   node agent/src/censor-lyrics.mjs          # 全曲処理
 *   node agent/src/censor-lyrics.mjs cream    # 指定曲のみ
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const songsDir = join(projectRoot, 'src/pages/songs');

function censorText(text) {
  return text
    // n-word: nigga / niggas / niggaz / nigger / niggers / niggy 等
    .replace(/\bnigg(a(?:z|s)?|er(?:s)?|y|edy)\b/gi, (m, suffix) => 'n***' + suffix)
    // f-word: fuck → f**k, fucking → f**king, etc.
    .replace(/\bfuck(in'?g?|ed|er[sz]?|[sz])?\b/gi, (_m, suffix = '') => 'f**k' + suffix)
    // b-word: bitch / bitches
    .replace(/\bbitch(es|in\'?g?)?\b/gi, (_m, suffix = '') => 'b***h' + suffix)
    // s-word: shit / shits / shitty 等
    .replace(/\bshit(t(?:y|ier|iest|ing)|s)?\b/gi, (_m, suffix = '') => 's**t' + (suffix || ''));
}

function processFile(filePath) {
  const original = readFileSync(filePath, 'utf-8');
  let result = original;

  // eng slot 内
  result = result.replace(
    /(<Fragment\s+slot="eng">)([\s\S]*?)(<\/Fragment>)/g,
    (_m, open, inner, close) => open + censorText(inner) + close
  );

  // highlights プロップ内（歌詞引用が含まれることが多い）
  result = result.replace(
    /(highlights=\{\[)([\s\S]*?)(\]\})/,
    (_m, open, inner, close) => open + censorText(inner) + close
  );

  // description プロップ内
  result = result.replace(
    /(description=")(.*?)(")/g,
    (_m, open, inner, close) => open + censorText(inner) + close
  );

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
