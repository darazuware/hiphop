#!/usr/bin/env node
/**
 * archive/songs-thin/removed-songs-entries.txt から曲エントリを songs.ts に復元する（tier=core・pubDate更新）。
 * Usage: node agent/src/restore-song-entry.mjs --slug {slug} [--pubDate YYYY-MM-DD]
 */
import fs from "fs";
const a = process.argv;
const slug = a[a.indexOf("--slug") + 1];
const pd = a.includes("--pubDate") ? a[a.indexOf("--pubDate") + 1] : new Date().toISOString().slice(0, 10);
if (!slug) { console.error("--slug required"); process.exit(2); }
const src = fs.readFileSync("archive/songs-thin/removed-songs-entries.txt", "utf8").split("\n");
const line = src.find((l) => new RegExp(`slug: ['"]/songs/${slug}['"]`).test(l));
if (!line) { console.error(`entry not found: ${slug}`); process.exit(1); }
let songs = fs.readFileSync("src/data/songs.ts", "utf8");
if (new RegExp(`slug: ['"]/songs/${slug}['"]`).test(songs)) { console.log("already present"); process.exit(0); }
const entry = line
  .replace(/pubDate: ['"][^'"]+['"]/, `pubDate: "${pd}"`)
  .replace(/tier: ['"]thin['"]/, `tier: "core"`);
const marker = songs.lastIndexOf("\n];");
const idx = songs.search(/\n\];\s*\n/);
if (idx < 0) { console.error("array end not found"); process.exit(1); }
songs = songs.slice(0, idx) + "\n" + entry + songs.slice(idx);
fs.writeFileSync("src/data/songs.ts", songs);
console.log(`restored ${slug}`);
