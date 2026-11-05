#!/usr/bin/env node
// 汎用の一方向Telegram通知（AI不使用）。使い方: node agent/src/notify-telegram.mjs "メッセージ"
import { setDefaultResultOrder } from 'node:dns';
import net from 'node:net';
setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily?.(false);
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_KEY;
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || '').split(',')[0].trim();
const text = process.argv.slice(2).join(' ').trim();
if (!TOKEN || !CHAT_ID || !text) { console.log('❌ TOKEN/CHAT_ID/メッセージのいずれかが未設定'); process.exit(1); }
const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ chat_id: CHAT_ID, text })
});
console.log(r.ok ? '✅ sent' : `❌ ${r.status}`);
process.exit(r.ok ? 0 : 1);
