#!/usr/bin/env node
/**
 * 曲記事の和訳（LearningUnit の eng/jpn）が、同じ曲の字幕ショート（agent/subvideo/*\/lines.json）の和訳と一致しているか検査する。
 * 恒久ルール（2026-10-28）: 字幕ショートを公開済みの曲は、記事の和訳・意訳をショートに揃える。
 *
 * Usage: node agent/src/check-short-sync.mjs {slug}
 *   ショートの各行（3語以上）が記事の eng 行に含まれていれば、その和訳が記事の jpn に含まれることを要求する。
 *   subvideo は git 管理外のため、このworktreeとメインworktreeの両方を探す。出力に英語歌詞は出さない。
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const slug = process.argv[2];
if (!slug) { console.error("Usage: node agent/src/check-short-sync.mjs <slug>"); process.exit(2); }

const norm = (s) => s.toLowerCase().replace(/[’‘`]/g, "'").replace(/<[^>]+>/g, " ").replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
const normJ = (s) => s.replace(/<[^>]+>/g, "").replace(/[\s、。，．・？！?!「」『』（）()／/…]/g, "");

const roots = new Set([path.resolve("agent/subvideo")]);
try {
  const main = execFileSync("git", ["worktree", "list", "--porcelain"], { encoding: "utf8" }).split("\n")[0].replace(/^worktree /, "");
  roots.add(path.join(main, "agent/subvideo"));
} catch { /* git外 */ }

// 同じ曲のショートだけを対象にする（meta.json の sourceTitle に曲名を含むもの）。別曲での引用・サンプルは除外。
const flat = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const songLine = fs.readFileSync("src/data/songs.ts", "utf8").split("\n").find((l) => l.includes(`/songs/${slug}'`) || l.includes(`/songs/${slug}"`)) || "";
const songTitle = flat(songLine.match(/title:\s*(["'])(.*?)\1\s*,/)?.[2] || "");
if (!songTitle) { console.log(`ℹ️  [SYN] ${slug}: songs.ts に曲名なし（スキップ）`); process.exit(0); }
const shortLines = [];
for (const r of roots) {
  if (!fs.existsSync(r)) continue;
  for (const d of fs.readdirSync(r)) {
    const f = path.join(r, d, "lines.json");
    if (!fs.existsSync(f)) continue;
    const metaF = path.join(r, d, "meta.json");
    const src = fs.existsSync(metaF) ? JSON.parse(fs.readFileSync(metaF, "utf8")).sourceTitle || "" : "";
    if (!flat(src).includes(songTitle)) continue;
    for (const [e, j] of JSON.parse(fs.readFileSync(f, "utf8"))) {
      const n = norm(e);
      if (n.split(" ").length >= 3 && j) shortLines.push({ dir: d, n, j });
    }
  }
}

const src = fs.readFileSync(`src/pages/songs/${slug}.astro`, "utf8");
const units = [...src.matchAll(/<LearningUnit[\s\S]*?<\/LearningUnit>/g)].map((m) => m[0]);
let checked = 0, bad = 0;
const dirs = new Set();
units.forEach((u, i) => {
  const eng = u.match(/<Fragment slot="eng">([\s\S]*?)<\/Fragment>/)?.[1];
  const jpn = u.match(/<Fragment slot="jpn">([\s\S]*?)<\/Fragment>/)?.[1] || "";
  if (!eng) return;
  const engN = norm(eng);
  const heading = u.match(/heading="([^"]*)"/)?.[1] || `unit${i + 1}`;
  const need = [...new Set(shortLines.filter((s) => engN.includes(s.n)).map((s) => { dirs.add(s.dir); return s.j; }))];
  for (const j of need) {
    checked++;
    if (!normJ(jpn).includes(normJ(j))) {
      bad++;
      console.log(`❌ [SYN] unit${i + 1}（${heading.replace(/[A-Za-z'’,.?!]+/g, "").trim().slice(0, 30)}）: ショート和訳「${j}」が記事の和訳に無い（記事側「${jpn.replace(/<[^>]+>/g, "")}」）`);
    }
  }
});

if (!checked) { console.log(`ℹ️  [SYN] ${slug}: 同じ曲の字幕ショートなし（スキップ）`); process.exit(0); }
if (bad) { console.log(`❌ [SYN] ${slug}: ${bad}/${checked}件がショート（${[...dirs].join(", ")}）の和訳と不一致`); process.exit(1); }
console.log(`✅ [SYN] ${slug}: ${checked}件ともショート（${[...dirs].join(", ")}）の和訳と一致`);
