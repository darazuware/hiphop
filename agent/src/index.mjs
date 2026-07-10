/**
 * メインエントリポイント — 自律エージェントループ
 *
 * 60秒ごとに Telegram をポーリングし、
 * "アーティスト - 曲名 [年]" メッセージを検出して処理する。
 *
 * フロー:
 *   Telegram受信 → Genius歌詞取得（リサーチはClaude側WebSearchに委譲・Gemini不使用）
 *   → JSON保存 → Claude Code CLI → Telegram通知
 */

import 'dotenv/config';

// IPv6が落ちている環境でも fetch が固まらないようにする。
// setDefaultResultOrder だけでは undici の Happy Eyeballs(autoSelectFamily) が
// 死んだIPv6へ接続を試みて ETIMEDOUT するため、両方を設定してIPv4のみに固定する。
import { setDefaultResultOrder } from 'node:dns';
import net from 'node:net';
setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily?.(false);

// Homebrew PATH（nohup起動時にPATHが引き継がれないため明示的に追加）
process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`;
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';
import { getUpdates, sendMessage, parseMessage } from './telegram.mjs';
import { fetchLyrics } from './genius.mjs';
import { processAndDeploy } from './processor.mjs';
import { runFreeform, runToneFix } from './claude.mjs';
import { deriveSlug, inspectExistingSong, buildConversionData } from './existing-song.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

/** /menu・/help で返すコマンド一覧 */
const MENU_TEXT =
  `📋 *コマンド一覧*\n\n` +
  `🎵 \`/song Artist - Song [Year]\` → 曲記事を自動生成\n` +
  `📝 \`修正依頼 <曲名>\` / \`記事修正 <曲名>\` → 既存曲を三稿制で自動仕上げ: nas-is-like基調の文体・1〜2文改行・内部リンク・unit上限まで増強（例: \`修正依頼 put it on\`）\n` +
  `🏭 \`トーン一斉 [曲数] [tone] [opus]\` → 未更新曲を先頭から順次一斉修正（既定3曲・sonnet・unit増強込み。\`tone\`=文体/改行/リンクのみ）。残数確認は \`トーン一斉 状況\`\n` +
  `🛠️ 任意のテキスト → 任意のタスクを実行（例: \`put-it-onのジャケットを直して\`）\n` +
  `   ↳ 続けて送ると前回の文脈を引き継ぎます。\`/new\` で新しいスレッド\n` +
  `🎬 \`/short <slug>\` → ショート動画を生成\n` +
  `📹 YouTube URL → 動画翻訳記事をキューに追加\n` +
  `📢 \`/publishvideo\` → キュー先頭を今すぐ公開\n` +
  `🚀 \`/publish\` → review ブランチの変更を本番(main)へ反映（レビュー確認後に手動実行）\n` +
  `📊 \`/status\` → ショート生成状況を確認\n\n` +
  `記事編集は review ブランチで行われます（本番未反映）。プレビューで確認後 \`/publish\` してください。\n` +
  `例: \`/song Wu-Tang Clan - C.R.E.A.M. [1994]\``;

// チャットごとの直近セッションIDを保存し、自由指示の会話継続（--resume）に使う
const SESSIONS_FILE = '/tmp/hiphop-sessions.json';
function loadSession(chatId) {
  try { return JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8'))[String(chatId)] || null; } catch { return null; }
}
function saveSession(chatId, sessionId) {
  let m = {};
  try { m = JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8')); } catch {}
  if (sessionId) m[String(chatId)] = sessionId; else delete m[String(chatId)];
  try { writeFileSync(SESSIONS_FILE, JSON.stringify(m)); } catch {}
}

/** /short コマンドを処理 */
async function handleShortCommand(slug, chatId) {
  await sendMessage(`🎬 ショート生成開始: \`${slug}\``, chatId);
  try {
    execSync(
      `node "${join(__dirname, 'generate-short.mjs')}" --slug "${slug}" --duration 55`,
      { cwd: ROOT, stdio: 'pipe', timeout: 600_000 }
    );
    await sendMessage(`✅ ショート生成完了: ${slug}`, chatId);
  } catch (e) {
    const detail = e.stderr?.toString().slice(-300) || e.message.slice(0, 300);
    await sendMessage(`❌ ショート生成失敗: ${slug}
${detail}`, chatId, { safe: true });
  }
}

/** 自由指示（任意の依頼）を Claude に委譲して実行する */
async function handleFreeformCommand(instruction, chatId) {
  const resumeId = loadSession(chatId);
  await sendMessage(`🛠️ 依頼を処理中…${resumeId ? '（前回の続き）' : ''}（数分かかることがあります）`, chatId);
  try {
    const r = await runFreeform(instruction, resumeId);
    if (r.success) {
      if (r.sessionId) saveSession(chatId, r.sessionId);
      await sendMessage(`✅ 完了\n${r.output || ''}`.trim(), chatId);
    } else {
      await sendMessage(`❌ 失敗: ${String(r.error || '').slice(0, 300)}`, chatId, { safe: true });
    }
  } catch (e) {
    await sendMessage(`❌ エラー: ${String(e.message).slice(0, 200)}`, chatId, { safe: true });
  }
}

/** 「修正依頼 <曲名>」→ 既存曲のトーン修正を決定的パイプラインで実行 */
async function handleToneFixCommand(query, chatId) {
  await sendMessage(`📝 修正依頼を処理中: *${query}*（文体→改行→内部リンク→機械検証まで自動でやります）`, chatId);
  try {
    const r = await runToneFix(query);
    if (r.success) {
      await sendMessage(`✅ 完了\n${r.output || ''}`.trim(), chatId);
    } else {
      await sendMessage(`❌ 失敗: ${String(r.error || '').slice(0, 300)}`, chatId, { safe: true });
    }
  } catch (e) {
    await sendMessage(`❌ エラー: ${String(e.message).slice(0, 200)}`, chatId, { safe: true });
  }
}

/**
 * 「トーン一斉 [曲数] [tone] [opus]」→ 全曲トーン一斉更新キャンペーン（docs/mission-tone-campaign.md）。
 * tone-campaign.mjs を子プロセスで回す（runToneFix経由で1曲ずつ・review push・notify-reviewまで自動）。
 * 二重起動はキューが同じ曲を掴んで衝突するためフラグで拒否する。
 */
let toneCampaignRunning = false;
async function handleToneCampaignCommand(argText, chatId) {
  const parts = argText.split(/[\s　]+/).filter(Boolean);
  const script = join(__dirname, 'tone-campaign.mjs');
  if (parts.includes('状況') || parts.includes('status')) {
    try {
      const out = execSync(`node "${script}" status`, { encoding: 'utf-8', timeout: 120_000, cwd: ROOT });
      const lines = out.split('\n').filter(Boolean);
      const head = lines.find((l) => l.startsWith('全')) || '';
      const next = lines.find((l) => l.startsWith('次の1曲')) || '';
      await sendMessage(`📊 トーン一斉更新キャンペーン\n${head}\n${next}${toneCampaignRunning ? '\n（バッチ実行中）' : ''}`, chatId, { safe: true });
    } catch (e) {
      await sendMessage(`❌ status失敗: ${String(e.message).slice(0, 200)}`, chatId, { safe: true });
    }
    return;
  }
  if (toneCampaignRunning) {
    await sendMessage('⏳ トーン一斉バッチが実行中です。終了通知を待ってから再実行してください（残数: `トーン一斉 状況`）', chatId);
    return;
  }
  const count = parts.find((p) => /^\d+$/.test(p)) || '3';
  const scope = parts.includes('tone') ? 'tone' : 'full';
  const model = parts.includes('opus') ? 'opus' : 'sonnet';
  toneCampaignRunning = true;
  await sendMessage(
    `🏭 トーン一斉更新を開始: 未更新の先頭${count}曲（scope=${scope}, model=${model}）\n` +
    `1曲ずつ修正依頼ルーチンで回します（各曲、review pushとプレビューURL通知が飛びます。1曲最長45分）\n` +
    `Claude使用上限に当たった場合は中断せず、リセット時刻まで自動待機して同じ曲から再開します（⏸通知が飛びます）`,
    chatId
  );
  const child = spawn('node', [script, 'run', '--count', count, '--scope', scope, '--model', model], { cwd: ROOT });
  let buf = '';
  child.stdout.on('data', (d) => { buf += d; });
  child.stderr.on('data', (d) => { buf += d; });
  child.on('close', (code) => {
    toneCampaignRunning = false;
    const tail = buf.split('\n')
      .filter((l) => /^(✅ [^ ]+: 完了|❌ [^ ]+: 未達|❌ 2曲連続|⏸ |▶ 待機終了|全\d+曲|次の1曲)/.test(l))
      .slice(-12).join('\n');
    sendMessage(
      `${code === 0 ? '🏁 トーン一斉バッチ終了' : '❌ トーン一斉バッチ中断'} (exit ${code})\n${tail}\n続き: \`トーン一斉 ${count}\``.slice(0, 3500),
      chatId, { safe: true }
    ).catch(() => {});
  });
  child.on('error', (e) => {
    toneCampaignRunning = false;
    sendMessage(`❌ トーン一斉起動失敗: ${String(e.message).slice(0, 200)}`, chatId, { safe: true }).catch(() => {});
  });
}

/** YouTube URL → 動画記事生成 → キューに追加 */
async function handleVideoCommand(youtubeUrl, chatId) {
  await sendMessage(`📹 動画記事生成開始...\n\`${youtubeUrl}\``, chatId);
  try {
    const output = execSync(
      `node "${join(__dirname, 'generate-video-article.mjs')}" "${youtubeUrl}"`,
      { cwd: ROOT, stdio: 'pipe', timeout: 300_000, encoding: 'utf-8' }
    );
    // slug を出力から抽出
    const slugMatch = output.match(/スラッグ: (.+)/);
    const slug = slugMatch?.[1]?.trim() || '（不明）';
    await sendMessage(
      `✅ キューに追加しました\nスラッグ: \`${slug}\`\n\n公開は2日おきに自動実行されます。\n今すぐ公開: \`/publishvideo\``,
      chatId
    );
  } catch (e) {
    const detail = (e.stderr?.toString() || e.message).slice(-400);
    await sendMessage(`❌ 動画記事生成失敗\n${detail}`, chatId, { safe: true });
  }
}

/** /publish コマンド → review ブランチを main へ反映（本番push、1日1回想定） */
async function handlePublishCommand(chatId) {
  await sendMessage(`🚀 review → main へ反映中...`, chatId);
  try {
    const output = execSync(
      `node "${join(__dirname, 'publish-main.mjs')}"`,
      { cwd: ROOT, stdio: 'pipe', timeout: 300_000, encoding: 'utf-8' }
    );
    if (output.includes('NOTHING_TO_PUBLISH')) {
      await sendMessage(`ℹ️ reviewに新しい変更はありません（反映するものなし）`, chatId);
    } else {
      await sendMessage(`✅ 本番反映しました\n\n${output.trim()}`, chatId, { safe: true });
    }
  } catch (e) {
    const detail = (e.stdout?.toString() || e.stderr?.toString() || e.message).slice(-800);
    await sendMessage(`❌ 本番反映失敗\n${detail}`, chatId, { safe: true });
  }
}

/** /publishvideo コマンド → キュー先頭を即時公開 */
async function handlePublishVideoCommand(chatId) {
  await sendMessage(`📢 動画記事を公開中...`, chatId);
  try {
    const output = execSync(
      `node "${join(__dirname, 'publish-next-video.mjs')}" --force`,
      { cwd: ROOT, stdio: 'pipe', timeout: 120_000, encoding: 'utf-8' }
    );
    const urlMatch = output.match(/https:\/\/waxthink\.com\/videos\/\S+/);
    const url = urlMatch?.[0] || '';
    await sendMessage(`✅ 公開完了${url ? `\n${url}` : ''}`, chatId);
  } catch (e) {
    const detail = (e.stderr?.toString() || e.message).slice(-400);
    await sendMessage(`❌ 公開失敗\n${detail}`, chatId, { safe: true });
  }
}

/** /status コマンドを処理 */
async function handleStatusCommand(chatId) {
  const { readdirSync } = await import('node:fs');
  const shortsDir = join(ROOT, 'public/shorts');
  const songsDir = join(ROOT, 'src/pages/songs');
  const shorts = readdirSync(shortsDir).filter(f => f.endsWith('.mp4')).length;
  const total = readdirSync(songsDir).filter(f => f.endsWith('.astro')).length;
  await sendMessage(`📊 ショート動画: ${shorts}/${total} 曲生成済み`, chatId);
}

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
 * 認可された Chat ID（自分のみ）。環境変数 TELEGRAM_CHAT_ID から読む（ハードコード禁止）。
 * カンマ区切りで複数指定可。未設定なら全拒否（安全側）。
 */
const AUTHORIZED_CHAT_IDS = (process.env.TELEGRAM_CHAT_ID || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** 送信元 chat_id が認可済みか判定 */
function isAuthorized(chatId) {
  return AUTHORIZED_CHAT_IDS.includes(String(chatId));
}

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

  // Step 0: 既存曲（従来型）判定。learning変換対象なら Gemini をスキップする。
  const slug = deriveSlug(song.title);
  const existing = inspectExistingSong(slug, ROOT);
  const isConversion = existing.registered && existing.astroSrc && !existing.isLearning;

  let research = '';
  let conversionSlug = null;
  if (isConversion) {
    // 既存従来型 → learning変換: Gemini を経由せず songs.ts＋既存.astroから組み立てる
    console.log(`[Step 1/4] 既存従来型→learning変換モード（Geminiスキップ）: /songs/${slug}`);
    const built = buildConversionData(slug, existing);
    research = built.research;
    conversionSlug = slug;
    song.artist = built.meta.artist || song.artist;
    song.title = built.meta.title || song.title;
    song.year = built.meta.year ?? song.year;
  } else {
    // 1. リサーチは Gemini を使わない方針。watcher内のClaudeが WebSearch tool で
    //    一次ソース（WhoSampled/Wikipedia/Discogs/Genius）から事実を自前で裏取りする。
    //    ここでは素材を渡さず（research空）、メタデータはユーザー入力の /song をそのまま使う。
    console.log('[Step 1/4] リサーチはClaude側WebSearchに委譲（Gemini不使用）');
    research = '';
  }

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
    ...(conversionSlug ? { slug: conversionSlug } : {}),
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
    // 本番URL（Cloudflare Pages = waxthink.com）を通知
    const url = result.slug ? `https://waxthink.com/songs/${result.slug}` : '';
    await sendMessage(
      `✅ 完了: ${label}\n記事が生成・デプロイされました。${url ? `\n${url}` : ''}`,
      chatId
    );
    console.log(`✅ 完了: ${label}${url ? ` — ${url}` : ''}`);
  } else if (String(result.error).startsWith('already-learning:')) {
    // すでにlearning型変換済み → スキップ通知（エラーではない）
    const url = result.slug ? `https://waxthink.com/songs/${result.slug}` : '';
    await sendMessage(`ℹ️ スキップ: ${label}\nすでにlearning型です。${url ? `\n${url}` : ''}`, chatId);
    console.log(`ℹ️ スキップ（変換済み）: ${label}`);
  } else {
    // Markdown パースエラーを避けるためプレーンテキストで送信
    const errorMsg = String(result.error || '不明なエラー').slice(0, 500);
    await sendMessage(`❌ Claude Code エラー: ${label}\n\n${errorMsg}`, chatId, { safe: true });
    console.log(`❌ エラー: ${label} — ${result.error}`);
  }
}

/** メインポーリングループ */
async function main() {
  // 環境変数チェック
  const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
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

        // chat_id 認証：認可されていない送信元は無視（誰でも起動できないようにする）
        if (!isAuthorized(chatId)) {
          console.warn(`  [Auth] 未認可の chat_id からのメッセージを無視`);
          continue;
        }

        // /short <slug> コマンド
        if (text.startsWith('/short ')) {
          const slug = text.slice(7).trim();
          handleShortCommand(slug, chatId).catch(() => {});
          continue;
        }

        // /status コマンド
        if (text.trim() === '/status') {
          handleStatusCommand(chatId).catch(() => {});
          continue;
        }

        // /publish コマンド → review を main へ本番反映
        if (text.trim() === '/publish') {
          handlePublishCommand(chatId).catch(() => {});
          continue;
        }

        // /publishvideo コマンド
        if (text.trim() === '/publishvideo') {
          handlePublishVideoCommand(chatId).catch(() => {});
          continue;
        }

        // /menu, /help → コマンド一覧
        if (text.trim() === '/menu' || text.trim() === '/help') {
          sendMessage(MENU_TEXT, chatId).catch(() => {});
          continue;
        }

        // /new, /reset → 自由指示の会話文脈をリセット（新しいスレッド）
        if (text.trim() === '/new' || text.trim() === '/reset') {
          saveSession(chatId, null);
          sendMessage('🆕 新しいスレッドを開始しました（前回までの文脈をリセット）', chatId).catch(() => {});
          continue;
        }

        // /song <Artist - Song [Year]> → 曲記事生成
        if (text.startsWith('/song ') || text.startsWith('/article ')) {
          const songText = text.replace(/^\/(song|article)\s+/, '').trim();
          const songs = songText ? parseMessage(songText) : null;
          if (songs) {
            for (const song of songs) {
              processSong(song, chatId).catch((error) => {
                console.error(`処理エラー: ${error.message}`);
                sendMessage(`❌ 処理エラー: ${String(error.message).slice(0, 200)}`, chatId, { safe: true }).catch(() => {});
              });
            }
          } else {
            sendMessage(`❌ 形式エラー: \`/song Artist - Song [Year]\` の形式で入力してください`, chatId).catch(() => {});
          }
          continue;
        }

        // 修正依頼/記事修正 <曲名> → 既存曲の文体・改行・内部リンク修正（決定的パイプライン）
        if (/^(修正依頼|記事修正)/.test(text.trim())) {
          const query = text.trim().replace(/^(修正依頼|記事修正)[\s　]*/, '').trim();
          if (query) {
            handleToneFixCommand(query, chatId).catch((error) => {
              console.error(`修正依頼処理エラー: ${error.message}`);
              sendMessage(`❌ 修正依頼エラー: ${String(error.message).slice(0, 200)}`, chatId, { safe: true }).catch(() => {});
            });
          } else {
            sendMessage('❌ 曲名を指定してください（例: `修正依頼 put it on`）', chatId).catch(() => {});
          }
          continue;
        }

        // トーン一斉 [曲数] [tone] [opus] / トーン一斉 状況 → 全曲トーン一斉更新キャンペーン
        if (/^(トーン一斉|\/tonecampaign)/.test(text.trim())) {
          const argText = text.trim().replace(/^(トーン一斉|\/tonecampaign)[\s　]*/, '');
          handleToneCampaignCommand(argText, chatId).catch((error) => {
            console.error(`トーン一斉エラー: ${error.message}`);
            sendMessage(`❌ トーン一斉エラー: ${String(error.message).slice(0, 200)}`, chatId, { safe: true }).catch(() => {});
          });
          continue;
        }

        // /do <依頼> または /task <依頼> → 自由指示（後方互換）
        if (text.startsWith('/do ') || text.startsWith('/task ')) {
          const instruction = text.replace(/^\/(do|task)\s+/, '').trim();
          if (instruction) handleFreeformCommand(instruction, chatId).catch(() => {});
          continue;
        }

        // YouTube URL → 動画記事生成
        const youtubeMatch = text.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/);
        if (youtubeMatch) {
          handleVideoCommand(youtubeMatch[0], chatId).catch(() => {});
          continue;
        }

        // それ以外（素のテキスト）→ 自由指示タスクとして Claude に委譲
        handleFreeformCommand(text, chatId).catch(() => {});
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
