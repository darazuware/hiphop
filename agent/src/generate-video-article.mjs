/**
 * generate-video-article.mjs
 *
 * YouTube URL → 字幕取得 → Claude API で翻訳記事生成 → video-queue に追加
 *
 * 使い方:
 *   node agent/src/generate-video-article.mjs https://www.youtube.com/watch?v=XXXX
 */

import 'dotenv/config';
import { execSync } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const QUEUE_DIR = join(__dirname, '../video-queue');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ────────────────────────────────────────────────────────────
// ユーティリティ
// ────────────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function getVideoInfo(youtubeUrl) {
  const infoJson = execSync(
    `yt-dlp --print-json --skip-download "${youtubeUrl}"`,
    { encoding: 'utf-8' }
  );
  const info = JSON.parse(infoJson);
  return {
    id: info.id,
    title: info.title,
    channel: info.channel || info.uploader,
    duration: info.duration,
    uploadDate: info.upload_date, // YYYYMMDD
  };
}

async function getSubtitles(youtubeUrl, videoId) {
  const vttPath = `/tmp/video-subs-${videoId}.en.vtt`;
  try {
    execSync(
      `yt-dlp --write-auto-subs --sub-lang en --sub-format vtt --skip-download -o "/tmp/video-subs-${videoId}" "${youtubeUrl}"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    const raw = await readFile(vttPath, 'utf-8');
    // VTT → テキストに変換・重複除去
    const lines = raw
      .split('\n')
      .filter(l => !l.startsWith('WEBVTT') && !l.startsWith('Kind:') && !l.startsWith('Language:') && !l.includes('-->') && l.trim())
      .map(l => l.replace(/<[^>]*>/g, '').trim())
      .filter(Boolean);
    const deduped = [...new Set(lines)].filter(l => l !== '[Music]');
    return deduped.join('\n');
  } catch (e) {
    console.warn('  [字幕] 取得失敗:', e.message);
    return '';
  }
}

function detectVideoType(title) {
  const t = title.toLowerCase();
  if (t.includes('freestyle') || t.includes('free style')) return 'freestyle';
  if (t.includes('cypher')) return 'cypher';
  if (t.includes('interview')) return 'interview';
  if (t.includes('live') || t.includes('concert') || t.includes('performance')) return 'live';
  if (t.includes('documentary') || t.includes('doc')) return 'documentary';
  return 'freestyle';
}

function extractYear(uploadDate, title) {
  // タイトルから年を抽出
  const m = title.match(/\b(19|20)\d{2}\b/);
  if (m) return parseInt(m[0]);
  // upload_date から
  if (uploadDate) return parseInt(uploadDate.slice(0, 4));
  return new Date().getFullYear();
}

function extractArtists(title) {
  // "Eminem & Proof Freestyle" → "Eminem & Proof"
  // "BET Hip Hop Awards Cypher 2011" → 後でClaudeに任せる
  return title.replace(/\s*(freestyle|cypher|interview|live|HD|uncensored|dirty|\d{4}|BET|HipHop|Hip Hop)/gi, '').trim();
}

// ────────────────────────────────────────────────────────────
// Claude API で記事生成
// ────────────────────────────────────────────────────────────

async function generateArticle({ videoId, title, channel, type, year, subtitles, youtubeUrl }) {
  console.log('  [Claude] 記事生成中...');

  const prompt = `あなたはヒップホップ専門の日本語翻訳・解説ライターです。
以下のYouTube動画の情報と自動字幕から、waxthink.comの記事を生成してください。

## 動画情報
- タイトル: ${title}
- チャンネル: ${channel}
- YouTube ID: ${videoId}
- 種別: ${type}
- 年: ${year}
- URL: ${youtubeUrl}

## 自動字幕（英語・ノイズあり）
${subtitles || '（字幕なし）'}

---

## 出力形式

以下の形式で **3つのセクション** を出力してください。

### SECTION_1: メタデータ (JSON)
\`\`\`json
{
  "slug": "スラッグ（英小文字・ハイフン区切り）",
  "title": "ページタイトル（日本語・例: Eminem & Proof 車内フリースタイル 和訳・解説 | Stereo Car Freestyle）",
  "artists": "アーティスト名",
  "artistSlug": "既存のartistSlug（songs.tsを参照）",
  "type": "${type}",
  "year": ${year},
  "tag": "短い説明タグ（〜30文字）",
  "description": "SEOメタディスクリプション（120文字以内）",
  "highlights": ["見どころ1", "見どころ2", "見どころ3"]
}
\`\`\`

### SECTION_2: 字幕の再構成テキスト（英語・クリーンアップ済み）
自動字幕のノイズ・重複・誤認識を修正した英語テキスト。
バース/パートを識別して名前を付ける（例: [Verse 1: Eminem]）。
1行ずつ改行して出力。

### SECTION_3: Astroページ本文（<VideoLayout>の中身のみ）
以下のルールで出力:
- VideoLayoutタグは含めない（中身のslotコンテンツだけ）
- LyricsBlockを使う: <LyricsBlock hasExplanation={true/false}><span slot="eng">...</span><span slot="jpn">...</span><span slot="explanation">...</span></LyricsBlock>
- 1ブロック = 1〜3行（意味のまとまり）
- セクションは <section class="mb-12"><h2>...</h2>...</section> で区切る
- 最初に「■この動画の意味（要約）」セクション
- 次に「■[アーティスト名]について」セクション（知ってる範囲で）
- 目次 <nav>
- 各パートのLyricsBlock群
- 最後に「■文化的背景と意義」セクション
- 歌詞英語行をレスポンステキストに直接出力しない（LyricsBlockのslot内だけ）
- アポストロフィ(')を含むJSX属性はダブルクォートで囲む`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

// ────────────────────────────────────────────────────────────
// 出力パース
// ────────────────────────────────────────────────────────────

function parseOutput(output) {
  const metaMatch = output.match(/### SECTION_1[\s\S]*?```json\n([\s\S]*?)\n```/);
  const cleanMatch = output.match(/### SECTION_2[\s\S]*?\n([\s\S]*?)(?=### SECTION_3)/);
  const astroMatch = output.match(/### SECTION_3[\s\S]*?\n([\s\S]*?)$/);

  let meta = {};
  try { meta = JSON.parse(metaMatch?.[1] || '{}'); } catch {}

  return {
    meta,
    cleanedSubtitles: cleanMatch?.[1]?.trim() || '',
    astroBody: astroMatch?.[1]?.trim() || '',
  };
}

// ────────────────────────────────────────────────────────────
// .astro ファイル生成
// ────────────────────────────────────────────────────────────

function buildAstroContent(meta, astroBody) {
  const safeTitle = meta.title?.replace(/"/g, '&quot;') || '';
  const safeDesc = meta.description?.replace(/"/g, '&quot;') || '';
  const highlights = (meta.highlights || []).map(h => `    "${h.replace(/"/g, '\\"')}"`).join(',\n');

  return `---
import LyricsBlock from '../../components/LyricsBlock.astro';
import VideoLayout from '../../layouts/VideoLayout.astro';
---

<VideoLayout
  title="${safeTitle}"
  description="${safeDesc}"
  slug="${meta.slug || ''}"
${highlights ? `  highlights={[\n${highlights},\n  ]}` : ''}
>

${astroBody}

</VideoLayout>
`;
}

// ────────────────────────────────────────────────────────────
// キューへ追加
// ────────────────────────────────────────────────────────────

async function addToQueue(meta, astroPath) {
  await mkdir(QUEUE_DIR, { recursive: true });

  // 連番を決める
  let files = [];
  try { files = await readdir(QUEUE_DIR); } catch {}
  const nums = files.map(f => parseInt(f)).filter(n => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  const queueFile = join(QUEUE_DIR, `${String(next).padStart(3, '0')}_${meta.slug}.json`);

  const entry = {
    slug: meta.slug,
    title: meta.title,
    artists: meta.artists,
    artistSlug: meta.artistSlug,
    youtubeId: meta.youtubeId,
    type: meta.type,
    year: meta.year,
    tag: meta.tag,
    astroPath,
    queuedAt: new Date().toISOString(),
  };

  await writeFile(queueFile, JSON.stringify(entry, null, 2), 'utf-8');
  console.log(`  [Queue] 追加: ${queueFile}`);
  return queueFile;
}

// ────────────────────────────────────────────────────────────
// メイン
// ────────────────────────────────────────────────────────────

async function main() {
  const youtubeUrl = process.argv[2];
  if (!youtubeUrl || !youtubeUrl.includes('youtube.com')) {
    console.error('使い方: node generate-video-article.mjs https://www.youtube.com/watch?v=XXXX');
    process.exit(1);
  }

  console.log('📹 動画情報取得中...');
  const info = await getVideoInfo(youtubeUrl);
  console.log(`  タイトル: ${info.title}`);
  console.log(`  チャンネル: ${info.channel}`);

  console.log('📝 字幕取得中...');
  const subtitles = await getSubtitles(youtubeUrl, info.id);
  console.log(`  字幕行数: ${subtitles.split('\n').length}`);

  const type = detectVideoType(info.title);
  const year = extractYear(info.uploadDate, info.title);

  console.log('🤖 Claude で記事生成中...');
  const rawOutput = await generateArticle({
    videoId: info.id,
    title: info.title,
    channel: info.channel,
    type,
    year,
    subtitles,
    youtubeUrl,
  });

  const { meta, astroBody } = parseOutput(rawOutput);

  if (!meta.slug) {
    meta.slug = slugify(info.title);
  }
  meta.youtubeId = info.id;

  const astroPath = join(ROOT, 'src/pages/videos', `${meta.slug}.astro`);
  const astroContent = buildAstroContent(meta, astroBody);

  await mkdir(join(ROOT, 'src/pages/videos'), { recursive: true });
  await writeFile(astroPath, astroContent, 'utf-8');
  console.log(`  ✅ 記事生成: ${astroPath}`);

  const queueFile = await addToQueue(meta, astroPath);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ キューに追加: ${queueFile}`);
  console.log(`   スラッグ: ${meta.slug}`);
  console.log(`   記事パス: ${astroPath}`);
  console.log('');
  console.log('公開するには: node agent/src/publish-next-video.mjs');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(e => { console.error('❌ エラー:', e.message); process.exit(1); });
