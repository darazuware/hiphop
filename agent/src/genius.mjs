/**
 * Genius 歌詞取得モジュール
 *
 * genius-lyrics-api を使って歌詞を検索・取得する。
 * API が使えない場合は Genius Web からスクレイピングする。
 */

import { getLyrics, searchSong } from 'genius-lyrics-api';

/**
 * Genius から歌詞を取得する
 * @param {string} title - 曲名
 * @param {string} artist - アーティスト名
 * @returns {Promise<{ lyrics: string, url: string|null }>}
 */
export async function fetchLyrics(title, artist) {
  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) {
    console.warn('  [Genius] GENIUS_ACCESS_TOKEN が未設定。歌詞取得をスキップ。');
    return { lyrics: '', url: null };
  }

  const options = {
    apiKey: token,
    title,
    artist,
    optimizeQuery: true,
  };

  try {
    // 歌詞を直接取得
    console.log(`  [Genius] 検索中: "${artist} - ${title}"`);
    const lyrics = await getLyrics(options);

    if (lyrics) {
      // 曲のURLも取得
      let url = null;
      try {
        const songs = await searchSong(options);
        if (songs && songs.length > 0) {
          url = songs[0].url;
        }
      } catch {
        // URL取得失敗は無視
      }

      console.log(`  [Genius] 歌詞取得成功 (${lyrics.length}文字)`);
      return { lyrics, url };
    }

    console.warn('  [Genius] 歌詞が見つかりませんでした');
    return { lyrics: '', url: null };
  } catch (error) {
    console.error(`  [Genius] エラー: ${error.message}`);
    return { lyrics: '', url: null };
  }
}
