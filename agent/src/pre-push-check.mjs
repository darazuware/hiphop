#!/usr/bin/env node
/**
 * Pre-push lyrics coverage check.
 * Called by agent/hooks/pre-push with a list of changed song .astro paths.
 * Fetches lyrics from Genius and runs check-lyrics-coverage.mjs for each.
 *
 * Item 4: 曲間定型句（解説文の使い回し）検出ガード。
 *   src/pages/songs/*.astro を横断スキャンし、25文字以上の同一日本語解説文が
 *   複数曲に再利用されていないか検出する。既存の許容重複は agent/.dup-baseline.json
 *   にハッシュで記録（平文は保存しない＝歌詞英語行を一切出さない）。baseline に無い
 *   "net-new" の曲間重複はブロックする。出力は該当曲slugと重複箇所数のみ。
 *   baseline 再生成: node agent/src/pre-push-check.mjs --update-dup-baseline
 *
 * Item 6: Genius 短尺フェッチ対策。
 *   (a) 取得歌詞が既存キャッシュより短い場合はキャッシュを上書きしない（不完全フェッチ）。
 *   (b) 不完全フェッチ時は [B]（ハルシネーション）を失敗ブロックせずスキップ＋警告（要手動確認）。
 *   (c) 短尺が返ったら数回リトライし最長版を採用。
 *   出力は行数・カウントのみ。
 */

import { readFileSync, writeFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

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

// --- Parse songs.ts for title/artist lookup ---
const songsTs = readFileSync(join(projectRoot, 'src/data/songs.ts'), 'utf-8');
function getSongMeta(slug) {
  const re = new RegExp(
    `slug:\\s*['"]\/songs\/${slug}['"][^}]+?title:\\s*['"]([^'"]+)['"][^}]+?artists:\\s*['"]([^'"]+)['"]`,
    's'
  );
  const m = songsTs.match(re);
  return m ? { title: m[1], artist: m[2] } : null;
}

// ============================================================================
// Item 4: 曲間定型句（解説文使い回し）検出ガード
// ============================================================================
const DUP_MIN_CHARS = 25;                 // この文字数以上の同一解説文を検出対象にする
const DUP_BASELINE = join(projectRoot, 'agent/.dup-baseline.json');
const songsDir = join(projectRoot, 'src/pages/songs');

// 日本語文字数（ひらがな・カタカナ・漢字・々ー）
function jpCharCount(s) {
  return (s.match(/[぀-ゟ゠-ヿ一-鿿々ー]/g) || []).length;
}

// .astro 本文から日本語解説文を抽出（eng スロットは除外＝英語歌詞断片を拾わない）
function prosesentences(raw) {
  let body = raw.replace(/^---[\s\S]*?\n---/, '');
  body = body.replace(/<Fragment\s+slot="eng">[\s\S]*?<\/Fragment>/g, ' ');
  body = body.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
  const out = [];
  for (let s of body.split(/[。\n]/)) {
    s = s.replace(/\s+/g, '').trim();
    if (s.length >= DUP_MIN_CHARS && jpCharCount(s) >= DUP_MIN_CHARS) out.push(s);
  }
  return out;
}

function hashSentence(s) {
  return createHash('sha1').update(s).digest('hex').slice(0, 16);
}

// 全曲を横断し、2曲以上に現れる同一解説文を { hash -> [slug...] } で返す
function findCrossSongDuplicates() {
  const files = readdirSync(songsDir).filter((f) => f.endsWith('.astro'));
  const map = new Map(); // hash -> Set(slug)
  for (const f of files) {
    const slug = basename(f, '.astro');
    const seen = new Set(prosesentences(readFileSync(join(songsDir, f), 'utf-8')));
    for (const s of seen) {
      const h = hashSentence(s);
      if (!map.has(h)) map.set(h, new Set());
      map.get(h).add(slug);
    }
  }
  const dups = new Map();
  for (const [h, set] of map) if (set.size >= 2) dups.set(h, [...set].sort());
  return dups;
}

function loadBaseline() {
  if (!existsSync(DUP_BASELINE)) return new Set();
  try { return new Set(JSON.parse(readFileSync(DUP_BASELINE, 'utf-8'))); } catch { return new Set(); }
}

// --update-dup-baseline: 現状の曲間重複を許容ベースラインとして焼く（平文は保存しない）
function updateBaseline() {
  const dups = findCrossSongDuplicates();
  const hashes = [...dups.keys()].sort();
  writeFileSync(DUP_BASELINE, JSON.stringify(hashes, null, 2) + '\n');
  console.log(`[dup-baseline] wrote ${hashes.length} allowed duplicate hash(es) → agent/.dup-baseline.json`);
}

// ガード本体: baseline に無い net-new の曲間重複があればブロック
function checkDuplicateGuard() {
  const dups = findCrossSongDuplicates();
  const baseline = loadBaseline();
  const netNew = [...dups.entries()].filter(([h]) => !baseline.has(h));
  const allowed = dups.size - netNew.length;

  console.log(`\n🔁 定型句ガード: 曲間重複 ${dups.size}件（許容${allowed} / 新規${netNew.length}）・閾値${DUP_MIN_CHARS}字`);
  if (netNew.length === 0) {
    console.log('✅ [DUP] 新規の解説文使い回しは検出されず');
    return false;
  }
  // 新規重複: 関与した曲slugと件数のみ出力（文面・歌詞は出さない）
  const bySlugGroup = new Map();
  for (const [, slugs] of netNew) {
    const key = slugs.join(', ');
    bySlugGroup.set(key, (bySlugGroup.get(key) || 0) + 1);
  }
  console.log(`❌ [DUP] ${netNew.length}件の解説文が複数曲で使い回されています（定型句禁止）:`);
  for (const [slugs, n] of bySlugGroup) console.log(`   [${n}箇所] ${slugs}`);
  console.log('   → 各曲固有の表現に書き換えてください。意図的な許容なら --update-dup-baseline で焼き直し。');
  return true;
}

// ============================================================================
// Item 7: 評論家口調ガード（散文の禁止語検出）
//   docs/article-tone.md の「評論家ヅラ禁止」リストと同期。変更された曲のみ走査。
//   出力は検出語と件数のみ（歌詞・本文は出さない＝コンテンツフィルター対策）。
// ============================================================================
// 散文でほぼ常に格付け・分析口調になる高精度の語のみ（誤検出で正記事をブロックしない範囲）
const CRITIC_PATTERNS = [
  '圧巻',
  '秀逸',
  '見事',
  '通奏低音',
  '言語の経済性',
  'リリシズムの核',
  'にほかならない',
  'に他ならない',
  '先駆けとして',
  'として位置づけ',
  'として位置付け',
  'スタイルを確立',
  '多層的に読める',
];

// .astro から日本語散文だけを取り出す（eng スロット・タグ除去）
function jpBody(raw) {
  let body = raw.replace(/^---[\s\S]*?\n---/, '');
  body = body.replace(/<Fragment\s+slot="eng">[\s\S]*?<\/Fragment>/g, ' ');
  body = body.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
  return body;
}

function checkCriticTone(paths) {
  let failed = false;
  for (const p of paths) {
    const slug = basename(p, '.astro');
    const file = join(songsDir, `${slug}.astro`);
    if (!existsSync(file)) continue;
    const body = jpBody(readFileSync(file, 'utf-8'));
    const hits = [];
    for (const w of CRITIC_PATTERNS) {
      const n = (body.match(new RegExp(w, 'g')) || []).length;
      if (n) hits.push(`${w}×${n}`);
    }
    if (hits.length) {
      console.log(`❌ [TONE] ${slug}: 評論家口調の禁止語 → ${hits.join(' / ')}`);
      failed = true;
    } else {
      console.log(`✅ [TONE] ${slug}: 評論家口調の禁止語なし`);
    }
  }
  if (failed) {
    console.log('   → docs/article-tone.md の禁止リスト参照。〈発見の共有〉〈一人称の感想〉に書き換えてください。');
  }
  return failed;
}

// --- Item 6: Fetch lyrics (短尺フェッチ対策つき) ---
// returns { lines, incomplete }
async function fetchLyrics(title, artist, slug) {
  // feat./ft./featuring 以降を除去し主アーティストでクエリ（誤マッチ防止）。
  // 例: "2Pac feat. Dr. Dre" → "2Pac"（feat.付きだと別曲/megamixに誤ヒットする実例あり）
  artist = artist.split(/\s*(?:feat\.?|ft\.?|featuring)\s+/i)[0].trim();
  const cachePath = `/tmp/lyrics-${slug}.txt`;
  let cachedText = null, cachedLines = 0;
  try {
    cachedText = readFileSync(cachePath, 'utf-8');
    cachedLines = cachedText.split('\n').length;
  } catch {}

  // フレッシュなキャッシュ（2h未満）はそのまま使う
  try {
    const ageMs = Date.now() - statSync(cachePath).mtimeMs;
    if (ageMs < 2 * 60 * 60 * 1000) {
      console.log(`  Using cached lyrics (${Math.round(ageMs / 60000)}m old, ${cachedLines} lines)`);
      return { lines: cachedLines, incomplete: false };
    }
  } catch {}

  if (!apiKey) {
    if (cachedText) {
      console.log(`  No API key; keeping stale cache (${cachedLines} lines)`);
      return { lines: cachedLines, incomplete: true };
    }
    throw new Error('GENIUS_ACCESS_TOKEN not found and no cache');
  }

  // (c) 短尺が返ったら数回リトライし最長版を採用
  const { getLyrics } = require(join(projectRoot, 'agent/node_modules/genius-lyrics-api/index.js'));
  let best = null, bestLines = 0;
  const target = Math.max(cachedLines, 20); // 充分な長さの目安
  for (let attempt = 1; attempt <= 3; attempt++) {
    let lyrics = null;
    try { lyrics = await getLyrics({ apiKey, title, artist, optimizeQuery: false }); } catch {}
    const n = lyrics ? lyrics.split('\n').length : 0;
    if (n > bestLines) { best = lyrics; bestLines = n; }
    if (bestLines >= target) break;
  }

  // フェッチ完全失敗
  if (!best) {
    if (cachedText) {
      console.log(`  Genius fetch empty; keeping cache (${cachedLines} lines)`);
      return { lines: cachedLines, incomplete: true };
    }
    throw new Error('No lyrics returned');
  }

  // (a) 既存キャッシュより短い＝不完全フェッチ。キャッシュを上書きしない
  if (cachedText && bestLines < cachedLines) {
    console.log(`  Fetched ${bestLines} lines < cached ${cachedLines} (short fetch) — keep cache, skip [B]`);
    return { lines: cachedLines, incomplete: true };
  }

  writeFileSync(cachePath, best);
  // キャッシュ無し時の絶対下限チェック（極端に短い）
  const incomplete = !cachedText && bestLines < 20;
  console.log(`  Fetched ${bestLines} lines from Genius${incomplete ? ' (suspiciously short, no cache — skip [B])' : ''}`);
  return { lines: bestLines, incomplete };
}

// --- Main ---
const argv = process.argv.slice(2);

if (argv.includes('--update-dup-baseline')) {
  updateBaseline();
  process.exit(0);
}

let anyFailed = false;

// Item 4: 定型句ガードは曲ファイル変更の有無に関わらず常に走らせる
if (checkDuplicateGuard()) anyFailed = true;

const changedPaths = argv.filter((a) => !a.startsWith('--'));
if (changedPaths.length === 0) {
  console.log('\nNo song files changed, skipping lyrics check.');
  if (anyFailed) {
    console.error('\n❌ Pre-push checks failed.');
    process.exit(1);
  }
  process.exit(0);
}

// Item 7: 評論家口調ガード（変更された曲のみ走査）
if (checkCriticTone(changedPaths)) anyFailed = true;

for (const filePath of changedPaths) {
  const slug = basename(filePath, '.astro');
  console.log(`\n🎵 Checking: ${slug}`);

  const meta = getSongMeta(slug);
  if (!meta) {
    console.warn(`  ⚠️  Song not found in songs.ts: ${slug} — skipping`);
    continue;
  }

  let incomplete = false;
  try {
    const r = await fetchLyrics(meta.title, meta.artist, slug);
    incomplete = r.incomplete;
  } catch (e) {
    console.warn(`  ⚠️  Genius fetch failed: ${e.message} — skipping`);
    continue;
  }

  try {
    // (b) 不完全フェッチ時は [B] をスキップ＋警告（誤検出で正しい記事を改変しない）
    execSync(
      `/usr/local/bin/node ${join(projectRoot, 'agent/src/check-lyrics-coverage.mjs')} ${slug}`,
      { stdio: 'inherit', cwd: projectRoot, env: { ...process.env, SKIP_B: incomplete ? '1' : '' } }
    );
  } catch {
    anyFailed = true;
  }
}

if (anyFailed) {
  console.error('\n❌ Pre-push checks failed. Fix issues before pushing.');
  process.exit(1);
}

console.log('\n✅ All pre-push checks passed.');
