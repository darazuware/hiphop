#!/usr/bin/env node
/**
 * check-youtube.mjs
 * Usage: node agent/src/check-youtube.mjs <slug> [slug2 ...]
 *        node agent/src/check-youtube.mjs src/pages/songs/foo.astro
 *
 * 各曲の .astro から youtubeId / sampleYoutubeId / youtubeShortId を抽出し、
 * YouTube oEmbed API で「実在する埋め込み可能な動画か」を検証する。
 *
 * 判定:
 *   - youtubeId 未設定/空        → ❌（全記事にメイン動画必須）
 *   - youtubeId が oEmbed 404    → ❌（死んだ/誤ったID）
 *   - sample/short が設定済みで404 → ❌
 *   - sample/short 未設定         → スキップ（任意）
 *
 * 歌詞テキストは一切出力しない（属性値のみ参照）。
 * 失敗が1件でもあれば exit 1。
 */

import fs from "node:fs";
import path from "node:path";

const projectRoot = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");

function toSlug(arg) {
  return path.basename(arg, ".astro");
}

async function oembedAlive(id) {
  const url =
    "https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=" + id;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
      if (r.status >= 500) {
        await new Promise((res) => setTimeout(res, 1200));
        continue;
      }
      return false; // 404/401 = 存在しない/埋め込み不可
    } catch {
      await new Promise((res) => setTimeout(res, 1200));
    }
  }
  return false;
}

function extract(content, field) {
  const m = content.match(new RegExp(field + '=["\']([^"\']*)["\']'));
  return m ? m[1].trim() : null; // null = フィールド自体が無い, "" = 空
}

let args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node agent/src/check-youtube.mjs <slug> [slug2 ...] | --all");
  process.exit(1);
}
if (args.includes("--all")) {
  const dir = path.join(projectRoot, "src/pages/songs");
  args = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".astro"))
    .map((f) => f.replace(/\.astro$/, ""));
}

let anyFailed = false;

for (const arg of args) {
  const slug = toSlug(arg);
  const file = path.join(projectRoot, "src/pages/songs", `${slug}.astro`);
  if (!fs.existsSync(file)) {
    console.warn(`⚠️  ${slug}: .astro が見つからない — スキップ`);
    continue;
  }
  const content = fs.readFileSync(file, "utf-8");

  console.log(`\n🎬 YouTube check: ${slug}`);

  // メイン動画（必須）
  const main = extract(content, "youtubeId");
  if (main === null || main === "") {
    console.log("  ❌ youtubeId 未設定 — メイン動画の埋め込みがありません");
    anyFailed = true;
  } else if (!(await oembedAlive(main))) {
    console.log(`  ❌ youtubeId が無効（404/埋め込み不可）: ${main}`);
    anyFailed = true;
  } else {
    console.log(`  ✅ youtubeId OK: ${main}`);
  }

  // サンプル元曲・ショート（任意。設定済みなら生存必須）
  for (const field of ["sampleYoutubeId", "youtubeShortId"]) {
    const val = extract(content, field);
    if (val === null || val === "") continue; // 未設定はOK
    if (!(await oembedAlive(val))) {
      console.log(`  ❌ ${field} が無効（404/埋め込み不可）: ${val}`);
      anyFailed = true;
    } else {
      console.log(`  ✅ ${field} OK: ${val}`);
    }
  }
}

if (anyFailed) {
  console.error("\n❌ YouTube check failed. 無効/未設定の埋め込みIDを修正してください。");
  process.exit(1);
}
console.log("\n✅ All YouTube checks passed.");
