#!/usr/bin/env node
/**
 * 記事チェック・オーケストレータ — 1コマンドで全ガードを順次実行する。
 * 生成モデル（Opus/Sonnet等）がチェックを飛ばす余地を無くすための単一窓口。
 *
 * 使い方:
 *   node agent/src/check-article.mjs {slug}            # 全チェック（ビルド込み）
 *   node agent/src/check-article.mjs {slug} --no-build # 既存 dist を使う（時短）
 *
 * 実行順:
 *   1. [IMG]  check-cover-image.mjs   — カバー画像（asin設定済みならスキップ）
 *   2. [YT]   check-youtube.mjs       — YouTube埋め込みの実在
 *   3. [LYR]  pre-push-check.mjs      — 定型句(Item4)＋評論家口調(Item7)＋歌詞[B][C][D]
 *   4. [BLD]  npm run build           — ビルド成立
 *   5. [LNK]  check-internal-links.mjs — デッドリンク（サイト全体）＋内部リンク数
 *   6. [SEO]  check-seo.mjs           — title/description/canonical/h1
 *
 * 出力は各スクリプトのサマリーのみ（歌詞テキストは一切出さない）。
 * 全部 ✅ で exit 0。1つでも ❌ なら以降も実行した上で exit 1。
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const argv = process.argv.slice(2);
const slug = argv.find((a) => !a.startsWith("--"));
const noBuild = argv.includes("--no-build");

if (!slug) {
  console.error("Usage: node agent/src/check-article.mjs <slug> [--no-build]");
  process.exit(1);
}

const astroPath = join(projectRoot, "src/pages/songs", `${slug}.astro`);
if (!existsSync(astroPath)) {
  console.error(`❌ src/pages/songs/${slug}.astro がありません`);
  process.exit(1);
}

const results = [];
function step(label, cmd, { allowSkip = false } = {}) {
  console.log(`\n━━━ ${label} ━━━`);
  try {
    execSync(cmd, { stdio: "inherit", cwd: projectRoot });
    results.push({ label, ok: true });
  } catch {
    results.push({ label, ok: false });
  }
}

// 1. カバー画像（songs.ts に asin があれば Amazon 画像が使われるためスキップ）
const songsTs = readFileSync(join(projectRoot, "src/data/songs.ts"), "utf-8");
const entryRe = new RegExp(`slug:\\s*['"]/songs/${slug}['"][^}]*`);
const entry = songsTs.match(entryRe)?.[0] ?? "";
const hasAsin = /asin:\s*['"][A-Z0-9]{10}['"]/.test(entry);
if (hasAsin) {
  console.log("\n━━━ [IMG] カバー画像 ━━━\n⏭️  asin設定済みのためスキップ");
  results.push({ label: "[IMG] カバー画像", ok: true });
} else {
  step("[IMG] カバー画像", `node agent/src/check-cover-image.mjs ${slug}`);
}

// 2. YouTube
step("[YT] YouTube埋め込み", `node agent/src/check-youtube.mjs ${slug}`);

// 2.5 プレーヤー整合（learning型は learningPage={true} 必須 — 無いと固定プレーヤーバーが描画されない）
{
  console.log("\n━━━ [PLR] プレーヤー整合 ━━━");
  const astroSrc = readFileSync(astroPath, "utf-8");
  const isLearning = /<LearningUnit\b/.test(astroSrc);
  const hasLearningPageProp = /learningPage=\{true\}/.test(astroSrc);
  if (isLearning && !hasLearningPageProp) {
    console.error("❌ LearningUnit使用ページに learningPage={true} が無い → プレーヤーバーが表示されません");
    results.push({ label: "[PLR] プレーヤー整合", ok: false });
  } else if (isLearning && !/songDuration=\{\d+\}/.test(astroSrc)) {
    console.error("❌ learning型に songDuration が無い → 総再生時間/波形が出ません");
    results.push({ label: "[PLR] プレーヤー整合", ok: false });
  } else {
    console.log(isLearning ? "✅ learningPage / songDuration OK" : "⏭️  従来型（プレーヤー対象外）");
    results.push({ label: "[PLR] プレーヤー整合", ok: true });
  }
}

// 3. 定型句＋トーン＋歌詞（pre-push-check が Item4/Item7/[B][C][D] を一括実行）
step("[LYR] 歌詞・トーン・定型句", `node agent/src/pre-push-check.mjs src/pages/songs/${slug}.astro`);

// 4. ビルド
if (noBuild && existsSync(join(projectRoot, "dist"))) {
  console.log("\n━━━ [BLD] ビルド ━━━\n⏭️  --no-build 指定（既存distを使用）");
  results.push({ label: "[BLD] ビルド", ok: true });
} else {
  step("[BLD] ビルド", "npm run build");
}

// 5. 内部リンク（デッドリンクはサイト全体で検証 — 他ページから当該曲への逆リンク切れも拾う）
step("[LNK] 内部リンク", "node agent/src/check-internal-links.mjs");

// 6. SEO
step("[SEO] SEO lint", "node agent/src/check-seo.mjs");

// --- サマリー ---
console.log("\n══════════ サマリー ══════════");
for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.label}`);
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n❌ ${failed.length}項目が失敗。修正してから再実行: node agent/src/check-article.mjs ${slug}`);
  process.exit(1);
}
console.log(`\n✅ 全チェック通過: ${slug}`);
