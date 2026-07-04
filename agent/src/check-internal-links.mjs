#!/usr/bin/env node
/**
 * 内部リンク検証ガード（デッドリンク厳禁ルールの機械化）。
 *
 * ビルド済み dist/ の全HTMLを走査し、
 *   [L1] デッドリンク: 内部 href / src の参照先が dist に存在しない → ❌ ブロック
 *   [L2] 内部リンク数: 曲ページのコンテンツ内部リンク（/songs /artists /columns /slang）が
 *        下限未満 → ⚠️ 警告のみ（LINK_MIN で調整、デフォルト 8）
 *
 * 使い方:
 *   npm run build && node agent/src/check-internal-links.mjs          # 全ページ
 *   node agent/src/check-internal-links.mjs --slug nas-is-like        # 1曲のみ（distは全体走査の対象外にしない）
 *
 * 出力はURLとカウントのみ（ページ本文・歌詞テキストは一切出さない）。
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const projectRoot = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const DIST = join(projectRoot, "dist");
const LINK_MIN = Number(process.env.LINK_MIN || 8);
const SITE = "https://waxthink.com";

if (!existsSync(DIST)) {
  console.error("❌ dist/ がありません。先に npm run build を実行してください。");
  process.exit(1);
}

const argv = process.argv.slice(2);
const slugFilter = argv.includes("--slug") ? argv[argv.indexOf("--slug") + 1] : null;

// --- dist の全ファイルを列挙し、有効ターゲット集合を作る ---
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(DIST);

const valid = new Set();
for (const f of files) {
  const rel = "/" + relative(DIST, f).split("\\").join("/");
  valid.add(rel); // /songs/cream/index.html や /_astro/x.css そのもの
  if (rel.endsWith("/index.html")) {
    const route = rel.slice(0, -"/index.html".length) || "/";
    valid.add(route);
    valid.add(route === "/" ? "/" : route + "/");
  } else if (rel.endsWith(".html")) {
    valid.add(rel.slice(0, -".html".length));
  }
}

// --- HTMLから内部リンクを抽出して検証 ---
function normalize(url) {
  let u = url.trim();
  if (u.startsWith(SITE)) u = u.slice(SITE.length) || "/";
  u = u.split("#")[0].split("?")[0];
  if (u === "") return null; // 純アンカー/クエリのみ → ページ内 = OK
  try { u = decodeURI(u); } catch {}
  return u;
}

const htmlPages = files.filter((f) => f.endsWith(".html"));
const dead = []; // { page, target }
const songLinkCounts = []; // { route, count }

for (const f of htmlPages) {
  const rel = "/" + relative(DIST, f).split("\\").join("/");
  const route = rel.endsWith("/index.html") ? rel.slice(0, -"/index.html".length) || "/" : rel;
  const slugMatch = route.match(/^\/songs\/([^/]+)$/);
  if (slugFilter && (!slugMatch || slugMatch[1] !== slugFilter)) continue;

  const html = readFileSync(f, "utf-8");
  const targets = new Set();
  const re = /(?:href|src)=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1];
    if (/^(https?:|mailto:|tel:|data:|javascript:|#|\/\/)/.test(raw) && !raw.startsWith(SITE)) continue;
    if (!raw.startsWith("/") && !raw.startsWith(SITE)) continue; // 相対パスはAstroでは出ない前提
    const t = normalize(raw);
    if (t === null) continue;
    targets.add(t);
    if (!valid.has(t) && !valid.has(t.replace(/\/$/, "")) && !valid.has(t + "/")) {
      dead.push({ page: route, target: t });
    }
  }

  if (slugMatch) {
    const contentLinks = [...targets].filter((t) =>
      /^\/(songs|artists|columns|slang)(\/|$)/.test(t) && t !== route && !t.endsWith(".png") && !t.endsWith(".jpg")
    );
    songLinkCounts.push({ route, count: contentLinks.length });
  }
}

// --- レポート ---
let failed = false;

if (dead.length > 0) {
  failed = true;
  console.error(`\n❌ [L1] デッドリンク ${dead.length} 件:`);
  const seen = new Set();
  for (const d of dead) {
    const key = `${d.page} -> ${d.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.error(`   ${d.page}  →  ${d.target}`);
  }
} else {
  console.log(`✅ [L1] デッドリンクなし（${htmlPages.length}ページ走査）`);
}

const thin = songLinkCounts.filter((s) => s.count < LINK_MIN);
if (thin.length > 0) {
  console.warn(`\n⚠️  [L2] 内部リンクが ${LINK_MIN} 本未満の曲ページ（警告のみ）:`);
  for (const s of thin.sort((a, b) => a.count - b.count)) {
    console.warn(`   ${s.route}  (${s.count}本)`);
  }
} else if (songLinkCounts.length > 0) {
  console.log(`✅ [L2] 全曲ページの内部リンク ≥ ${LINK_MIN} 本`);
}

process.exit(failed ? 1 : 0);
