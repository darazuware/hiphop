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
 * @returns {Promise<{ lyrics: string, url: string|null, imageUrl: string|null }>}
 */
function titleMatches(lyrics, expectedTitle) {
  const preamble = lyrics.slice(0, 500).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
  const eWords = expectedTitle.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  if (eWords.length === 0) return true;
  const matches = eWords.filter(w => preamble.includes(w));
  return matches.length / eWords.length >= 0.5;
}

export async function fetchLyrics(title, artist) {
  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) {
    console.warn('  [Genius] GENIUS_ACCESS_TOKEN が未設定。歌詞取得をスキップ。');
    return { lyrics: '', url: null, imageUrl: null };
  }

  const mainArtist = artist.split(/\s+feat\./i)[0].split(/\s+ft\./i)[0].trim();

  const attempts = [
    { apiKey: token, title, artist: mainArtist, optimizeQuery: true },
    { apiKey: token, title, artist: mainArtist, optimizeQuery: false },
    { apiKey: token, title, artist, optimizeQuery: true },
  ];

  console.log(`  [Genius] 検索中: "${artist} - ${title}"`);

  for (const options of attempts) {
    try {
      const lyrics = await getLyrics(options);
      if (!lyrics) continue;
      if (!titleMatches(lyrics, title)) {
        console.warn(`  [Genius] タイトル不一致、リトライ中...`);
        continue;
      }

      let url = null;
      let imageUrl = null;
      try {
        const songs = await searchSong(options);
        if (songs && songs.length > 0) {
          url = songs[0].url;
          imageUrl = songs[0].image || null;
        }
      } catch {}

      console.log(`  [Genius] 歌詞取得成功 (${lyrics.length}文字)${imageUrl ? ', ジャケット取得' : ''}`);
      return { lyrics, url, imageUrl };
    } catch {}
  }

  console.warn('  [Genius] 歌詞が見つかりませんでした');
  return { lyrics: '', url: null, imageUrl: null };
}
