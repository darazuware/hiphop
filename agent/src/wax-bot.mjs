/**
 * wax-bot — Telegram から WAX&THINK を操作する常駐ボット（pakaru_bot.py の Node 移植）
 *
 * 機能:
 *   /start … 使い方を返す
 *   /run <slug|曲名> … その曲の記事を宣伝する SNS投稿案を6パターン生成し、A〜Fのボタンで選べる
 *   ボタン … 押すとその型の本文だけをコピー用に表示し agent/output/selected_*.txt に保存
 *   通常文 … WAX&THINK 運営者本人としてそのまま会話（このスレッドを Telegram で継続）
 *
 * 設計メモ:
 *   - proxy/SSL 環境でも Node の fetch は Telegram API に通ることを実測確認済み（httpx 不要）。
 *   - 依存は最小（@anthropic-ai/sdk, dotenv のみ。telegram ライブラリは使わず fetch 直叩き）。
 *   - chat_id は getUpdates から自動取得するので CHAT_ID は不要。
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_ROOT = join(__dirname, '..');
const PROJECT_ROOT = join(AGENT_ROOT, '..');
dotenv.config({ path: join(AGENT_ROOT, '.env') });

// chat で使えるモデル（/model で切替）。/run の投稿生成は安価な haiku 固定。
const MODELS = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-8',
  haiku: 'claude-haiku-4-5',
};
const MODEL_LABEL = {
  sonnet: 'Sonnet（通常会話・推奨）',
  opus: 'Opus（コーディング・難しい判断）',
  haiku: 'Haiku（軽い雑談・最速）',
};
const DEFAULT_MODEL_KEY = 'sonnet';
const POST_MODEL = 'claude-haiku-4-5';
// .env はこの PJ では TELEGRAM_BOT_TOKEN。pakaru 仕様の TELEGRAM_API_KEY も後方互換で受ける。
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_KEY;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const API = `https://api.telegram.org/bot${TOKEN}`;
const SITE = 'https://waxthink.com';

const client = new Anthropic({ apiKey: API_KEY });

// ── 運営者ボイス（docs/article-tone.md の確定トーンを system に凝縮。chat と /run で共有）──
const WAX_VOICE = `あなたは音楽サイト「WAX&THINK」(${SITE}) の運営者本人です。
ヒップホップのリリックを英語学習×文化解説の教材として読み解くサイトを一人で運営しています。
スタンス: 審査員ではなくファン。作品を上から格付けせず、好きで語り、読者と一緒に驚く。
文体: 常体（だ・である）基調に要所で敬体（です・ます／〜と思います）を混ぜ、ゆらぎを許容して固さを消す。
一文の長短に緩急。専門語・固有名詞の直後に素の言い換えを添えて初心者を置き去りにしない。
括弧書きの素のつぶやきで硬さを抜く。トーンはラフでも、年・客演・チャート・サンプル元などの事実は厳密に扱い、曖昧表現で逃げない（不確かなら断定しない）。
「見事」「圧巻」「秀逸」など評論家ヅラの格付け語は使わない。`;

const CHAT_SYSTEM = `${WAX_VOICE}

ユーザー（＝サイト運営者であるあなた自身の相棒／編集パートナー）の相談に、簡潔に・確認最小限で答えます。記事の方針、曲の解釈、スラングの意味、運営の判断などを上記のボイスで一緒に考える相手です。`;

// /run の SNS投稿パターン
const LABELS = {
  A: '驚き・トリビア型',
  B: 'スラング切り出し型',
  C: '文化背景型',
  D: 'サンプリング型',
  E: '学習メリット型',
  F: '本音・エモ型',
};

// ── chat_id ごとの状態 ──
const lastPosts = {}; // chat_id -> { A: 本文, ... }
const chatHist = {};  // chat_id -> [{ role, content }, ...]
const chatModel = {}; // chat_id -> モデルキー（'sonnet' | 'opus' | 'haiku'）

const modelKeyOf = (chatId) => chatModel[chatId] || DEFAULT_MODEL_KEY;

// ── Telegram API ヘルパー（httpx の代わりに fetch。70秒タイムアウト）──
async function tg(method, params = {}) {
  const payload = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) payload[k] = v;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 70_000);
  try {
    const r = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload), // reply_markup はオブジェクトのまま入れてOK
      signal: ctrl.signal,
    });
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── songs.ts から曲メタを抽出（.ts は import せず正規表現でパース）──
let songCache = null;
async function loadSongs() {
  if (songCache) return songCache;
  const src = await readFile(join(PROJECT_ROOT, 'src/data/songs.ts'), 'utf-8');
  const field = (obj, key) => {
    const m = obj.match(new RegExp(`${key}:\\s*("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`));
    if (!m) return '';
    return m[1].slice(1, -1).replace(/\\(.)/g, '$1');
  };
  const songs = [];
  for (const m of src.matchAll(/\{[^{}]*slug:[^{}]*\}/g)) {
    const o = m[0];
    const slug = field(o, 'slug');
    if (!slug) continue;
    songs.push({
      slug,
      key: slug.replace(/^\/songs\//, ''),
      title: field(o, 'title'),
      artists: field(o, 'artists'),
      album: field(o, 'album'),
      subtitle: field(o, 'subtitle'),
    });
  }
  songCache = songs;
  return songs;
}

function findSong(songs, query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    songs.find((s) => s.key === q || s.slug === q || s.slug === `/songs/${q}`) ||
    songs.find((s) => s.key.includes(q)) ||
    songs.find((s) => s.title.toLowerCase().includes(q)) ||
    songs.find((s) => s.artists.toLowerCase().includes(q)) ||
    null
  );
}

// ── 【A：…】本文 形式を { A: 本文 } に分解 ──
function parsePatterns(text) {
  const out = {};
  let cur = null;
  let buf = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    let hit = null;
    for (const key of Object.keys(LABELS)) {
      if (s.startsWith(`【${key}`) || s.startsWith(`[${key}`)) { hit = key; break; }
    }
    if (hit) {
      if (cur) out[cur] = buf.join('\n').trim();
      cur = hit;
      buf = [];
    } else if (cur) {
      buf.push(line);
    }
  }
  if (cur) out[cur] = buf.join('\n').trim();
  return out;
}

async function generatePosts(song) {
  const url = `${SITE}${song.slug}`;
  const labelList = Object.entries(LABELS).map(([k, v]) => `${k}：${v}`).join(' / ');
  const prompt = `WAX&THINK の楽曲記事「${song.title}」(${song.artists}${song.album ? ` / アルバム『${song.album}』` : ''}) を宣伝する X/SNS 投稿案を、次の6つの型で1案ずつ作ってください。
型: ${labelList}

記事URL: ${url}

ルール:
- 各案は日本語で全角140字以内。最後に記事URLを置く。
- ハッシュタグは1〜2個まで（例: #ヒップホップ #英語学習）。
- 事実（年・客演・サンプル・チャート）に確信が持てない場合は具体数値を書かず、確実な範囲で書く。盛らない。
- 出力は必ず次の形式。前置きや締めの文章は書かない。
【A：${LABELS.A}】
本文
【B：${LABELS.B}】
本文
…（F まで）`;

  const resp = await client.messages.create({
    model: POST_MODEL,
    max_tokens: 1500,
    system: WAX_VOICE,
    messages: [{ role: 'user', content: prompt }],
  });
  return resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

function keyboard(posts) {
  const keys = Object.keys(LABELS).filter((k) => k in posts);
  const rows = [keys.slice(0, 3), keys.slice(3)];
  return {
    inline_keyboard: rows
      .filter((r) => r.length)
      .map((row) => row.map((k) => ({ text: `${k}：${LABELS[k]}`, callback_data: k }))),
  };
}

async function chatReply(chatId, text) {
  const hist = (chatHist[chatId] ||= []);
  hist.push({ role: 'user', content: text });
  const resp = await client.messages.create({
    model: MODELS[modelKeyOf(chatId)],
    max_tokens: 700,
    system: CHAT_SYSTEM,
    messages: hist.slice(-12),
  });
  const answer = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  hist.push({ role: 'assistant', content: answer });
  return answer;
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text || '';

  if (text.startsWith('/start')) {
    await tg('sendMessage', {
      chat_id: chatId,
      text:
        'WAX&THINK ボットです。\n' +
        '・/run <slug|曲名> … その曲の宣伝SNS投稿案を6パターン出す（例: /run cream）\n' +
        '・/run … 引数なしだと曲一覧を出す\n' +
        '・/model … 会話に使うClaudeモデルを切替（sonnet/opus/haiku）\n' +
        '・それ以外の文章 … 運営者の相棒として普通に会話します（スレッド継続）',
    });
    return;
  }

  if (text.startsWith('/model')) {
    const arg = text.replace(/^\/model(@\S+)?/, '').trim().toLowerCase();
    if (arg && arg in MODELS) {
      chatModel[chatId] = arg;
      await tg('sendMessage', { chat_id: chatId, text: `✅ モデルを ${MODEL_LABEL[arg]} に切替えました。` });
      return;
    }
    await tg('sendMessage', {
      chat_id: chatId,
      text: `現在のモデル: ${MODEL_LABEL[modelKeyOf(chatId)]}\n切替えるモデルを選んでください👇`,
      reply_markup: {
        inline_keyboard: Object.keys(MODELS).map((k) => [
          { text: (k === modelKeyOf(chatId) ? '● ' : '') + MODEL_LABEL[k], callback_data: `model:${k}` },
        ]),
      },
    });
    return;
  }

  if (text.startsWith('/run')) {
    const arg = text.replace(/^\/run(@\S+)?/, '').trim();
    const songs = await loadSongs();
    if (!arg) {
      const list = songs.slice(0, 30).map((s) => `・${s.key} — ${s.title} / ${s.artists}`).join('\n');
      await tg('sendMessage', { chat_id: chatId, text: `曲を指定してください（/run cream のように）。\n\n${list}` });
      return;
    }
    const song = findSong(songs, arg);
    if (!song) {
      await tg('sendMessage', { chat_id: chatId, text: `「${arg}」に一致する曲が見つかりません。/run で一覧を確認してください。` });
      return;
    }
    await tg('sendMessage', { chat_id: chatId, text: `「${song.title}」の宣伝投稿案を生成中…` });
    let raw;
    try {
      raw = await generatePosts(song);
    } catch (e) {
      await tg('sendMessage', { chat_id: chatId, text: `生成失敗: ${e.message}` });
      return;
    }
    const posts = parsePatterns(raw);
    if (!Object.keys(posts).length) {
      await tg('sendMessage', { chat_id: chatId, text: `解析失敗。原文:\n\n${raw}` });
      return;
    }
    lastPosts[chatId] = posts;
    const preview = Object.keys(LABELS)
      .filter((k) => k in posts)
      .map((k) => `【${k}：${LABELS[k]}】\n${posts[k]}`)
      .join('\n\n');
    await tg('sendMessage', {
      chat_id: chatId,
      text: `${preview}\n\n👇 採用する型を選んでください`,
      reply_markup: keyboard(posts),
    });
    return;
  }

  // 通常会話
  try {
    await tg('sendMessage', { chat_id: chatId, text: await chatReply(chatId, text) });
  } catch (e) {
    await tg('sendMessage', { chat_id: chatId, text: `エラー: ${e.message}` });
  }
}

async function handleCallback(cb) {
  const chatId = cb.message.chat.id;
  const key = cb.data;

  // モデル切替ボタン
  if (key.startsWith('model:')) {
    const mk = key.slice('model:'.length);
    if (mk in MODELS) {
      chatModel[chatId] = mk;
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: `${mk} に切替` });
      await tg('sendMessage', { chat_id: chatId, text: `✅ モデルを ${MODEL_LABEL[mk]} に切替えました。` });
    } else {
      await tg('answerCallbackQuery', { callback_query_id: cb.id });
    }
    return;
  }

  await tg('answerCallbackQuery', { callback_query_id: cb.id, text: `${key} を採用` });
  const posts = lastPosts[chatId] || {};
  const body = posts[key];
  if (!body) {
    await tg('sendMessage', { chat_id: chatId, text: '先に /run で生成してください。' });
    return;
  }
  const outDir = join(AGENT_ROOT, 'output');
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  await writeFile(join(outDir, `selected_${stamp}.txt`), body, 'utf-8');
  await tg('sendMessage', { chat_id: chatId, text: `✅ ${key}：${LABELS[key]} を採用。コピーしてください👇` });
  await tg('sendMessage', { chat_id: chatId, text: body });
}

async function main() {
  if (!TOKEN) {
    console.error('エラー: TELEGRAM_BOT_TOKEN（または TELEGRAM_API_KEY）が未設定です。');
    process.exit(1);
  }
  if (!API_KEY) {
    console.error('エラー: ANTHROPIC_API_KEY が未設定です。');
    process.exit(1);
  }
  const me = await tg('getMe');
  if (!me.ok) {
    console.error('getMe 失敗:', me.description);
    process.exit(1);
  }
  console.log(`起動: @${me.result.username}`);
  let offset;
  for (;;) {
    let res;
    try {
      res = await tg('getUpdates', { offset, timeout: 60 });
    } catch (e) {
      console.error('getUpdates失敗:', e.message);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    for (const upd of res.result || []) {
      offset = upd.update_id + 1;
      try {
        if (upd.callback_query) await handleCallback(upd.callback_query);
        else if (upd.message && upd.message.text) await handleMessage(upd.message);
      } catch (e) {
        console.error('処理失敗:', e.message);
      }
    }
  }
}

// 直接実行されたときだけ常駐ループを起動（import 時は走らせない＝テスト可能にする）
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { loadSongs, findSong, parsePatterns, LABELS };
