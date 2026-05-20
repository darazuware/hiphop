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

// Deezerでアルバムカバー画像URLを取得（高解像度）
async function fetchDeezerCover(artist, title) {
  try {
    const q = encodeURIComponent(`${artist} ${title}`);
    const r = await fetch(`https://api.deezer.com/search/track?q=${q}&limit=5`);
    const d = await r.json();
    const track = d.data?.find(t =>
      t.artist?.name?.toLowerCase().includes(artist.split(' ')[0].toLowerCase())
    ) || d.data?.[0];
    return track?.album?.cover_xl || track?.album?.cover_big || null;
  } catch {
    return null;
  }
}

// Amazon.co.jpでASINを取得（スクレイピング）
async function fetchAmazonAsin(artist, album) {
  try {
    const q = encodeURIComponent(`${artist} ${album || ''} CD`);
    const r = await fetch(`https://www.amazon.co.jp/s?k=${q}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
    const text = await r.text();
    const m = text.match(/href="\/[^"]*\/dp\/(B[A-Z0-9]{9})\//);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

// リサーチテキストからアルバム名を抽出
function extractAlbum(research) {
  const m = research?.match(/収録アルバム[：:「『]?\s*「?『?([^\n、。」』\[\]【】（）()]{2,60})/);
  return m?.[1]?.trim().replace(/[「」『』【】]/g, '') || null;
}

/**
 * @param {string} jsonPath
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function processAndDeploy(jsonPath) {
  try {
    const rawData = await readFile(jsonPath, 'utf-8');
    const data = JSON.parse(rawData);
    const { artist, title, imageUrl, research } = data;

    const slug = data.slug || title.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');
    const coversDir = join(HIPHOP_CWD, 'public/images/covers');
    await mkdir(coversDir, { recursive: true });
    const coverPath = join(coversDir, `${slug}.jpg`);

    // 1. Deezerでカバー画像取得（高解像度）→ 失敗したらGeniusにフォールバック
    console.log('  [Processor] Deezerカバー画像取得中...');
    const deezerUrl = await fetchDeezerCover(artist, title);
    const coverUrl = deezerUrl || imageUrl;
    if (coverUrl) {
      try {
        await downloadImage(coverUrl, coverPath);
        console.log(`  [Processor] ジャケット保存: ${deezerUrl ? 'Deezer' : 'Genius'} → public/images/covers/${slug}.jpg`);
      } catch (err) {
        console.warn(`  [Processor] ジャケット保存失敗（続行）: ${err.message}`);
      }
    }

    // 2. Amazon ASINをルックアップ
    const album = extractAlbum(research);
    console.log(`  [Processor] ASIN検索中... (album: ${album || title})`);
    const asin = await fetchAmazonAsin(artist, album || title);
    if (asin) {
      console.log(`  [Processor] ASIN取得: ${asin}`);
    } else {
      console.warn('  [Processor] ASIN取得失敗（songs.tsにnullで入る）');
    }

    // 3. メタ情報をJSONに追記してClaudeに渡す
    const enriched = { ...data, slug, imagePath: `/images/covers/${slug}.jpg`, asin: asin || null };
    await writeFile(jsonPath, JSON.stringify(enriched, null, 2), 'utf-8');

    // 4. 歌詞ファイルを作成（check-lyrics-coverage.mjs が参照）
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
