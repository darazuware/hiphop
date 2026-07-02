#!/usr/bin/env node
/**
 * Obsidian言い換え辞書 → Item7禁止語リスト同期スクリプト。
 *
 * ~/Desktop/hiphop-notes/tone/言い換え辞書.md（NG→OK表）のNG列を機械抽出し、
 * agent/.tone-ng-words.json を生成する。pre-push-check.mjs の Item 7 がこのJSONを読む
 * （JSONはコミットするので、Vaultが無い環境でもガードは効く）。
 *
 * 誤爆調整: 抽出したNG語を既存の全曲.astro（日本語解説散文のみ）に当て、
 *   - 既存曲にヒット0 → block（検出＝ブロック）
 *   - 既存曲にヒットあり → warn（誤爆の可能性あり＝警告降格）
 * に自動振り分けする。既存記事を壊さず「新規初稿に二度と出さない」を実現する。
 *
 * 出力は語とカウントのみ（歌詞・本文テキストは一切出さない＝コンテンツフィルター対策）。
 *
 * 実行: node agent/src/sync-tone-dict.mjs
 *   辞書パスは環境変数 TONE_DICT_PATH で上書き可。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { jpBody, jpCharCount, coveredByBuiltins, escapeRe } from './tone-rules.mjs';

const projectRoot = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const dictPath =
  process.env.TONE_DICT_PATH || join(homedir(), 'Desktop/hiphop-notes/tone/言い換え辞書.md');
const outPath = join(projectRoot, 'agent/.tone-ng-words.json');
const songsDir = join(projectRoot, 'src/pages/songs');

if (!existsSync(dictPath)) {
  console.error(`❌ 辞書が見つかりません: ${dictPath}`);
  console.error('   TONE_DICT_PATH で指定するか、Obsidian Vault を確認してください。');
  process.exit(1);
}

// --- 1. 表からNG列（先頭セル）を抽出 ---
const lines = readFileSync(dictPath, 'utf-8').split('\n');
const candidates = new Set();
const warnings = [];

for (const line of lines) {
  const t = line.trim();
  if (!t.startsWith('|')) continue;
  const cells = t.split('|').slice(1, -1).map((c) => c.trim());
  const cell = cells[0];
  if (!cell) continue;
  if (/^[-: ]+$/.test(cell)) continue; // 区切り行
  if (/^NG/.test(cell)) continue; // ヘッダ行

  // 全体が（）の記述セル（例:「（地の文が常体で流れる）」）は具体語でないので抽出不可
  if (/^（.*）$/.test(cell)) {
    warnings.push(`抽出不可（記述的セル）: 「${cell}」`);
    continue;
  }
  // 注釈の（）を除去し、／区切りの複数語を展開
  const stripped = cell.replace(/（[^）]*）/g, '');
  let extracted = 0;
  for (let w of stripped.split(/[／/]/)) {
    w = w.trim().replace(/[〜…]+$/, '').replace(/\s*等$/, '').trim();
    if (!w) continue;
    if (/^[—–―\-ー・]+$/.test(w)) {
      warnings.push(`スキップ（ダッシュ記号）: 既存の DASH_RE ガードで対応済み`);
      continue;
    }
    if (jpCharCount(w) < 2) {
      warnings.push(`抽出不可（短すぎ）: 「${w}」`);
      continue;
    }
    if (coveredByBuiltins(w)) {
      warnings.push(`スキップ（既存ガード登録済み）: 「${w}」`);
      continue;
    }
    candidates.add(w);
    extracted++;
  }
  if (!extracted && !stripped.trim()) {
    warnings.push(`抽出不可（語が残らない）: 「${cell}」`);
  }
}

console.log(`📖 辞書パース: NG候補 ${candidates.size} 語を抽出`);
for (const w of warnings) console.log(`  ⚠ ${w}`);

// --- 2. 既存曲スキャンで誤爆判定（ヒットあり→warn降格） ---
const songFiles = readdirSync(songsDir).filter((f) => f.endsWith('.astro'));
const bodies = songFiles.map((f) => ({
  slug: basename(f, '.astro'),
  body: jpBody(readFileSync(join(songsDir, f), 'utf-8')),
}));

const block = [];
const warn = [];
for (const w of [...candidates].sort()) {
  const re = new RegExp(escapeRe(w), 'g');
  let total = 0;
  let slugs = 0;
  for (const { body } of bodies) {
    const n = (body.match(re) || []).length;
    if (n) {
      total += n;
      slugs++;
    }
  }
  if (total > 0) {
    warn.push(w);
    console.log(`  ⚠ warn降格（既存曲にヒット）: 「${w}」 ${slugs}曲/計${total}件`);
  } else {
    block.push(w);
  }
}

// --- 3. JSON出力 ---
const json = {
  generated: new Date().toISOString().slice(0, 10),
  source: dictPath.replace(homedir(), '~'),
  note: 'sync-tone-dict.mjs が生成（手編集しない）。block=既存曲ヒット0の確定NG語、warn=既存曲にヒットあり（誤爆回避で警告降格）。再同期: node agent/src/sync-tone-dict.mjs',
  block,
  warn,
};
writeFileSync(outPath, JSON.stringify(json, null, 2) + '\n');
console.log(`✅ ${outPath.replace(projectRoot + '/', '')} 更新: block ${block.length}語 / warn ${warn.length}語（既存曲 ${songFiles.length}曲でスキャン）`);
