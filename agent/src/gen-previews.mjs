#!/usr/bin/env node
/**
 * 試聴プレビュー用 Deezer track ID 解決 — src/data/previews.json を生成・更新する。
 *
 * 使い方:
 *   node agent/src/gen-previews.mjs --slug {slug}   # 1曲だけ解決（記事作成フロー用）
 *   node agent/src/gen-previews.mjs --all           # 未解決の全曲をバックフィル
 *   node agent/src/gen-previews.mjs --all --force   # 解決済みも再解決
 *
 * previews.json の形式: { "<slug>": { id, artist, title, album } | null }
 *   - null = Deezerで妥当なマッチが見つからなかった曲（ボタン非表示・キーは残す）
 * プレビューURLは有効期限付きトークンのため保存しない。再生時にクライアントが
 * JSONP（api.deezer.com/track/{id}?output=jsonp）で新鮮なURLを取得する。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const previewsPath = join(projectRoot, "src/data/previews.json");
const argv = process.argv.slice(2);
const force = argv.includes("--force");
const all = argv.includes("--all");
const slugArg = argv.includes("--slug") ? argv[argv.indexOf("--slug") + 1] : null;
const setArg = argv.includes("--set") ? argv[argv.indexOf("--set") + 1] : null;

if (!all && !slugArg && !setArg) {
  console.error("Usage: node agent/src/gen-previews.mjs --slug <slug> | --all [--force] | --set <slug>=<deezerTrackId>");
  process.exit(1);
}

function parseSongs() {
  const src = readFileSync(join(projectRoot, "src/data/songs.ts"), "utf-8");
  const songs = [];
  const lineRe = /\{\s*slug:\s*['"]\/songs\/([^'"]+)['"][\s\S]*?\},?\s*(?=\n)/g;
  for (const m of src.matchAll(lineRe)) {
    const body = m[0];
    const field = (name) => {
      const fm = body.match(new RegExp(`(?<![A-Za-z])${name}:\\s*'((?:[^'\\\\]|\\\\.)*)'`)) ||
                 body.match(new RegExp(`(?<![A-Za-z])${name}:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
      return fm ? fm[1].replace(/\\(["'\\])/g, "$1") : null;
    };
    songs.push({ slug: m[1], title: field("title"), artists: field("artists"), album: field("album") });
  }
  return songs;
}

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const BAD_RE = /\b(live|remix|megamix|mix|versión|re-?recorded|instrumental|karaoke|tribute|acapella|a cappella|sped up|slowed|chopped|screwed|8[- ]?bit|lullaby|made famous|edition|demo)\b/i;
const BAD_ARTIST_RE = /(karaoke|tribute|quartet|orchestra|lullaby|kidz|カルテット|オーケストラ|カラオケ)/i;
const JP_BAD_RE = /(ライヴ|ライブ|リミックス|インスト|アカペラ|カラオケ|デモ|エディット|ヴァージョン|バージョン)/;
const hasCJK = (s) => /[　-ヿ一-鿿]/.test(s || "");

function primaryArtist(artists) {
  return artists.split(/\s+feat\.?\s+|\s+ft\.?\s+/i)[0].trim();
}

const isAscii = (s) => /^[\x00-\x7F]*$/.test(s || "");

async function dz(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Deezer HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(`Deezer API: ${j.error.message || j.error.type}`);
  return j;
}

function pick(candidates, song, { strict = false } = {}) {
  const nt = norm(song.title);
  const nartist = norm(primaryArtist(song.artists));
  const nalbum = norm(song.album);
  let best = null;
  candidates.forEach((c, i) => {
    const ct = norm(c.title);
    const cjkTitle = hasCJK(c.title);
    let score;
    if (cjkTitle && !strict) {
      // ローカライズ題名（ハンブル等）は文字列照合不能。artist:+track:フィルタ済み
      // クエリ（query1）の結果に限り、ライヴ/リミックス等を除いて低スコアで許容
      if (JP_BAD_RE.test(c.title)) return;
      score = 40 - i * 2;
    } else {
      // タイトルは括弧書き（feat./Remaster等）除去後の完全一致のみ（Pt.II等の別曲を弾く）
      if (!ct || !nt || ct !== nt) return;
      // remix/live等は除外（元曲がタイトルに含む場合のみ許容）
      if (BAD_RE.test(c.title) && !BAD_RE.test(song.title)) return;
      score = 100 - i * 2;
    }
    if (BAD_ARTIST_RE.test(c.artist?.name ?? "")) return;
    // フォールバック検索（artist:フィルタ無し）でローカライズ名の照合不能な候補は
    // アルバム一致が無い限り採らない（カバー楽団等の誤ヒット防止）
    if (strict && !isAscii(c.artist?.name ?? "") && !(nalbum && norm(c.album?.title).includes(nalbum))) return;
    // ASCIIアーティスト名は正規化一致必須（Common vs Common Kings等の別人を弾く）。
    // 日本語ローカライズ名は照合不能のため検索クエリのフィルタを信頼する
    const ca = c.artist?.name ?? "";
    if (isAscii(ca)) {
      const nca = norm(ca);
      // 完全一致 or デュオ名の一部（Kool G Rap & DJ Polo に対する Kool G Rap）は許容。
      // 逆方向の包含（Common に対する Common Kings）は別人なので不可
      if (nca !== nartist && !(nca && nartist.includes(nca))) return;
    }
    if (nalbum && norm(c.album?.title).includes(nalbum)) score += 25;
    if (!best || score > best.score) best = { ...c, score };
  });
  return best;
}

async function resolve(song) {
  const artist = primaryArtist(song.artists);
  const queries = [
    `artist:"${artist}" track:"${song.title}"`,
    `${artist} ${song.title}`,
  ];
  const soloArtist = artist.split(/\s+&\s+/)[0].trim();
  if (soloArtist !== artist) queries.push(`${soloArtist} ${song.title}`);
  for (const [qi, q] of queries.entries()) {
    try {
      const j = await dz(`https://api.deezer.com/search/track?q=${encodeURIComponent(q)}&limit=10`);
      const best = pick(j.data || [], song, { strict: qi > 0 });
      if (best && best.preview) {
        return { id: best.id, artist: best.artist?.name ?? artist, title: best.title, album: best.album?.title ?? null };
      }
    } catch (e) {
      console.error(`  ⚠️ ${song.slug}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

const songs = parseSongs();
if (!songs.length) {
  console.error("❌ songs.ts のパースに失敗（0曲）");
  process.exit(1);
}
const previews = existsSync(previewsPath) ? JSON.parse(readFileSync(previewsPath, "utf-8")) : {};

function save() {
  const sorted = Object.fromEntries(Object.entries(previews).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(previewsPath, JSON.stringify(sorted, null, 2) + "\n");
  return Object.keys(sorted).length;
}

if (setArg) {
  const [s, idStr] = setArg.split("=");
  if (!s || !/^\d+$/.test(idStr || "")) {
    console.error("❌ --set の形式は <slug>=<deezerTrackId>");
    process.exit(1);
  }
  const t = await dz(`https://api.deezer.com/track/${idStr}`);
  if (!t.preview) {
    console.error(`❌ track ${idStr} に preview がありません`);
    process.exit(1);
  }
  previews[s] = { id: t.id, artist: t.artist?.name ?? null, title: t.title, album: t.album?.title ?? null, manual: true };
  save();
  console.log(`✅ [PRV] 手動設定: ${s} → id=${t.id} (${t.artist?.name} / ${t.title})`);
  process.exit(0);
}

const targets = slugArg
  ? songs.filter((s) => s.slug === slugArg)
  : songs.filter((s) => (force && !previews[s.slug]?.manual) || !(s.slug in previews));

if (slugArg && !targets.length) {
  console.error(`❌ songs.ts に slug=${slugArg} がありません`);
  process.exit(1);
}
if (slugArg && !force && slugArg in previews) {
  console.log(`✅ [PRV] ${slugArg}: 解決済み（${previews[slugArg] ? `id=${previews[slugArg].id}` : "Deezer未収録=null"}）`);
  process.exit(0);
}

let found = 0, missed = 0;
for (const song of targets) {
  const hit = await resolve(song);
  previews[song.slug] = hit;
  if (hit) { found++; console.log(`✅ ${song.slug} → id=${hit.id} (${hit.artist} / ${hit.title})`); }
  else { missed++; console.log(`⚠️ ${song.slug} → マッチなし（null記録・ボタン非表示）`); }
  await new Promise((r) => setTimeout(r, 250));
}

const total = save();
console.log(`\n📝 src/data/previews.json 更新: 解決${found} / 未収録${missed} / 総計${total}`);
