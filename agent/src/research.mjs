/**
 * Gemini Deep Research — 楽曲リサーチモジュール
 *
 * Interactions API (Deep Research) を優先使用。
 * 利用不可の場合は gemini-2.5-flash でフォールバック。
 */

import { GoogleGenAI } from '@google/genai';

const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

/**
 * リサーチ用プロンプトを生成する
 * @param {{ artist: string, title: string, year: number|null }} song
 * @returns {string}
 */
function buildPrompt(song) {
  const yearStr = song.year ? `リリース年: ${song.year}` : '';
  return `以下の楽曲について、日本語で詳しくリサーチしてください。

曲名: ${song.title}
アーティスト: ${song.artist}
${yearStr}

調査項目（すべて網羅すること）:
1. 制作背景（プロデューサー、サンプリング元、レコーディング秘話、BPM）
2. 収録アルバム、レーベル、リリース年
3. 歌詞の重要スラング・用語の解説（最低5つ）
4. 日本のヒップホップシーンとの関連性・影響（日本での受容、カバー、引用、来日公演など）
5. 文化的文脈（当時の社会背景、他アーティストとの関係、ビーフ、ムーブメント）
6. この曲がヒップホップ史において重要な理由

出力は構造化されたMarkdown形式で。`;
}

/**
 * Deep Research (Interactions API) でリサーチを実行する
 * @param {{ artist: string, title: string, year: number|null }} song
 * @returns {Promise<string>} リサーチ結果テキスト
 */
async function deepResearch(song) {
  const prompt = buildPrompt(song);

  // Interactions API でバックグラウンド実行
  const interaction = await client.interactions.create({
    input: prompt,
    agent: 'deep-research-preview-04-2026',
    background: true,
  });

  console.log(`  [Deep Research] 開始: ${interaction.id}`);

  // ポーリング（最大10分）
  const maxWait = 10 * 60 * 1000;
  const start = Date.now();
  const pollInterval = 15_000;

  while (Date.now() - start < maxWait) {
    await sleep(pollInterval);
    const result = await client.interactions.get(interaction.id);

    if (result.status === 'completed') {
      console.log('  [Deep Research] 完了');
      // 最終ステップからテキストを取得
      const lastStep = result.steps?.at(-1);
      if (lastStep?.content?.[0]?.text) {
        return lastStep.content[0].text;
      }
      // steps が無い場合は output を試す
      return result.output || JSON.stringify(result);
    }

    if (result.status === 'failed') {
      throw new Error(`Deep Research 失敗: ${result.error || 'unknown'}`);
    }

    console.log(`  [Deep Research] 進行中... (${Math.round((Date.now() - start) / 1000)}秒)`);
  }

  throw new Error('Deep Research タイムアウト（10分）');
}

/**
 * gemini-2.5-flash でフォールバックリサーチを実行する
 * @param {{ artist: string, title: string, year: number|null }} song
 * @returns {Promise<string>} リサーチ結果テキスト
 */
async function flashResearch(song) {
  const prompt = buildPrompt(song);
  console.log('  [Flash] gemini-2.5-flash でフォールバックリサーチ...');

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  return response.text || '';
}

/**
 * 楽曲リサーチを実行する（Deep Research → Flash フォールバック）
 * @param {{ artist: string, title: string, year: number|null }} song
 * @returns {Promise<string>}
 */
export async function runResearch(song) {
  try {
    return await deepResearch(song);
  } catch (error) {
    console.warn(`  [Research] Deep Research 利用不可: ${error.message}`);
    console.warn('  [Research] gemini-2.5-flash にフォールバック');
    return flashResearch(song);
  }
}

/**
 * リサーチ結果から正式なメタデータを抽出する
 * アーティスト名の表記揺れ補正・年号自動取得に使用
 * @param {string} researchText
 * @param {{ artist: string, title: string }} hint - ユーザー入力（フォールバック用）
 * @returns {Promise<{ artist: string, title: string, year: number|null }>}
 */
export async function extractMetadata(researchText, hint) {
  const prompt = `以下のリサーチ結果から楽曲の正確なメタデータを抽出してください。

ユーザー入力: ${hint.artist} - ${hint.title}

リサーチ結果（先頭3000文字）:
${researchText.slice(0, 3000)}

以下のJSON形式のみで返答してください（コードブロック・説明不要）:
{"artist":"正式なアーティスト名","title":"正式な曲名","year":1994}`;

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const text = (response.text || '').trim().replace(/```[a-z]*\n?/g, '').replace(/```/g, '');
    const parsed = JSON.parse(text);
    return {
      artist: parsed.artist || hint.artist,
      title: parsed.title || hint.title,
      year: typeof parsed.year === 'number' ? parsed.year : null,
    };
  } catch {
    return { artist: hint.artist, title: hint.title, year: null };
  }
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
