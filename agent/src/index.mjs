/**
 * メインエントリポイント — 自律エージェントループ
 *
 * 60秒ごとに Telegram をポーリングし、
 * "アーティスト - 曲名 [年]" メッセージを検出して処理する。
 *
 * フロー:
 *   Telegram受信 → Gemini Deep Research → Genius歌詞取得
 *   → JSON保存 → Claude Code CLI → Telegram通知
 */

import 'dotenv/config';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { getUpdates, sendMessage, parseMessage } from './telegram.mjs';
import { runResearch, extractMetadata } from './research.mjs';
import { fetchLyrics } from './genius.mjs';
import { processAndDeploy } from './processor.mjs';

// 多重起動防止ロック
const LOCK_FILE = '/tmp/hiphop-agent.lock';
try {
  const existing = await readFile(LOCK_FILE, 'utf-8').catch(() => null);
  if (existing) {
    const pid = parseInt(existing.trim(), 10);
    try {
      process.kill(pid, 0); // プロセスが生きているか確認
      console.error(`既に起動中 (PID: ${pid})。終了します。`);
      process.exit(0);
    } catch {
      // 古いロックファイル（プロセス死亡済み）→ 続行
    }
  }
  await writeFile(LOCK_FILE, String(process.pid), 'utf-8');
  process.on('exit', () => unlink(LOCK_FILE).catch(() => {}));
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
} catch (e) {
  console.error(`ロックエラー: ${e.message}`);
}

/** キューディレクトリ */
const QUEUE_DIR = '/tmp/hiphop-queue';

/** オフセットファイル（再起動時の重複防止） */
const OFFSET_FILE = join(QUEUE_DIR, '.offset');

/** ポーリング間隔（ミリ秒） */
const POLL_INTERVAL = 60_000;

/**
 * 保存済みオフセットを読み込む
 * @returns {Promise<number>}
 */
async function loadOffset() {
  try {
    const data = await readFile(OFFSET_FILE, 'utf-8');
    return parseInt(data.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * オフセットを永続化する
 * @param {number} offset
 */
async function saveOffset(offset) {
  await writeFile(OFFSET_FILE, String(offset), 'utf-8');
}

/**
 * 1件のメッセージを処理する
 * @param {{ artist: string, title: string, year: number|null }} song
 * @param {string|number} chatId - 返信先 Chat ID
 */
async function processSong(song, chatId) {
  const label = `${song.artist} - ${song.title}${song.year ? ` [${song.year}]` : ''}`;
  console.log(`\n🎵 処理開始: ${label}`);

  // ステータス通知
  await sendMessage(`🔍 リサーチ開始: *${label}*`, chatId);

  // 1. Gemini Deep Research
  console.log('[Step 1/4] Gemini Deep Research...');
  let research = '';
  try {
    research = await runResearch(song);
  } catch (error) {
    console.error(`リサーチ失敗: ${error.message}`);
    await sendMessage(`❌ リサーチ失敗: ${error.message}`, chatId);
    return;
  }

  // リサーチ結果から正式名称・年号を抽出（表記揺れ補正・年自動取得）
  console.log('[Step 1b] メタデータ抽出...');
  const meta = await extractMetadata(research, song);
  if (meta.artist !== song.artist || meta.title !== song.title || meta.year !== song.year) {
    console.log(`  補正: "${song.artist} - ${song.title}" → "${meta.artist} - ${meta.title} [${meta.year}]"`);
  }
  song.artist = meta.artist;
  song.title = meta.title;
  song.year = meta.year ?? song.year;

  // 2. Genius 歌詞取得
  console.log('[Step 2/4] Genius 歌詞取得...');
  const { lyrics, url: geniusUrl, imageUrl } = await fetchLyrics(song.title, song.artist);
  if (!lyrics) {
    console.warn('歌詞が取得できませんでした。リサーチ結果のみで続行します。');
  }

  // 3. JSON 保存
  console.log('[Step 3/4] JSON 保存...');
  const timestamp = Date.now();
  const payload = {
    artist: song.artist,
    title: song.title,
    year: song.year,
    research,
    lyrics,
    geniusUrl,
    imageUrl,
    timestamp: new Date().toISOString(),
  };

  const jsonPath = join(QUEUE_DIR, `${timestamp}.json`);
  await writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`  保存先: ${jsonPath}`);

  await sendMessage(`📝 リサーチ完了。記事を生成・デプロイ中...`, chatId);

  // 4. ファイル生成とデプロイ（Git Push）
  console.log('[Step 4/4] デプロイ中...');
  const result = await processAndDeploy(jsonPath);

  if (result.success) {
    await sendMessage(`✅ 完了: ${label}\n記事が生成・デプロイされました。`, chatId);
    console.log(`✅ 完了: ${label}`);
  } else {
    // Markdown パースエラーを避けるためプレーンテキストで送信
    const errorMsg = String(result.error || '不明なエラー').slice(0, 500);
    await sendMessage(`❌ Claude Code エラー: ${label}\n\n${errorMsg}`, chatId);
    console.log(`❌ エラー: ${label} — ${result.error}`);
  }
}

/** メインポーリングループ */
async function main() {
  // 環境変数チェック
  const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'GOOGLE_AI_API_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ 環境変数が未設定: ${missing.join(', ')}`);
    process.exit(1);
  }

  // ボット自身のIDを取得（無限ループ防止用）
  let botId = null;
  try {
    const me = await (await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`)).json();
    botId = me.result?.id;
    console.log(`  [Bot] ID: ${botId} (@${me.result?.username})`);
  } catch (e) {
    console.warn('ボットIDの取得に失敗しました。無限ループに注意してください。');
  }

  // キューディレクトリ作成
  await mkdir(QUEUE_DIR, { recursive: true });

  // オフセット読み込み
  let offset = await loadOffset();

  console.log('═══════════════════════════════════════');
  console.log('  🤖 HipHop Agent 起動');
  console.log(`  ポーリング間隔: ${POLL_INTERVAL / 1000}秒`);
  console.log('═══════════════════════════════════════');

  // 起動通知
  try {
    await sendMessage('🤖 HipHop Agent が再起動しました。');
  } catch (error) {
    console.warn(`起動通知送信失敗: ${error.message}`);
  }

  // メインループ
  while (true) {
    try {
      const updates = await getUpdates(offset);

      for (const update of updates) {
        // オフセット更新
        offset = update.update_id + 1;
        await saveOffset(offset);

        // ボット自身のメッセージは無視
        if (botId && update.message?.from?.id === botId) continue;

        // テキストメッセージのみ処理
        const text = update.message?.text;
        if (!text) continue;

        const chatId = update.message.chat.id;

        // メッセージパース（複数行対応）
        const songs = parseMessage(text);
        if (!songs) {
          console.log(`⏭ スキップ（形式不一致）: "${text}"`);
          continue;
        }

        // 並列処理（各曲は独立して処理、watcher側でキューイングされる）
        for (const song of songs) {
          processSong(song, chatId).catch((error) => {
            console.error(`処理エラー: ${error.message}`);
            const safeError = String(error.message).slice(0, 200);
            sendMessage(`❌ 処理エラー: ${safeError}`, chatId).catch(() => {});
          });
        }
      }
    } catch (error) {
      console.error(`ポーリングエラー: ${error.message}`);
    }

    // 次のポーリングまで待機
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

// 実行
main().catch((error) => {
  console.error(`致命的エラー: ${error.message}`);
  process.exit(1);
});
