#!/usr/bin/env node
/**
 * 記事レビュー依頼のTelegram通知（決定的スクリプト・AI不使用）
 *
 * reviewブランチへpushした後に実行し、Vercelの固定プレビューURLを運営者へ送る。
 * 運営者はスマホでレビューし、承認なら /publish、修正指示はTelegramで返す。
 *
 * Usage:
 *   node agent/src/notify-review.mjs <slug> [slug2 ...] [--note "補足"]
 *
 * slug は /songs/{slug} として送る。/columns/... など / で始まるパスはそのまま使う。
 */

// IPv6が落ちている環境でも fetch が固まらないようにする（index.mjs と同じ対策）
import { setDefaultResultOrder } from 'node:dns';
import net from 'node:net';
setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily?.(false);

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';

const AGENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(AGENT_ROOT, '.env') });

const PREVIEW_BASE = 'https://hiphop-git-review-darazuwares-projects.vercel.app';
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_KEY;
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || '').split(',')[0].trim();

const args = process.argv.slice(2);
const noteIdx = args.indexOf('--note');
const note = noteIdx >= 0 ? (args[noteIdx + 1] || '') : '';
const targets = args.filter((a, i) => i !== noteIdx && i !== noteIdx + 1 && !a.startsWith('--'));

if (!TOKEN || !CHAT_ID) {
  console.error('[notify-review] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID が未設定です（agent/.env）');
  process.exit(1);
}
if (targets.length === 0) {
  console.error('Usage: node agent/src/notify-review.mjs <slug> [slug2 ...] [--note "補足"]');
  process.exit(1);
}

const urls = targets.map((t) => PREVIEW_BASE + (t.startsWith('/') ? t : `/songs/${t}`));
const text = [
  '📝 レビュー依頼（reviewブランチ・本番未反映）',
  ...urls,
  note,
  '承認 → /publish ／ 修正指示はこのままTelegramへ',
].filter(Boolean).join('\n');

const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ chat_id: CHAT_ID, text }),
});
const data = await res.json();
if (!data.ok) {
  console.error(`[notify-review] Telegram送信失敗: ${data.description}`);
  process.exit(1);
}
console.log(`[notify-review] sent → ${urls.join(' , ')}`);
