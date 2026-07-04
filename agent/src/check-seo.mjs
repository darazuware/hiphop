#!/usr/bin/env node
/**
 * SEO lint（ビルド済み dist/ の <head> を機械検証）。
 *
 *   [S1] <title> 欠落・全ページ間の完全重複 → ❌
 *   [S2] meta description 欠落・全ページ間の完全重複 → ❌
 *   [S3] description の長さ（日本語 50〜160字推奨）→ ⚠️ 警告のみ
 *   [S4] <h1> が 0 個 or 2 個以上 → ⚠️ 警告のみ
 *   [S5] canonical 欠落 → ❌
 *
 * noindex ページ（thin曲など）は S1/S2 の重複判定・S3 から除外する。
 * 出力は URL・タイトル・カウントのみ（本文・歌詞は出さない）。
 *
 * 使い方: npm run build && node agent/src/check-seo.mjs [--slug {slug}]
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const projectRoot = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const DIST = join(projectRoot, "dist");

if (!existsSync(DIST)) {
  console.error("❌ dist/ がありません。先に npm run build を実行してください。");
  process.exit(1);
}

const argv = process.argv.slice(2);
const slugFilter = argv.includes("--slug") ? argv[argv.indexOf("--slug") + 1] : null;

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".html")) files.push(p);
  }
})(DIST);

const pages = [];
for (const f of files) {
  const rel = "/" + relative(DIST, f).split("\\").join("/");
  const route = rel.endsWith("/index.html") ? rel.slice(0, -"/index.html".length) || "/" : rel;
  if (route === "/404") continue;
  const slugMatch = route.match(/^\/songs\/([^/]+)$/);
  if (slugFilter && (!slugMatch || slugMatch[1] !== slugFilter)) continue;

  const html = readFileSync(f, "utf-8");
  const head = html.match(/<head[\s\S]*?<\/head>/)?.[0] ?? "";
  const title = head.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? null;
  const desc = head.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1] ?? null;
  const canonical = /<link\s+rel="canonical"/.test(head);
  const noindex = /<meta\s+name="robots"\s+content="[^"]*noindex/.test(head);
  const h1Count = (html.match(/<h1[\s>]/g) || []).length;
  pages.push({ route, title, desc, canonical, noindex, h1Count });
}

let failed = false;
const indexable = pages.filter((p) => !p.noindex);

// S1: title
const noTitle = pages.filter((p) => !p.title);
if (noTitle.length) {
  failed = true;
  console.error(`❌ [S1] <title> 欠落: ${noTitle.map((p) => p.route).join(", ")}`);
}
const byTitle = new Map();
for (const p of indexable) {
  if (!p.title) continue;
  byTitle.set(p.title, [...(byTitle.get(p.title) || []), p.route]);
}
const dupTitles = [...byTitle.entries()].filter(([, rs]) => rs.length > 1);
if (dupTitles.length) {
  failed = true;
  console.error(`❌ [S1] title重複:`);
  for (const [t, rs] of dupTitles) console.error(`   "${t}" ← ${rs.join(", ")}`);
}
if (!noTitle.length && !dupTitles.length) console.log(`✅ [S1] title 全${pages.length}ページOK`);

// S2: description
const noDesc = indexable.filter((p) => p.desc == null || p.desc === "");
if (noDesc.length) {
  failed = true;
  console.error(`❌ [S2] description 欠落: ${noDesc.map((p) => p.route).join(", ")}`);
}
const byDesc = new Map();
for (const p of indexable) {
  if (!p.desc) continue;
  byDesc.set(p.desc, [...(byDesc.get(p.desc) || []), p.route]);
}
const dupDescs = [...byDesc.entries()].filter(([, rs]) => rs.length > 1);
if (dupDescs.length) {
  failed = true;
  console.error(`❌ [S2] description重複:`);
  for (const [, rs] of dupDescs) console.error(`   ${rs.join(", ")}`);
}
if (!noDesc.length && !dupDescs.length) console.log(`✅ [S2] description 全ページOK`);

// S3: description length（警告のみ）
const badLen = indexable.filter((p) => p.desc && (p.desc.length < 50 || p.desc.length > 160));
if (badLen.length) {
  console.warn(`⚠️  [S3] description 長さ推奨外（50〜160字）:`);
  for (const p of badLen) console.warn(`   ${p.route} (${p.desc.length}字)`);
} else {
  console.log(`✅ [S3] description 長さOK`);
}

// S4: h1（警告のみ）
const badH1 = pages.filter((p) => p.h1Count !== 1);
if (badH1.length) {
  console.warn(`⚠️  [S4] <h1> が1個でないページ:`);
  for (const p of badH1) console.warn(`   ${p.route} (${p.h1Count}個)`);
} else {
  console.log(`✅ [S4] h1 全ページOK`);
}

// S5: canonical
const noCanon = pages.filter((p) => !p.canonical);
if (noCanon.length) {
  failed = true;
  console.error(`❌ [S5] canonical 欠落: ${noCanon.map((p) => p.route).join(", ")}`);
} else {
  console.log(`✅ [S5] canonical 全ページOK`);
}

process.exit(failed ? 1 : 0);
