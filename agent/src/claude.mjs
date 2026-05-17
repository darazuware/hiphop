/**
 * Claude Code CLI 実行モジュール
 *
 * 生成したJSONをもとに claude --print で記事を作成する。
 * --cwd で hiphop プロジェクトディレクトリを指定。
 */

import { execFile } from 'node:child_process';
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

    const prompt = `重要：承認を求めずに、全自動で以下のタスクを完遂させてください。
${jsonPath} を読み込んで、その内容をもとに記事を完遂させてください。
1. src/pages/songs/ に [slug].astro を新規作成する。
2. src/data/songs.ts と src/data/artists.ts にデータを追記する。
3. 歌詞翻訳ルール（1ブロック1〜2行単位、eng/jpn/explanationを付ける）を厳守する。
4. 最後に必ず git add, git commit, git push を実行してデプロイを完了させてください。`;

    console.log('  [Claude] CLI 実行中...');

    const result = await new Promise((resolve) => {
      // Pass the prompt via stdin instead of as an argv to avoid "no stdin data" issues
      const child = execFile(
        CLAUDE_BIN,
        [
          '--print',
          '--permission-mode', 'acceptEdits',
          '--dangerously-skip-permissions',
        ],
        {
          cwd: HIPHOP_CWD,
          timeout: TIMEOUT_MS,
          maxBuffer: 10 * 1024 * 1024, // 10MB
          env: { ...process.env },
        },
        (error, stdout, stderr) => {
          if (error) {
            console.error(`  [Claude] エラー: ${error.message}`);
            resolve({
              success: false,
              output: stdout || '',
              error: error.message,
            });
            return;
          }

          console.log(`  [Claude] 完了 (出力: ${stdout.length}文字)`);
          resolve({
            success: true,
            output: stdout,
            error: null,
          });
        }
      );

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          const line = data.toString().trim();
          if (line) console.log(`  [Claude stderr] ${line}`);
        });
      }

      // Write prompt to stdin and close
      try {
        if (child.stdin) {
          child.stdin.write(prompt);
          child.stdin.end();
        }
      } catch (e) {
        console.warn(`  [Claude] stdin write failed: ${e.message}`);
      }
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
