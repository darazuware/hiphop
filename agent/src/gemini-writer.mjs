import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const HIPHOP_CWD = '/Users/ktamatzmoto/Desktop/hiphop';

const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

/**
 * Claude CLIの上限到達時などに作動する Gemini 2.5 API によるフォールバック生成
 */
export async function runGeminiFallback(jsonPath) {
  try {
    const data = JSON.parse(await readFile(jsonPath, 'utf-8'));
    const slug = data.slug || data.title.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');
    const lyricsPath = `/tmp/lyrics-${slug}.txt`;
    
    let originalLyrics = '';
    try {
      originalLyrics = await readFile(lyricsPath, 'utf-8');
    } catch (err) {
      return { success: false, error: `歌詞ファイルが見つかりません: ${lyricsPath}` };
    }

    const prompt = `あなたはヒップホップブログのライターAIです。
以下の「楽曲データ」と「原詞データ」をもとに、厳密なルールに従って記事を作成してください。

## 楽曲データ (JSONメタデータ)
${JSON.stringify(data, null, 2)}

## 楽曲の原詞 (Genius)
${originalLyrics}

## 作成ルール
1. src/pages/songs/{slug}.astro の中身を "astroContent" として生成する。
   - Layoutは \`import SongLayout from '../../layouts/SongLayout.astro';\` と \`import LyricsBlock from '../../components/LyricsBlock.astro';\` と \`import QuickSlang from '../../components/QuickSlang.astro';\` を使用。
   - <SongLayout title="..." description="..." slug="${slug}" highlights={[]} youtubeId="..." sampleYoutubeId="..." sampleTitle="..."> で囲む。
   - 原詞の内容を「1行たりとも省略せず」「すべて元の順番通りに」LyricsBlock コンポーネントに割り当てること。（コーラスの繰り返し行等も一切省略禁止）
   - 各 LyricsBlock には \`slot="eng"\` \`slot="jpn"\` \`slot="explanation"\` を用意し、1ブロックにつき1〜2行程度に区切る。
   - 重要スラングには <QuickSlang word="X" desc="Y" /> を適用。
   - 文化的背景、制作の裏側、レガシーなどのセクションも追加。
2. src/data/songs.ts に追記する1行分のオブジェクト文字列を "songEntry" として生成する。
   - 形式例: \`  { slug: '/songs/${slug}', title: '${data.title}', subtitle: '...', artists: '${data.artist}', tag: '...', era: '...', region: '...', producer: '...', bpm: 90, sample: '...', album: '...', mbid: null, artistSlug: '...', asin: null, pubDate: '${new Date().toISOString().split('T')[0]}' },\`
3. もし src/data/artists.ts に未登録の新しいアーティストであれば、追記するオブジェクト文字列を "artistEntry" として生成する。すでにメジャーなアーティストなら null にする。

## 期待される JSON 出力フォーマット
以下の3つのキー（astroContent, songEntry, artistEntry）を持つJSONを出力してください。
JSON以外のテキストやマークダウンブロックを含めないでください。`;

    console.log(`  [Gemini Writer] Gemini API (gemini-2.5-pro) にリクエスト送信中...`);
    const response = await client.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const outputText = response.text || '';
    const parsed = JSON.parse(outputText.replace(/```json/g, '').replace(/```/g, '').trim());

    // Write Astro file
    const astroPath = join(HIPHOP_CWD, 'src/pages/songs', `${slug}.astro`);
    await writeFile(astroPath, parsed.astroContent, 'utf-8');
    
    // Update songs.ts (insert before last '];')
    const songsTsPath = join(HIPHOP_CWD, 'src/data/songs.ts');
    let songsTs = await readFile(songsTsPath, 'utf-8');
    const songsInsertIndex = songsTs.lastIndexOf('];');
    if (songsInsertIndex !== -1 && parsed.songEntry) {
      songsTs = songsTs.substring(0, songsInsertIndex) + parsed.songEntry + '\n' + songsTs.substring(songsInsertIndex);
      await writeFile(songsTsPath, songsTs, 'utf-8');
    }

    // Update artists.ts
    if (parsed.artistEntry) {
      const artistsTsPath = join(HIPHOP_CWD, 'src/data/artists.ts');
      let artistsTs = await readFile(artistsTsPath, 'utf-8');
      const artistsInsertIndex = artistsTs.lastIndexOf('];');
      if (artistsInsertIndex !== -1) {
        artistsTs = artistsTs.substring(0, artistsInsertIndex) + parsed.artistEntry + ',\n' + artistsTs.substring(artistsInsertIndex);
        await writeFile(artistsTsPath, artistsTs, 'utf-8');
      }
    }

    // Run Coverage Check (リトライループなしの1発検証・フォールバックのため)
    try {
      console.log(`  [Gemini Writer] カバレッジチェック実行中...`);
      execSync(`node agent/src/check-lyrics-coverage.mjs ${slug}`, { cwd: HIPHOP_CWD, stdio: 'pipe' });
      console.log(`  [Gemini Writer] ✅ カバレッジ 100% 確認完了`);
    } catch (e) {
      console.warn(`  [Gemini Writer] ⚠️ カバレッジチェックに失敗しました（完全な100%ではない可能性があります）。`);
      console.warn(e.stdout?.toString());
    }

    // Git Commit & Push
    console.log(`  [Gemini Writer] Gitコミット実行中...`);
    try {
      execSync(`git add src/pages/songs/${slug}.astro src/data/songs.ts src/data/artists.ts`, { cwd: HIPHOP_CWD });
      execSync(`git commit -m "feat: add ${slug} via Gemini Fallback"`, { cwd: HIPHOP_CWD });
      execSync(`git push`, { cwd: HIPHOP_CWD });
      console.log(`  [Gemini Writer] ✅ デプロイ完了`);
    } catch (e) {
      console.error(`  [Gemini Writer] Git処理エラー: ${e.message}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`  [Gemini Writer] エラー: ${error.message}`);
    return { success: false, error: error.message };
  }
}
