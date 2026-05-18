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
const AMAZON_ASSOCIATE_ID = process.env.AMAZON_ASSOCIATE_ID || 'waxthink-22';

async function downloadImage(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  writeFileSync(filePath, Buffer.from(buffer));
}

function buildAmazonLink(artist, title) {
  const query = encodeURIComponent(`${artist} ${title}`);
  return `https://www.amazon.com/s?k=${query}&tag=${AMAZON_ASSOCIATE_ID}`;
}

/**
 * @param {string} jsonPath
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function processAndDeploy(jsonPath) {
  try {
    const rawData = await readFile(jsonPath, 'utf-8');
    const data = JSON.parse(rawData);
    const { artist, title, imageUrl } = data;

    const slug = data.slug || title.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');
    const amazonLink = buildAmazonLink(artist, title);

    // ジャケット画像ダウンロード
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

    // JSONにメタ情報を追記してからclaudeに渡す
    const enriched = { ...data, amazonLink, slug, imagePath: `/images/covers/${slug}.jpg` };
    await writeFile(jsonPath, JSON.stringify(enriched, null, 2), 'utf-8');

    console.log('  [Processor] watcher経由でClaude CLI実行中...');
    const result = await runClaude(jsonPath);

    if (!result.success) {
      console.error(`  [Processor] Claude失敗 (${result.error})。Gemini API フォールバックに移行します...`);
      const { runGeminiFallback } = await import('./gemini-writer.mjs');
      const fallbackResult = await runGeminiFallback(jsonPath);
      if (!fallbackResult.success) {
        console.error(`  [Processor] Geminiフォールバックも失敗しました: ${fallbackResult.error}`);
      }
      return fallbackResult;
    }
    
    return result;
  } catch (error) {
    console.error(`  [Processor] エラー: ${error.message}`);
    return { success: false, error: error.message };
  }
}
