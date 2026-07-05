#!/usr/bin/env node
/**
 * publish時（review→main反映時）に、日本語散文の文言変更をNG→OK候補として抽出しレポートする。
 *
 * 対象は src/pages/songs/*.astro ・ src/pages/columns/**\/*.astro のみ。
 * eng/jpn（歌詞引用・和訳）スロットは対象外＝運営者の地の文（解説・背景）だけを見る。
 * 「1行削除→1行追加」を同一hunk内で順に対応づけ、NG候補（旧）→OK候補（新）のペアを作る。
 * 対応するコミットのsubjectを「理由の手がかり」として添える（正確な理由ではなく推測材料）。
 *
 * CLI: node agent/src/tone-diff-report.mjs <fromRef> <toRef>
 *   標準出力にTelegram向けのプレーンテキストを出す（該当なしなら何も出さず終了コード0）。
 */
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jpCharCount } from './tone-rules.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const MIN_JP_CHARS = 6;
const MAX_PAIRS_PER_FILE = 6;
const MAX_FILES = 8;
const MAX_LINE_CHARS = 160;
const MAX_MESSAGE_CHARS = 3800;

function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 1024 * 1024 * 32 });
}

function stripTags(line) {
  return line
    .replace(/<Fragment[^>]*>|<\/Fragment>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSlotLine(line) {
  return /slot="(eng|jpn)"/.test(line);
}

function isCandidateLine(rawLine) {
  const text = stripTags(rawLine);
  if (!text) return false;
  if (isSlotLine(rawLine)) return false;
  if (jpCharCount(text) < MIN_JP_CHARS) return false;
  return true;
}

// unified diff (-U1) を hunk単位で { removed: string[], added: string[] } に分解する
function parseHunks(diffText) {
  const hunks = [];
  let current = null;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('@@')) {
      if (current) hunks.push(current);
      current = { removed: [], added: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('---') || line.startsWith('+++')) continue;
    if (line.startsWith('-')) {
      const body = line.slice(1);
      if (isCandidateLine(body)) current.removed.push(stripTags(body));
    } else if (line.startsWith('+')) {
      const body = line.slice(1);
      if (isCandidateLine(body)) current.added.push(stripTags(body));
    }
  }
  if (current) hunks.push(current);
  return hunks;
}

function getChangedFiles(fromRef, toRef) {
  const out = run(`git diff --name-only ${fromRef}..${toRef} -- src/pages/songs src/pages/columns`);
  return out.split('\n').map((l) => l.trim()).filter((l) => l.endsWith('.astro'));
}

function getCommitSubjects(fromRef, toRef, file) {
  const out = run(`git log --pretty=format:%s ${fromRef}..${toRef} -- "${file}"`);
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

export function buildToneDiffReport(fromRef, toRef) {
  const files = getChangedFiles(fromRef, toRef);
  if (files.length === 0) return '';

  const blocks = [];
  for (const file of files.slice(0, MAX_FILES)) {
    let diffText;
    try {
      diffText = run(`git diff -U1 ${fromRef}..${toRef} -- "${file}"`);
    } catch {
      continue;
    }
    const hunks = parseHunks(diffText);
    const pairs = [];
    for (const h of hunks) {
      const n = Math.min(h.removed.length, h.added.length);
      for (let i = 0; i < n; i++) {
        if (h.removed[i] === h.added[i]) continue;
        pairs.push({ before: h.removed[i], after: h.added[i] });
      }
    }
    if (pairs.length === 0) continue;

    const slug = file.replace(/^.*\//, '').replace(/\.astro$/, '');
    const subjects = getCommitSubjects(fromRef, toRef, file);
    const lines = [`■ ${slug}`];
    if (subjects.length > 0) lines.push(`  コミット: ${subjects.join(' / ')}`);
    for (const p of pairs.slice(0, MAX_PAIRS_PER_FILE)) {
      lines.push(`  NG候補「${truncate(p.before, MAX_LINE_CHARS)}」`);
      lines.push(`  → OK 「${truncate(p.after, MAX_LINE_CHARS)}」`);
    }
    if (pairs.length > MAX_PAIRS_PER_FILE) {
      lines.push(`  …他${pairs.length - MAX_PAIRS_PER_FILE}件`);
    }
    blocks.push(lines.join('\n'));
  }

  if (blocks.length === 0) return '';

  const header =
    `📋 今回の文言修正（NG→OK候補）\n` +
    `辞書に昇格したいものがあれば番号か語句で返信してください。理由も一言添えてもらえると助かります。\n\n`;

  let body = blocks.join('\n\n');
  if (header.length + body.length > MAX_MESSAGE_CHARS) {
    body = truncate(body, MAX_MESSAGE_CHARS - header.length - 30) + '\n…(以下省略。全件は git log で確認)';
  }
  return header + body;
}

// CLI実行
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [fromRef, toRef] = process.argv.slice(2);
  if (!fromRef || !toRef) {
    console.error('Usage: node agent/src/tone-diff-report.mjs <fromRef> <toRef>');
    process.exit(1);
  }
  const report = buildToneDiffReport(fromRef, toRef);
  if (report) console.log(report);
}
