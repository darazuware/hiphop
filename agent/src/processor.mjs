import Anthropic from '@anthropic-ai/sdk';
import { writeFile, readFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const execAsync = promisify(exec);
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
    const { artist, title, year, lyrics, imageUrl, geniusUrl } = data;

    let researchText = data.research || '';
    try {
      const parsed = JSON.parse(researchText);
      if (parsed?.outputs?.[0]?.text) researchText = parsed.outputs[0].text;
    } catch {}

    const slug = (data.slug || title.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, ''));
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

    // 既存データを読み込む（コンテキスト用）
    const [songsTs, artistsTs, claudeMd] = await Promise.all([
      readFile(join(HIPHOP_CWD, 'src/data/songs.ts'), 'utf-8'),
      readFile(join(HIPHOP_CWD, 'src/data/artists.ts'), 'utf-8'),
      readFile(join(HIPHOP_CWD, 'CLAUDE.md'), 'utf-8'),
    ]);

    const artistSlug = artist.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');
    const artistExists = artistsTs.includes(`slug: '${artistSlug}'`);
    const songExists = songsTs.includes(`/songs/${slug}'`);

    console.log('  [Processor] Anthropic API で記事生成中...');

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `あなたはヒップホップ専門のライター兼フロントエンドエンジニアです。
以下のプロジェクト設定を厳守してください：

${claudeMd}

## songs.tsの型定義（必ず全フィールドを埋めること）
\`\`\`
{ slug: '/songs/{slug}', title: string, subtitle: '{producer} Produced · {year}', artists: string, tag: string, era: '90s前半'|'90s後半'|'00s以降', region: 'NY'|'Philly'|'LA'|'Boston'|'Stockholm'|string, producer: string, bpm: number, sample: string|null, album: string, mbid: string|null, artistSlug: string, asin: string|null, pubDate: string }
\`\`\`

## artists.tsの型定義
\`\`\`
{ slug: string, name: string, origin: string, active: string, genre: string, summary: string, japan: string }
\`\`\`

## LyricsBlockコンポーネントの使い方
\`\`\`astro
<LyricsBlock>
  <Fragment slot="eng">英語歌詞（1〜2行）</Fragment>
  <Fragment slot="jpn">日本語訳</Fragment>
  <Fragment slot="explanation">解説（QuickSlang含む）</Fragment>
</LyricsBlock>
\`\`\`
QuickSlang: <QuickSlang word="スラング" desc="意味説明" />`;

    const userPrompt = `以下のデータで記事を生成してください。

## 楽曲情報
- アーティスト: ${artist}
- 曲名: ${title}
- 年: ${year || '不明'}
- slug: ${slug}
- Amazon: ${amazonLink}
- GeniusURL: ${geniusUrl || ''}
- ジャケット: /images/covers/${slug}.jpg

## 歌詞
${lyrics || '歌詞データなし'}

## リサーチ結果
${researchText}

---
以下の形式で出力してください（マーカーは必ず含めること）：

<ASTRO_FILE>
（src/pages/songs/${slug}.astroの完全な内容。SongLayout使用、LyricsBlockで1〜2行単位分割、eng/jpn/explanation必須、文化背景セクション必須、Amazonリンク必須）
</ASTRO_FILE>

<SONGS_ENTRY>
（songs.tsに追記するオブジェクト1行。全フィールド必須。リサーチから正確に抽出すること）
</SONGS_ENTRY>

${!artistExists ? `<ARTIST_ENTRY>
（artists.tsに追記するオブジェクト。slug: '${artistSlug}'、全フィールド必須）
</ARTIST_ENTRY>` : '<!-- ARTIST_EXISTS -->'}`;

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const response = msg.content[0].text;

    // 各セクションを抽出
    const astroMatch = response.match(/<ASTRO_FILE>([\s\S]*?)<\/ASTRO_FILE>/);
    const songsMatch = response.match(/<SONGS_ENTRY>([\s\S]*?)<\/SONGS_ENTRY>/);
    const artistMatch = response.match(/<ARTIST_ENTRY>([\s\S]*?)<\/ARTIST_ENTRY>/);

    if (!astroMatch) throw new Error('ASTRO_FILEセクションが見つかりません');
    if (!songsMatch) throw new Error('SONGS_ENTRYセクションが見つかりません');

    const astroContent = astroMatch[1].trim();
    const songsEntry = songsMatch[1].trim();

    // .astroファイル書き込み
    if (!songExists) {
      await writeFile(join(HIPHOP_CWD, 'src/pages/songs', `${slug}.astro`), astroContent, 'utf-8');
      console.log(`  [Processor] 書き込み: src/pages/songs/${slug}.astro`);
    } else {
      console.log(`  [Processor] スキップ（既存）: src/pages/songs/${slug}.astro`);
    }

    // songs.ts に追記
    if (!songExists) {
      const updatedSongs = songsTs.replace('] as const;', `  ${songsEntry}\n] as const;`);
      await writeFile(join(HIPHOP_CWD, 'src/data/songs.ts'), updatedSongs, 'utf-8');
      console.log('  [Processor] songs.ts 更新');
    }

    // artists.ts に追記
    if (!artistExists && artistMatch) {
      const artistEntry = artistMatch[1].trim();
      const updatedArtists = artistsTs.replace('] as const;', `  ${artistEntry},\n] as const;`);
      await writeFile(join(HIPHOP_CWD, 'src/data/artists.ts'), updatedArtists, 'utf-8');
      console.log('  [Processor] artists.ts 更新');
    }

    // git push
    console.log('  [Processor] git push...');
    await execAsync('git add -A', { cwd: HIPHOP_CWD });
    await execAsync(`git commit -m "Auto-add song: ${artist} - ${title}"`, { cwd: HIPHOP_CWD });
    await execAsync('git push origin main', { cwd: HIPHOP_CWD });

    console.log('  [Processor] デプロイ完了');
    return { success: true, error: null };
  } catch (error) {
    console.error(`  [Processor] エラー: ${error.message}`);
    return { success: false, error: error.message };
  }
}
