#!/usr/bin/env node
/**
 * 全ての曲の歌詞カバー率とハルシネーションを一括チェックするスクリプト
 * Usage: node agent/src/check-all-lyrics.mjs
 */

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const projectRoot = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');

// --- Load env ---
let apiKey = process.env.GENIUS_ACCESS_TOKEN;
if (!apiKey) {
  try {
    const env = readFileSync(join(projectRoot, 'agent/.env'), 'utf-8');
    const match = env.match(/GENIUS_ACCESS_TOKEN=(.+)/);
    if (match) apiKey = match[1].trim();
  } catch {}
}
if (!apiKey) {
  console.error('❌ GENIUS_ACCESS_TOKEN が agent/.env に見つかりません。');
  process.exit(1);
}

// --- Parse songs.ts for all songs ---
const songsTs = readFileSync(join(projectRoot, 'src/data/songs.ts'), 'utf-8');
const lines = songsTs.split('\n');
const songs = [];

for (const line of lines) {
  if (!line.includes('slug:')) continue;
  // Extract slug, title, artists
  const slugMatch = line.match(/slug:\s*['"]\/songs\/([^'"]+)['"]/);
  const titleMatch = line.match(/title:\s*"([^"]+)"/) || line.match(/title:\s*'([^']+)'/);
  const artistsMatch = line.match(/artists:\s*['"]([^'"]+)['"]/);
  
  if (slugMatch && titleMatch && artistsMatch) {
    songs.push({
      slug: slugMatch[1],
      title: titleMatch[1],
      artist: artistsMatch[1]
    });
  }
}

console.log(`songs.ts 内に ${songs.length} 曲が見つかりました。`);

// --- Validate that fetched lyrics match expected title ---
// Checks if key words of the expected title appear in the Genius preamble (first 500 chars)
function titleMatches(lyrics, expectedTitle) {
  const preamble = lyrics.slice(0, 500).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
  const eWords = expectedTitle.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  if (eWords.length === 0) return true;
  const matches = eWords.filter(w => preamble.includes(w));
  return matches.length / eWords.length >= 0.5;
}

// --- Fetch lyrics with title-match validation and fallback retries ---
async function fetchLyrics(title, artist, slug) {
  const cachePath = `/tmp/lyrics-${slug}.txt`;
  try {
    const stat = statSync(cachePath);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < 2 * 60 * 60 * 1000) {
      const cached = readFileSync(cachePath, 'utf-8');
      if (titleMatches(cached, title)) return cached;
      // Cache has wrong song — fall through to re-fetch
    }
  } catch {}

  const { getLyrics } = require(join(projectRoot, 'agent/node_modules/genius-lyrics-api/index.js'));
  const mainArtist = artist.split(/\s+feat\./i)[0].split(/\s+ft\./i)[0].trim();

  const attempts = [
    { title, artist: mainArtist, optimizeQuery: true },
    { title, artist: mainArtist, optimizeQuery: false },
    { title, artist, optimizeQuery: true },
  ];

  for (const opts of attempts) {
    const lyrics = await getLyrics({ apiKey, ...opts });
    if (!lyrics) continue;
    if (titleMatches(lyrics, title)) {
      writeFileSync(cachePath, lyrics);
      return lyrics;
    }
  }

  throw new Error('Geniusから正しい歌詞が返されませんでした（タイトル不一致）');
}

// --- Main ---
async function run() {
  const results = [];
  
  for (const song of songs) {
    console.log(`\n🎵 チェック中: ${song.artist} - ${song.title} (${song.slug})`);
    
    // Astroファイルが存在するかチェック
    const astroPath = join(projectRoot, 'src/pages/songs', `${song.slug}.astro`);
    try {
      statSync(astroPath);
    } catch {
      console.warn(`  ⚠️ Astroファイルが見つかりません。スキップします: ${astroPath}`);
      results.push({
        ...song,
        status: 'SKIPPED',
        reason: 'Astroファイルが存在しません'
      });
      continue;
    }
    
    // Geniusから歌詞をあらかじめ取得（キャッシュ確認用）
    try {
      await fetchLyrics(song.title, song.artist, song.slug);
    } catch (e) {
      console.warn(`  ⚠️ Geniusからの歌詞取得に失敗しました。スキップします: ${e.message}`);
      results.push({
        ...song,
        status: 'FAILED_FETCH',
        reason: `Genius 取得エラー: ${e.message}`
      });
      continue;
    }
    
    // カバー率チェックスクリプトを実行
    try {
      const output = execSync(
        `node ${join(projectRoot, 'agent/src/check-lyrics-coverage.mjs')} ${song.slug}`,
        { encoding: 'utf-8', cwd: projectRoot }
      );
      
      // 出力の解析
      const covMatch = output.match(/Covered:\s*(\d+)\/(\d+)\s*lines\s*\((\d+)%\)/);
      const blocksMatch = output.match(/LyricsBlock components in \.astro:\s*(\d+)/);
      
      const isOmissionErr = output.includes('❌ [A]');
      const isHallucinationErr = output.includes('❌ [B]');
      
      // Omissionsの抽出
      let omissions = [];
      const oSection = output.split(/\[A\]/)[1];
      if (oSection) {
        const oLines = oSection.split('\n');
        for (const l of oLines) {
          const m = l.match(/^\s*\d+\.\s*(.+)$/);
          if (m) omissions.push(m[1]);
        }
      }
      
      // Hallucinationsの抽出
      let hallucinations = [];
      const hSection = output.split(/\[B\]/)[1];
      if (hSection) {
        const hLines = hSection.split('\n');
        for (const l of hLines) {
          const m = l.match(/^\s*\d+\.\s*(.+)$/);
          if (m) hallucinations.push(m[1]);
        }
      }
      
      results.push({
        ...song,
        status: (isOmissionErr || isHallucinationErr) ? 'ERROR' : 'OK',
        coveragePercent: covMatch ? parseInt(covMatch[3], 10) : 0,
        coveredCount: covMatch ? parseInt(covMatch[1], 10) : 0,
        totalCount: covMatch ? parseInt(covMatch[2], 10) : 0,
        blocksCount: blocksMatch ? parseInt(blocksMatch[1], 10) : 0,
        omissions,
        hallucinations,
        hasOmissionError: isOmissionErr,
        hasHallucinationError: isHallucinationErr,
        rawOutput: output
      });
      
      console.log(`  カバー率: ${covMatch ? covMatch[3] : 0}% | ブロック数: ${blocksMatch ? blocksMatch[1] : 0} | ステータス: ${(isOmissionErr || isHallucinationErr) ? '❌ ERROR' : '✅ OK'}`);
      if (isOmissionErr) console.log(`    抜け漏れ: ${omissions.length} 行`);
      if (isHallucinationErr) console.log(`    間違い(ハルシネーション): ${hallucinations.length} 行`);
      
    } catch (e) {
      // check-lyrics-coverage.mjs が 1 で終了した場合の例外ハンドリング
      const output = e.stdout || '';
      const covMatch = output.match(/Covered:\s*(\d+)\/(\d+)\s*lines\s*\((\d+)%\)/);
      const blocksMatch = output.match(/LyricsBlock components in \.astro:\s*(\d+)/);
      const isOmissionErr = output.includes('❌ [A]');
      const isHallucinationErr = output.includes('❌ [B]');
      
      let omissions = [];
      const oSection = output.split(/\[A\]/)[1];
      if (oSection) {
        const oLines = oSection.split('\n');
        for (const l of oLines) {
          const m = l.match(/^\s*\d+\.\s*(.+)$/);
          if (m) omissions.push(m[1]);
        }
      }
      
      let hallucinations = [];
      const hSection = output.split(/\[B\]/)[1];
      if (hSection) {
        const hLines = hSection.split('\n');
        for (const l of hLines) {
          const m = l.match(/^\s*\d+\.\s*(.+)$/);
          if (m) hallucinations.push(m[1]);
        }
      }
      
      results.push({
        ...song,
        status: 'ERROR',
        coveragePercent: covMatch ? parseInt(covMatch[3], 10) : 0,
        coveredCount: covMatch ? parseInt(covMatch[1], 10) : 0,
        totalCount: covMatch ? parseInt(covMatch[2], 10) : 0,
        blocksCount: blocksMatch ? parseInt(blocksMatch[1], 10) : 0,
        omissions,
        hallucinations,
        hasOmissionError: isOmissionErr,
        hasHallucinationError: isHallucinationErr,
        rawOutput: output
      });
      
      console.log(`  カバー率: ${covMatch ? covMatch[3] : 0}% | ブロック数: ${blocksMatch ? blocksMatch[1] : 0} | ステータス: ❌ ERROR`);
      if (isOmissionErr) console.log(`    抜け漏れ: ${omissions.length} 行`);
      if (isHallucinationErr) console.log(`    間違い(ハルシネーション): ${hallucinations.length} 行`);
    }
  }
  
  // 概要マークダウンレポートを出力
  const summaryPath = join(projectRoot, 'lyrics-check-report.md');
  let md = `# Waxthink 歌詞クオリティ・チェックレポート\n\n`;
  md += `実行日時: ${new Date().toLocaleString('ja-JP')}\n\n`;
  
  const okSongs = results.filter(r => r.status === 'OK');
  const errSongs = results.filter(r => r.status === 'ERROR');
  const skippedSongs = results.filter(r => r.status === 'SKIPPED' || r.status === 'FAILED_FETCH');
  
  md += `## 概要\n`;
  md += `- **総チェック曲数**: ${results.length}\n`;
  md += `- **合格 (✅)**: ${okSongs.length}\n`;
  md += `- **不合格 (❌)**: ${errSongs.length}\n`;
  md += `- **スキップ (⚠️)**: ${skippedSongs.length}\n\n`;
  
  if (errSongs.length > 0) {
    md += `## 不合格となった曲の詳細\n\n`;
    for (const song of errSongs) {
      md += `### ❌ [${song.title} - ${song.artist}](file://${join(projectRoot, 'src/pages/songs', `${song.slug}.astro`)})\n`;
      md += `- **カバー率**: ${song.coveragePercent}% (${song.coveredCount}/${song.totalCount} 行)\n`;
      
      if (song.hasOmissionError) {
        md += `- **抜け漏れエラー ([A])**: ${song.omissions.length} 行の歌詞がAstroファイルに含まれていません。\n`;
        md += `  <details><summary>抜け漏れ歌詞の一覧</summary>\n\n  \`\`\`\n  ` + song.omissions.join('\n  ') + `\n  \`\`\`\n  </details>\n`;
      } else if (song.omissions.length > 0) {
        md += `- **抜け漏れ（警告）**: ${song.omissions.length} 行が不足（ただしカバー率は 80% 以上で許容範囲内）\n`;
      }
      
      if (song.hasHallucinationError) {
        md += `- **間違い・余分な歌詞エラー ([B])**: ${song.hallucinations.length} 行が Genius 歌詞データと一致しませんでした。\n`;
        md += `  <details><summary>不一致歌詞の一覧</summary>\n\n  \`\`\`\n  ` + song.hallucinations.join('\n  ') + `\n  \`\`\`\n  </details>\n`;
      }
      md += `\n`;
    }
  }
  
  if (skippedSongs.length > 0) {
    md += `## スキップされた曲\n\n`;
    for (const song of skippedSongs) {
      md += `- **${song.title} - ${song.artist}**: ${song.reason || '不明な理由'}\n`;
    }
    md += `\n`;
  }
  
  md += `## 全曲の判定結果一覧\n\n`;
  md += `| ステータス | 曲名 | アーティスト | カバー率 | ブロック数 | 抜け漏れ行数 | 不一致行数 |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  for (const r of results) {
    const statusIcon = r.status === 'OK' ? '✅' : (r.status === 'ERROR' ? '❌' : '⚠️');
    const covStr = r.coveragePercent !== undefined ? `${r.coveragePercent}%` : '-';
    const oCount = r.omissions ? r.omissions.length : '-';
    const hCount = r.hallucinations ? r.hallucinations.length : '-';
    const blocks = r.blocksCount !== undefined ? r.blocksCount : '-';
    md += `| ${statusIcon} | ${r.title} | ${r.artist} | ${covStr} | ${blocks} | ${oCount} | ${hCount} |\n`;
  }
  
  writeFileSync(summaryPath, md, 'utf-8');
  console.log(`\nレポートが ${summaryPath} に作成されました。`);
}

run().catch(console.error);
