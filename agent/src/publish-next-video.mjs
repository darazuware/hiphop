/**
 * publish-next-video.mjs
 *
 * video-queue の先頭エントリを videos.ts に追加して git push する
 *
 * 使い方:
 *   node agent/src/publish-next-video.mjs
 *
 * launchd から2日おきに自動実行される想定
 */

import 'dotenv/config';
import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const QUEUE_DIR = join(__dirname, '../video-queue');
const VIDEOS_TS = join(ROOT, 'src/data/videos.ts');
const LAST_PUBLISH_FILE = join(__dirname, '../video-queue/.last-published');
const INTERVAL_DAYS = 2;

// ────────────────────────────────────────────────────────────
// キューから次のエントリを取得
// ────────────────────────────────────────────────────────────

async function getNextEntry() {
  let files;
  try { files = await readdir(QUEUE_DIR); } catch { return null; }

  const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
  if (jsonFiles.length === 0) return null;

  const filePath = join(QUEUE_DIR, jsonFiles[0]);
  const entry = JSON.parse(await readFile(filePath, 'utf-8'));
  return { entry, filePath };
}

// ────────────────────────────────────────────────────────────
// videos.ts にエントリ追加
// ────────────────────────────────────────────────────────────

async function addToVideosTs(entry) {
  const content = await readFile(VIDEOS_TS, 'utf-8');
  const today = new Date().toISOString().slice(0, 10);

  const newEntry = `  {
    slug: "${entry.slug}",
    title: "${entry.title.replace(/"/g, '\\"')}",
    artists: "${entry.artists.replace(/"/g, '\\"')}",
    artistSlug: "${entry.artistSlug || 'eminem'}",
    youtubeId: "${entry.youtubeId}",
    type: "${entry.type}",
    year: ${entry.year},
    tag: "${entry.tag.replace(/"/g, '\\"')}",
    pubDate: "${today}",
  },`;

  // export const videos: Video[] = [ の直後に挿入
  const updated = content.replace(
    /export const videos: Video\[\] = \[/,
    `export const videos: Video[] = [\n${newEntry}`
  );

  await writeFile(VIDEOS_TS, updated, 'utf-8');
  console.log(`  ✅ videos.ts に追加: ${entry.slug}`);
}

// ────────────────────────────────────────────────────────────
// ビルド確認
// ────────────────────────────────────────────────────────────

function buildCheck() {
  console.log('  🔨 npm run build...');
  execSync('npm run build', { cwd: ROOT, stdio: 'pipe' });
  console.log('  ✅ ビルド成功');
}

// ────────────────────────────────────────────────────────────
// git add → commit → push
// ────────────────────────────────────────────────────────────

function gitPublish(entry) {
  const astroRelPath = entry.astroPath.replace(ROOT + '/', '');
  execSync(
    `git add src/data/videos.ts "${astroRelPath}"`,
    { cwd: ROOT, stdio: 'pipe' }
  );
  execSync(
    `git commit -m "feat(videos): publish ${entry.slug} (${entry.type} ${entry.year})\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"`,
    { cwd: ROOT, stdio: 'pipe' }
  );
  execSync('git push', { cwd: ROOT, stdio: 'pipe' });
  console.log('  ✅ git push 完了');
}

// ────────────────────────────────────────────────────────────
// メイン
// ────────────────────────────────────────────────────────────

async function checkInterval() {
  try {
    const last = await readFile(LAST_PUBLISH_FILE, 'utf-8');
    const lastDate = new Date(last.trim());
    const diffDays = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < INTERVAL_DAYS) {
      console.log(`ℹ️  前回公開から${diffDays.toFixed(1)}日。${INTERVAL_DAYS}日おき設定のためスキップ。`);
      return false;
    }
  } catch {
    // ファイルなし = 初回
  }
  return true;
}

async function main() {
  // --force フラグで間隔チェックをスキップ
  const force = process.argv.includes('--force');
  if (!force && !(await checkInterval())) process.exit(0);

  console.log('📋 キュー確認中...');
  const result = await getNextEntry();

  if (!result) {
    console.log('ℹ️  キューが空です。');
    console.log('   記事を追加: node agent/src/generate-video-article.mjs [YouTube URL]');
    process.exit(0);
  }

  const { entry, filePath } = result;
  console.log(`📢 公開: ${entry.slug} (${entry.type} ${entry.year})`);
  console.log(`   タイトル: ${entry.title}`);

  await addToVideosTs(entry);

  try {
    buildCheck();
  } catch (e) {
    // ビルド失敗したら videos.ts を元に戻す
    console.error('❌ ビルド失敗。videos.ts を元に戻します。');
    execSync('git checkout src/data/videos.ts', { cwd: ROOT, stdio: 'pipe' });
    process.exit(1);
  }

  gitPublish(entry);

  // 最終公開日を記録
  await writeFile(LAST_PUBLISH_FILE, new Date().toISOString(), 'utf-8');

  // キューから削除
  await unlink(filePath);
  console.log(`  🗑️  キューから削除: ${filePath}`);

  // 残りキュー数を表示
  let remaining = [];
  try { remaining = (await readdir(QUEUE_DIR)).filter(f => f.endsWith('.json')); } catch {}
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ 公開完了: https://waxthink.com/videos/${entry.slug}`);
  console.log(`📋 残りキュー: ${remaining.length}件`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(e => { console.error('❌ エラー:', e.message); process.exit(1); });
