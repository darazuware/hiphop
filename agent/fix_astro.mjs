import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/ktamatzmoto/Desktop/hiphop/agent/.env' });

const hiphopDir = '/Users/ktamatzmoto/Desktop/hiphop';

async function generateBeautifulAstro() {
  const jsonPath = '/tmp/hiphop-queue/1778973578355.json';
  if (!fs.existsSync(jsonPath)) {
    console.error('Data not found');
    return;
  }
  
  const rawData = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(rawData);
  const { artist, title, year, research, lyrics } = data;

  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  
  const prompt = `
あなたはプロのフロントエンドエンジニア兼ヒップホップライターです。
以下の「歌詞」と「リサーチ結果」をもとに、Astroのページコンポーネントを作成してください。

曲: ${artist} - ${title}
年: ${year}

【要件】
1. <SongLayout> を使用すること（title, description, slug, highlights, youtubeId など適切なプロパティを設定）
2. 歌詞は <LyricsBlock> コンポーネントを使用し、Verse 1, Chorus などセクションごとに分けること。
3. 必ず「英語の歌詞(slot="eng")」「日本語訳(slot="jpn")」を記述すること。（日本語訳は意訳で構いませんので文脈に合わせて作成してください）
4. リサーチ結果をもとに、重要な箇所には <QuickSlang word="..." desc="..."> を挿入し、各セクションに <Fragment slot="explanation"> で解説をつけること。
5. 「文化的背景」「レガシー・影響」などのセクションも作成し、リサーチ結果の内容をHTML/Tailwind (prose 等) を用いて美しく構成すること。
6. 返答は \`\`\`astro ... \`\`\` のコードブロックのみとし、余計な説明は不要です。

【歌詞データ】
${lyrics}

【リサーチ結果】
${research}
  `;

  console.log('Gemini 1.5 Pro にリクエストを送信中...');
  try {
    const response = await client.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: prompt,
    });
    
    let astroCode = response.text;
    astroCode = astroCode.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '');
    
    const slug = 'real-hiphop';
    const outPath = path.join(hiphopDir, 'src/pages/songs', `${slug}.astro`);
    fs.writeFileSync(outPath, astroCode.trim(), 'utf-8');
    
    console.log(`完了しました！ ${outPath} を更新しました。`);
  } catch (error) {
    console.error('Gemini 1.5 Pro エラー:', error.message);
    
    console.log('gemini-1.5-flash にフォールバックします...');
    try {
      const response2 = await client.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
      });
      let astroCode = response2.text;
      astroCode = astroCode.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '');
      const slug = 'real-hiphop';
      const outPath = path.join(hiphopDir, 'src/pages/songs', `${slug}.astro`);
      fs.writeFileSync(outPath, astroCode.trim(), 'utf-8');
      console.log(`完了しました！ ${outPath} を更新しました (Flash)。`);
    } catch (e2) {
      console.error('Gemini 1.5 Flash もエラー:', e2.message);
    }
  }
}

generateBeautifulAstro();
