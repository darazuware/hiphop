/**
 * 記事生成・デプロイモジュール
 *
 * JSONデータをもとに実際にファイルを生成し、Git Pushを行う。
 */

import { writeFile, readFile } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { GoogleGenAI } from '@google/genai';

const execAsync = promisify(exec);
const HIPHOP_CWD = '/Users/ktamatzmoto/Desktop/hiphop';

const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

/**
 * .astro ファイルの内容を生成する
 * @param {any} data
 * @returns {Promise<string>}
 */
async function generateAstroContent(data) {
  const prompt = `以下のリサーチ結果と歌詞をもとに、Astroプロジェクト用の記事ソースコード（.astro）を作成してください。

データ:
${JSON.stringify(data, null, 2)}

ルール:
1. 既存のプロジェクトのデザインに合わせる。
2. 歌詞は1ブロック1〜2行単位で、eng (原文), jpn (和訳), explanation (解説) の形式にする。
3. 出力は .astro ファイルの中身（コードのみ）にすること。`;

  const result = await client.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
  });

  return result.text.replace(/```astro/g, '').replace(/```/g, '').trim();
}

/**
 * 実際にファイルを生成し、Git Pushする
 * @param {string} jsonPath
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function processAndDeploy(jsonPath) {
  try {
    const rawData = await readFile(jsonPath, 'utf-8');
    const data = JSON.parse(rawData);

    // 1. Astroコンテンツ生成
    console.log('  [Processor] Astroファイル生成中...');
    const astroContent = await generateAstroContent(data);
    const slug = data.title.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');
    const astroPath = join(HIPHOP_CWD, 'src/pages/songs', `${slug}.astro`);

    await writeFile(astroPath, astroContent, 'utf-8');
    console.log(`  [Processor] 保存完了: ${astroPath}`);

    // 2. Git操作
    console.log('  [Processor] Git Push中...');
    const commands = [
      `git add src/pages/songs/${slug}.astro`,
      `git commit -m "Add song: ${data.artist} - ${data.title}"`,
      `git push origin main`
    ];

    for (const cmd of commands) {
      await execAsync(cmd, { cwd: HIPHOP_CWD });
    }

    console.log('  [Processor] デプロイ完了');
    return { success: true, error: null };
  } catch (error) {
    console.error(`  [Processor] エラー: ${error.message}`);
    return { success: false, error: error.message };
  }
}
