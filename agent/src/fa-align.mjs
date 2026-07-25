#!/usr/bin/env node
/**
 * フォースドアライメント（Demucs分離＋torchaudio MMS_FA）で単語ごとの秒数を出す。
 * whisper文字起こしと違い「既知の歌詞」を音声に強制整列するため、rap・反復コーラスでも
 * 取り違えが起きにくく、語間の「間」も正確に取れる（＝gap分割の土台）。
 *
 * 出力: agent/{slug}/assets/fa_words.json  … cueごとの [{w,s,e}]
 * 依存: agent/.fa-venv（無ければ自動作成し torch/torchaudio/demucs/soundfile を入れる）
 *
 * Usage:
 *   node agent/src/fa-align.mjs --slug <slug>                 # full-cues.json  → fa_words.json
 *   node agent/src/fa-align.mjs --slug <slug> --source lines  # full-lines.json → fa_words_lines.json
 *
 * --source lines は「キューを作る前の生の歌詞行」に整列する。意味分割(semantic-chunk.mjs)は
 * この行単位の語秒を土台にするので、既存キューの切れ目に縛られない。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT = path.resolve(__dirname, "..");
const REPO = path.resolve(AGENT, "..");
const VENV = path.join(AGENT, ".fa-venv");
const PY = path.join(VENV, "bin", "python");
const PY_SYS = "/opt/homebrew/bin/python3.12";

const getArg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const slug = getArg("slug");
if (!slug) { console.error("Usage: node agent/src/fa-align.mjs --slug <slug>"); process.exit(1); }

const source = getArg("source", "cues");
const SRC = source === "lines" ? "full-lines.json" : "full-cues.json";
const OUT = source === "lines" ? "fa_words_lines.json" : "fa_words.json";

const assets = path.join(AGENT, slug, "assets");
if (!fs.existsSync(path.join(assets, SRC))) { console.error(`[fa-align] ${assets}/${SRC} が無い`); process.exit(2); }

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", ...opts });
  if (r.status !== 0) { console.error(`[fa-align] 失敗: ${cmd} ${cmdArgs.join(" ")}`); process.exit(r.status || 1); }
}

if (!fs.existsSync(PY)) {
  if (!fs.existsSync(PY_SYS)) { console.error(`[fa-align] ${PY_SYS} が無い（brew install python@3.12）`); process.exit(3); }
  console.log("[fa-align] .fa-venv を作成中（初回のみ・torch等DL）...");
  run(PY_SYS, ["-m", "venv", VENV]);
  run(PY, ["-m", "pip", "install", "-q", "--upgrade", "pip"]);
  run(PY, ["-m", "pip", "install", "torch", "torchaudio", "demucs", "soundfile"]);
}

run(PY, [path.join(AGENT, "src", "fa-align.py"), assets, SRC, OUT], { cwd: REPO });
console.log(`[fa-align] OK -> agent/${slug}/assets/${OUT}`);
