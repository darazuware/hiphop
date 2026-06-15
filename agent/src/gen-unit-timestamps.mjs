#!/usr/bin/env node
/**
 * learning型ページの units-timestamps.json を whisper で自動生成する（bot組込用）。
 * 歌詞テキストは一切出力しない（秒数・カウント・スコアのみ）。
 *
 * Usage:
 *   node agent/src/gen-unit-timestamps.mjs --slug cream [--offset 0]
 *
 * フロー:
 *   1. learning判定: agent/{slug}/assets/units.json が在るか。無ければ従来型 → skip(exit 0)。
 *   2. 基準youtubeId取得: src/pages/songs/{slug}.astro の `const YT = "..."`。
 *      ── 頭出しリンク(▶ X:XX)はこの YT を使う。whisper用DL音源を必ず同一動画にし、
 *         尺ズレ(album音源とPVのイントロ差)を構造的に排除する。同一ソースなので offset=0 が既定。
 *   3. yt-dlp で YT の音声をDL → ffmpeg で 16kHz mono wav → agent/{slug}/assets/audio.mp3 も保存。
 *   4. whisper-cli (ggml-small.en.bin) で単語トークン付きJSON(/tmp/{slug}_whisper.json)。
 *   5. extract-unit-timestamps.mjs で units-timestamps.json を生成（whisperSec/manualSec二層）。
 *
 * whisper精度が低い場合（大人数曲など）:
 *   extract側が score<0.5 を捨て fallbackT に落とし、未マッチは source="none"/approx で残す。
 *   その曲は実測上書き(set-manual-timestamp.mjs)前提。本スクリプトは file が出来れば exit 0 で
 *   先へ進める（低信頼でも push を止めない＝後で manualSec を焼く運用）。
 *   DL/whisper自体が落ちた時のみ exit 2（呼び出し側で警告）。
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

function getArg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const slug = getArg("slug");
if (!slug) { console.error("Usage: --slug <slug> [--offset 0]"); process.exit(2); }
const offset = getArg("offset", "0");

const unitsPath = `agent/${slug}/assets/units.json`;
const astroPath = `src/pages/songs/${slug}.astro`;
const assetsDir = `agent/${slug}/assets`;
const audioPath = `${assetsDir}/audio.mp3`;
const wavPath = `/tmp/${slug}_whisper.wav`;
const whisperJson = `/tmp/${slug}_whisper.json`;
const outPath = `${assetsDir}/units-timestamps.json`;

// 1. learning判定
if (!fs.existsSync(unitsPath)) {
  console.log(`[ts] ${slug}: units.json なし → 従来型/対象外、スキップ`);
  process.exit(0);
}

// 2. 基準youtubeId（頭出しリンクと同一）
let yt = null;
try {
  const astro = fs.readFileSync(astroPath, "utf8");
  yt = astro.match(/const\s+YT\s*=\s*["']([\w-]{6,})["']/)?.[1] || null;
} catch {}
if (!yt) {
  console.error(`[ts] ${slug}: .astro の const YT が取れない → 頭出し基準動画不明、スキップ(exit2)`);
  process.exit(2);
}

// whisperモデル解決
const MODEL = process.env.WHISPER_MODEL || [
  "/opt/homebrew/Cellar/whisper-cpp/1.8.4/share/whisper-cpp/ggml-small.en.bin",
  `${process.env.HOME}/.cache/hyperframes/whisper/models/ggml-small.en.bin`,
].find(p => fs.existsSync(p));
if (!MODEL) { console.error("[ts] ggml-small.en.bin が見つからない"); process.exit(2); }

const sh = (cmd) => execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] });

try {
  fs.mkdirSync(assetsDir, { recursive: true });
  // 3. DL（頭出し基準 = whisper入力 を同一動画に固定）
  console.log(`[ts] ${slug}: yt-dlp ${yt} → audio`);
  sh(`yt-dlp -x --audio-format mp3 -o "${audioPath}" "https://www.youtube.com/watch?v=${yt}"`);
  sh(`ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 "${wavPath}" -loglevel error`);
  // 4. whisper（単語トークン付き）
  console.log(`[ts] ${slug}: whisper-cli (small.en)`);
  sh(`whisper-cli -m "${MODEL}" -f "${wavPath}" -ojf -of "/tmp/${slug}_whisper" -np`);
  if (!fs.existsSync(whisperJson)) { console.error("[ts] whisper JSON 不生成"); process.exit(2); }
} catch (e) {
  console.error(`[ts] DL/whisper 失敗: ${(e.message || "").split("\n")[0]}`);
  process.exit(2);
}

// 5. extract（同一ソースなので offset 既定0）
console.log(`[ts] ${slug}: extract-unit-timestamps (offset=${offset})`);
try {
  execSync(
    `node agent/src/extract-unit-timestamps.mjs --slug ${slug} --whisper "${whisperJson}" --units "${unitsPath}" --out "${outPath}" --offset ${offset}`,
    { stdio: "inherit" }
  );
} catch {
  // extract は「全ユニット整列せず」だと exit 1。低信頼でも file は出来ている前提で続行。
}

if (!fs.existsSync(outPath)) { console.error("[ts] units-timestamps.json 不生成"); process.exit(2); }
const r = JSON.parse(fs.readFileSync(outPath, "utf8"));
const lowConf = r.filter(u => u.source === "whisper" && u.score < 0.75).length;
const none = r.filter(u => u.source === "none").length;
console.log(`[ts] ${slug}: ${outPath} 生成 (${r.length}units, lowconf=${lowConf}, unmatched=${none})`);
if (lowConf || none) console.log(`[ts] ⚠ 要実測確認: set-manual-timestamp.mjs で manualSec を焼く（docs/timestamp-override.md）`);
process.exit(0);
