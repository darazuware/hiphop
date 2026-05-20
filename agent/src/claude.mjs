/**
 * Claude Code CLI 連携モジュール
 *
 * LaunchAgentからはClaude CLIのOAuth認証に届かないため、
 * trigger/doneファイル方式でTerminalのwatcherに処理を委譲する。
 *
 * フロー:
 *   claude.mjs → /tmp/hiphop-trigger-{ts}.txt 書く
 *   watcher.mjs(Terminal) → 検知 → claude CLI実行 → /tmp/hiphop-done-{ts}.txt 書く
 *   claude.mjs → done読んで結果返す
 */

import { readFile, writeFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { execSync, spawn } from 'node:child_process';

const HIPHOP_CWD = '/Users/ktamatzmoto/Desktop/hiphop';
const WATCHER_SCRIPT = '/Users/ktamatzmoto/Desktop/hiphop/agent/src/watcher.mjs';
const TIMEOUT_MS = 45 * 60 * 1000; // 45分（3曲並列でもwatcher処理が終わるまで待てる）

function isWatcherRunning() {
  try {
    const result = execSync('pgrep -f "watcher.mjs"', { encoding: 'utf-8' });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

async function ensureWatcher() {
  if (isWatcherRunning()) return;
  console.log('  [Claude] watcherが停止中 → 直接起動中...');
  const child = spawn('node', [WATCHER_SCRIPT], {
    cwd: HIPHOP_CWD,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  // 起動確認（最大10秒ポーリング）
  for (let i = 0; i < 10; i++) {
    await sleep(1000);
    if (isWatcherRunning()) {
      console.log('  [Claude] watcher起動完了');
      return;
    }
  }
  console.warn('  [Claude] watcher起動確認できず（続行）');
}

/**
 * @param {string} jsonPath
 * @returns {Promise<{ success: boolean, output: string, error: string|null }>}
 */
export async function runClaude(jsonPath) {
  const ts = Date.now();
  const promptFile = `/tmp/hiphop-prompt-${ts}.txt`;
  const triggerFile = `/tmp/hiphop-trigger-${ts}.txt`;
  const doneFile = `/tmp/hiphop-done-${ts}.txt`;

  // JSON を読んでプロンプト生成
  let slug = '';
  let songMeta = '';
  try {
    const d = JSON.parse(await readFile(jsonPath, 'utf-8'));
    slug = d.slug || d.title.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');
    songMeta = `曲: ${d.artist} - ${d.title} (${d.year || '年不明'})
slug（必ずこの値を使うこと）: ${slug}
ASIN（songs.tsに設定すること）: ${d.asin || 'null'}
ジャケット画像: ${d.imagePath || ''}
GeniusURL: ${d.geniusUrl || ''}`;
  } catch (e) {}

  const prompt = `以下の楽曲データをもとに、CLAUDE.mdの「記事作成フロー」と「歌詞翻訳ルール」に従って記事を作成してください。承認を求めずに全自動で完遂すること。

## 楽曲情報
${songMeta}

## データファイル
${jsonPath}
（このファイルにGemini Deep Researchのリサーチ結果・Genius歌詞・メタデータが入っています。最初にRead toolで必ず読み込んでください）

## 実行手順
1. 上記JSONファイルを読み込む（research・lyricsフィールドを記事作成の根拠とする）
2. ファイル名は必ず src/pages/songs/${slug}.astro（上記slugをそのまま使うこと・変更禁止）
   - SongLayout使用
   - LyricsBlockで歌詞を1〜2行単位で分割（バース全体を1ブロックにしない）
   - 各ブロックにeng/jpn/explanationを付ける（researchの内容を解説に反映すること）
   - QuickSlangで重要スラングに注釈
   - 文化背景・レガシーセクションを追加（researchの調査項目5・6を活用）
   - 【最重要】元の歌詞を1行たりとも省略せず、すべて元の順番通りに配置すること
3. src/data/songs.ts にエントリ追記
   - slug: '/songs/${slug}' （固定・変更禁止）
   - asin: 上記ASINの値をそのまま設定（nullの場合はnull）
   - era/region/producer/bpmはresearchから正確に埋める
4. src/data/artists.ts を確認し、artistSlugが未登録なら追加

※ git操作・ビルド・歌詞チェックはシステムが自動実行するため不要`;

  await writeFile(promptFile, prompt, 'utf-8');

  // watcherが動いていなければTerminalで自動起動
  await ensureWatcher();

  // triggerファイルにJSON形式でメタ情報を渡す
  await writeFile(triggerFile, JSON.stringify({ promptFile, slug, jsonPath }), 'utf-8');

  console.log(`  [Claude] watcher待機中... (slug: ${slug})`);

  // doneファイルが現れるまでポーリング
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    await sleep(5000);
    try {
      await access(doneFile);
      const raw = (await readFile(doneFile, 'utf-8')).trim();
      let result;
      try { result = JSON.parse(raw); } catch { result = { exitCode: parseInt(raw) || 1, error: null }; }
      console.log(`  [Claude] watcher完了 (exit: ${result.exitCode})`);
      return {
        success: result.exitCode === 0,
        output: '',
        error: result.error || (result.exitCode === 0 ? null : `exit ${result.exitCode}`),
      };
    } catch {
      // まだ存在しない
    }
  }

  return { success: false, output: '', error: 'タイムアウト（45分）' };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
