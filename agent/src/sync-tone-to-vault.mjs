#!/usr/bin/env node
// docs/tone-log/*.md を Obsidian Vault(hiphop-notes/tone/{slug}.md) へ冪等同期する。
// 各 tone-log ファイルはマーカー <!-- tone-log:{filename} --> で一度だけ追記される。
// 出力は slug と件数のみ（歌詞・解説本文はレスポンスに出さない）。
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const LOG_DIR = path.join(REPO, "docs/tone-log");
const VAULT_TONE = path.resolve(REPO, "../hiphop-notes/tone");

if (!fs.existsSync(LOG_DIR)) { console.log("no tone-log dir"); process.exit(0); }
if (!fs.existsSync(VAULT_TONE)) fs.mkdirSync(VAULT_TONE, { recursive: true });

const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith(".md"));
let synced = 0, skipped = 0;

for (const f of files) {
  // YYYY-MM-DD-{slug}.md
  const m = f.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
  if (!m) continue;
  const [, date, slug] = m;
  const src = fs.readFileSync(path.join(LOG_DIR, f), "utf8");
  const target = path.join(VAULT_TONE, `${slug}.md`);
  const marker = `<!-- tone-log:${f} -->`;

  let note = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  if (note === null) {
    note = `---\ntype: tone\nslug: ${slug}\ncreated: ${date}\ntags: [tone]\n---\n\n# ${slug} トーンメモ\n`;
  }
  if (note.includes(marker)) { skipped++; continue; }

  const block = `\n## tone-log ${date}\n${marker}\n\n${src.trim()}\n`;
  fs.writeFileSync(target, note.replace(/\s*$/, "\n") + block);
  synced++;
  console.log(`synced: ${slug} <- ${f}`);
}

console.log(`done. synced=${synced} skipped=${skipped}`);
