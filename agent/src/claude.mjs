/**
 * Claude Code CLI 実行モジュール
 *
 * 生成したJSONをもとに claude --print で記事を作成する。
 * --cwd で hiphop プロジェクトディレクトリを指定。
 */

import { spawn } from 'node:child_process';
import { readFile, rename } from 'node:fs/promises';

/** hiphop プロジェクトのルートパス */
const HIPHOP_CWD = '/Users/ktamatzmoto/Desktop/hiphop';

/** Claude CLI のパス */
const CLAUDE_BIN = '/Users/ktamatzmoto/.local/bin/claude';

/** タイムアウト: 10分 */
const TIMEOUT_MS = 10 * 60 * 1000;

/**
 * JSON ファイルを読み込んで Claude Code CLI で記事を生成する
 * @param {string} jsonPath - 保存済み JSON ファイルのパス
 * @returns {Promise<{ success: boolean, output: string, error: string|null }>}
 */
export async function runClaude(jsonPath) {
  let restored = false;
  try {
    // Antigravityのフリーズ防止のためにリネームしていたCLAUDE.mdを一時的に戻す
    try {
      await rename(`${HIPHOP_CWD}/CLAUDE.md.bak`, `${HIPHOP_CWD}/CLAUDE.md`);
      restored = true;
    } catch (e) {
      // 既に存在するか、.bakがない場合は無視
    }

    // JSON を読んでプロンプトにデータを埋め込む
    let songMeta = '';
    try {
      const raw = await readFile(jsonPath, 'utf-8');
      const d = JSON.parse(raw);
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
3. src/data/songs.ts にエントリ追記（era/region/producer/bpmなどリサーチ結果から正確に埋める）
4. src/data/artists.ts を確認し、artistSlugが未登録なら追加
5. git add → git commit → git push`;

    console.log('  [Claude] CLI 実行中...');

    const result = await new Promise((resolve) => {
      const child = spawn(
        CLAUDE_BIN,
        ['--print', '--permission-mode', 'acceptEdits', '--dangerously-skip-permissions'],
        {
          cwd: HIPHOP_CWD,
          env: { ...process.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      // プロンプトをstdinで渡す
      child.stdin.write(prompt, 'utf-8');
      child.stdin.end();

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => {
        const line = d.toString().trim();
        if (line) console.log(`  [Claude stderr] ${line}`);
        stderr += line;
      });

      const timer = setTimeout(() => {
        child.kill();
        resolve({ success: false, output: stdout, error: 'タイムアウト（10分）' });
      }, TIMEOUT_MS);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          console.log(`  [Claude] 完了 (出力: ${stdout.length}文字)`);
          resolve({ success: true, output: stdout, error: null });
        } else {
          console.error(`  [Claude] 終了コード: ${code}`);
          resolve({ success: false, output: stdout, error: stderr || `exit code ${code}` });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ success: false, output: '', error: err.message });
      });
    });

    return result;
  } catch (error) {
    return {
      success: false,
      output: '',
      error: `実行失敗: ${error.message}`,
    };
  } finally {
    // 終わったら再びリネームしてAntigravityのフリーズを防ぐ
    if (restored) {
      try {
        await rename(`${HIPHOP_CWD}/CLAUDE.md`, `${HIPHOP_CWD}/CLAUDE.md.bak`);
      } catch (e) {
        // 無視
      }
    }
  }
}
