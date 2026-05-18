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
import { execSync, spawnSync } from 'node:child_process';

const HIPHOP_CWD = '/Users/ktamatzmoto/Desktop/hiphop';
const WATCHER_SCRIPT = '/Users/ktamatzmoto/Desktop/hiphop/agent/src/watcher.mjs';
const TIMEOUT_MS = 15 * 60 * 1000; // 15分

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
  console.log('  [Claude] watcherが停止中 → Terminal起動中...');
  const appleScript = `tell application "Terminal"
    do script "node ${WATCHER_SCRIPT}"
    activate
  end tell`;
  spawnSync('osascript', ['-e', appleScript]);
  await sleep(4000); // watcher起動待ち
  console.log('  [Claude] watcher起動完了');
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
  let songMeta = '';
  try {
    const d = JSON.parse(await readFile(jsonPath, 'utf-8'));
    songMeta = `曲: ${d.artist} - ${d.title} (${d.year || '年不明'})
slug: ${d.slug || d.title.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '')}
Amazon: ${d.amazonLink || ''}
ジャケット画像: ${d.imagePath || ''}
GeniusURL: ${d.geniusUrl || ''}`;
  } catch (e) {}

  const prompt = `以下の楽曲データをもとに、CLAUDE.mdの「記事作成フロー」と「歌詞翻訳ルール」に従って記事を完全に作成してください。承認を求めずに全自動で完遂すること。

## 楽曲情報
${songMeta}

## データファイル
${jsonPath}
（このファイルに歌詞・リサーチ結果・Amazon URLなどが入っています。Read toolで読み込んでください）

## 実行手順
1. 上記JSONファイルを読み込む
2. src/pages/songs/{slug}.astro を作成
   - SongLayout使用
   - LyricsBlockで歌詞を1〜2行単位で分割（バース全体を1ブロックにしない）
   - 各ブロックにeng/jpn/explanationを付ける
   - QuickSlangで重要スラングに注釈
   - 文化背景・レガシーセクションを追加
   - Amazonアフィリエイトリンクを含める
   - 【最重要】元の歌詞ファイルの内容を1行たりとも省略せず、すべて元の順番通りに配置すること（コーラスの繰り返し行等も一切省略してはいけない）
3. src/data/songs.ts にエントリ追記（era/region/producer/bpmなどリサーチ結果から正確に埋める）
4. src/data/artists.ts を確認し、artistSlugが未登録なら追加
5. 最後に \`node agent/src/check-lyrics-coverage.mjs \${d.slug || d.title.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '')}\` を実行し、100%になるまで自律的に不足行や順序のミスを修正すること。
6. すべて完了したら、自分が今回新規作成・変更したファイル（src/pages/songs/{slug}.astro と songs.ts, artists.ts 等）のみを git add し、git commit → git push すること。絶対に作業ディレクトリ全体の "git add ." を行わないでください（ユーザーの手作業と競合するため）。`;

  await writeFile(promptFile, prompt, 'utf-8');

  // watcherが動いていなければTerminalで自動起動
  await ensureWatcher();

  // triggerファイルにpromptFileパスを書く（watcherが読む）
  await writeFile(triggerFile, promptFile, 'utf-8');

  console.log(`  [Claude] watcher待機中... (trigger: ${triggerFile})`);

  // doneファイルが現れるまでポーリング
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    await sleep(5000);
    try {
      await access(doneFile);
      const exitCode = (await readFile(doneFile, 'utf-8')).trim();
      console.log(`  [Claude] watcher完了 (exit: ${exitCode})`);
      return {
        success: exitCode === '0',
        output: '',
        error: exitCode === '0' ? null : `watcher exit code ${exitCode}`,
      };
    } catch {
      // まだ存在しない
    }
  }

  return { success: false, output: '', error: 'タイムアウト（15分）- watcherが起動していますか？' };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
