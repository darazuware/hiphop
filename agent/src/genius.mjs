/**
 * Genius 歌詞取得モジュール
 *
 * genius-lyrics-api を使って歌詞を検索・取得する。
 * feat./アポストロフィ等による誤マッチ（別曲取得）を防ぐため、
 * searchSong の候補を曲名＋アーティストでスコアリングして正しいヒットを選ぶ。
 */

import { createRequire } from 'node:module';
import { searchSong } from 'genius-lyrics-api';

const require = createRequire(import.meta.url);
// 内部モジュール：URL指定で歌詞本文を取得する（getLyricsはresults[0]固定で候補を選べないため）
const extractLyrics = require('genius-lyrics-api/lib/utils/extractLyrics');

/** 文字列を比較用に正規化（小文字・記号除去・空白圧縮）。アポストロフィは除去して語をつなぐ。 */
function norm(s) {
  return (s || '')
    .toLowerCase()
    .replace(/['’`]/g, '')          // Nuthin' → nuthin
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Genius の full_title（"Song by Artist (Ft. X)"）を曲名／アーティストに分解 */
function splitFullTitle(rawTitle) {
  // Genius は区切りに non-breaking space 等を使うため全空白を通常空白へ正規化
  const fullTitle = (rawTitle || '').replace(/\s+/g, ' ').trim();
  const idx = fullTitle.toLowerCase().lastIndexOf(' by ');
  if (idx === -1) return { songPart: fullTitle, artistPart: '' };
  return {
    songPart: fullTitle.slice(0, idx),
    // (Ft. ...) を除いた主アーティスト
    artistPart: fullTitle.slice(idx + 4).replace(/\(.*?\)/g, '').trim(),
  };
}

/** 曲名一致スコア（期待曲名の語が候補曲名にどれだけ含まれるか 0〜1） */
function titleScore(expectedTitle, candidateSongPart) {
  const cand = norm(candidateSongPart);
  const words = norm(expectedTitle).split(' ').filter(w => w.length > 2);
  if (words.length === 0) return 1;
  const hit = words.filter(w => cand.includes(w)).length;
  return hit / words.length;
}

/** アーティスト一致判定（期待アーティストの語が候補に含まれるか） */
function artistMatches(expectedArtist, candidateArtistPart) {
  const cand = norm(candidateArtistPart);
  if (!cand) return false;
  const words = norm(expectedArtist).split(' ').filter(Boolean);
  const longish = words.filter(w => w.length >= 3);
  if (longish.length > 0) return longish.some(w => cand.includes(w));
  // 全語が2文字以下（2Pac等）→ 先頭語の一致を見る
  return words.length > 0 && cand.includes(words[0]);
}

/** 取得した歌詞本文に曲名語が現れるかの二次ガード */
function lyricsTitleSanity(lyrics, expectedTitle) {
  const preamble = norm(lyrics.slice(0, 800));
  const words = norm(expectedTitle).split(' ').filter(w => w.length > 2);
  if (words.length === 0) return true;
  const hit = words.filter(w => preamble.includes(w)).length;
  return hit / words.length >= 0.34; // 緩め（タイトルが歌詞冒頭に無い曲もある）
}

/**
 * Genius から歌詞を取得する
 * @param {string} title - 曲名
 * @param {string} artist - アーティスト名
 * @returns {Promise<{ lyrics: string, url: string|null, imageUrl: string|null }>}
 */
export async function fetchLyrics(title, artist) {
  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) {
    console.warn('  [Genius] GENIUS_ACCESS_TOKEN が未設定。歌詞取得をスキップ。');
    return { lyrics: '', url: null, imageUrl: null };
  }

  // feat./ft. を除いた主アーティスト（照合の基準）
  const mainArtist = artist.split(/\s+feat\./i)[0].split(/\s+ft\./i)[0].trim();

  // (a) optimizeQuery:false を優先（CLAUDE.md推奨／誤マッチ防止）。
  //     複数クエリ変種の候補を集めてスコアリングし、最良ヒットを選ぶ。
  const queries = [
    { apiKey: token, title, artist: mainArtist, optimizeQuery: false },
    { apiKey: token, title, artist: mainArtist, optimizeQuery: true },
    { apiKey: token, title, artist, optimizeQuery: false },
    { apiKey: token, title, artist, optimizeQuery: true },
    // 誤マッチが疑われる場合の変種：曲名のみ
    { apiKey: token, title, artist: '', optimizeQuery: false },
  ];

  console.log(`  [Genius] 検索中: "${artist} - ${title}"`);

  const seen = new Set();
  const candidates = [];
  for (const q of queries) {
    let results;
    try {
      results = await searchSong(q);
    } catch {
      continue;
    }
    if (!results) continue;
    for (const r of results.slice(0, 5)) {
      if (!r?.url || seen.has(r.url)) continue;
      seen.add(r.url);
      const { songPart, artistPart } = splitFullTitle(r.title || '');
      const tScore = titleScore(title, songPart);
      const aMatch = artistMatches(mainArtist, artistPart);
      candidates.push({ ...r, songPart, artistPart, tScore, aMatch });
    }
  }

  if (candidates.length === 0) {
    console.warn('  [Genius] 歌詞が見つかりませんでした');
    return { lyrics: '', url: null, imageUrl: null };
  }

  // (b)(c) 曲名語50%→60%以上＋アーティスト一致を満たすヒットを優先。
  //        スコア順（アーティスト一致を強く重み付け）で並べる。
  candidates.sort((x, y) =>
    (y.tScore + (y.aMatch ? 1 : 0)) - (x.tScore + (x.aMatch ? 1 : 0))
  );

  const ordered = [
    ...candidates.filter(c => c.aMatch && c.tScore >= 0.6),
    ...candidates.filter(c => c.aMatch && c.tScore >= 0.4),
    ...candidates.filter(c => !(c.aMatch && c.tScore >= 0.4)), // 最後の保険
  ];

  for (const c of ordered) {
    let lyrics;
    try {
      lyrics = await extractLyrics(c.url);
    } catch {
      continue;
    }
    if (!lyrics) continue;
    if (!lyricsTitleSanity(lyrics, title)) {
      console.warn('  [Genius] 歌詞内容が曲名と不一致、次候補へ...');
      continue;
    }
    const tag = c.aMatch && c.tScore >= 0.6 ? '一致' : `要確認(t=${c.tScore.toFixed(2)},a=${c.aMatch})`;
    console.log(`  [Genius] 歌詞取得成功 (${lyrics.length}文字, ${tag})`);
    return { lyrics, url: c.url, imageUrl: c.albumArt || null };
  }

  console.warn('  [Genius] 妥当な候補が無く歌詞取得に失敗');
  return { lyrics: '', url: null, imageUrl: null };
}
