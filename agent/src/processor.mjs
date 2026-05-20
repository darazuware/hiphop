import { writeFile, readFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runClaude } from './claude.mjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const HIPHOP_CWD = '/Users/ktamatzmoto/Desktop/hiphop';

async function downloadImage(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  writeFileSync(filePath, Buffer.from(buffer));
}

/**
 * @param {string} jsonPath
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function processAndDeploy(jsonPath) {
  try {
    const rawData = await readFile(jsonPath, 'utf-8');
    const data = JSON.parse(rawData);
    const { title, imageUrl } = data;

    const slug = data.slug || title.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');

    // ジャケット画像ダウンロード（Genius imageUrl）
    if (imageUrl) {
      try {
        const coversDir = join(HIPHOP_CWD, 'public/images/covers');
        await mkdir(coversDir, { recursive: true });
        await downloadImage(imageUrl, join(coversDir, `${slug}.jpg`));
        console.log(`  [Processor] ジャケット保存: public/images/covers/${slug}.jpg`);
      } catch (err) {
        console.warn(`  [Processor] ジャケット保存失敗（続行）: ${err.message}`);
      }
    }

    // slugとimagePathをJSONに追記してClaudeに渡す
    const enriched = { ...data, slug, imagePath: `/images/covers/${slug}.jpg` };
    await writeFile(jsonPath, JSON.stringify(enriched, null, 2), 'utf-8');

    // 歌詞ファイルを作成（check-lyrics-coverage.mjs が参照）
    if (enriched.lyrics) {
      await writeFile(`/tmp/lyrics-${slug}.txt`, enriched.lyrics, 'utf-8');
    }

    console.log('  [Processor] Claude CLI実行中...');
    return await runClaude(jsonPath);
  } catch (error) {
    console.error(`  [Processor] エラー: ${error.message}`);
    return { success: false, error: error.message };
  }
}
