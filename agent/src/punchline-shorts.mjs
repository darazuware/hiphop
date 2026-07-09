#!/usr/bin/env node
/**
 * punchline-shorts.mjs — パンチライン切り抜きショート量産システム
 *
 * サイト非掲載・SNS手動アップロード用。黒背景+白文字のみ（PV・音源を含まない無音動画）。
 * 音源は各SNSアプリ内サウンドを使う前提で、caption.txt に「サウンド開始位置」を出力する。
 *
 * Usage:
 *   node agent/src/punchline-shorts.mjs init   --slug <slug>   # 候補抽出+whisperアライメント → punchlines.json
 *   node agent/src/punchline-shorts.mjs render --slug <slug>   # clips[] を無音mp4+caption.txtに量産
 *   node agent/src/punchline-shorts.mjs check  --slug <slug>   # DoD機械検証（exit 0/1）
 *
 * データ: agent/<slug>/assets/punchlines.json
 *   candidates[] … 記事(.astro)のeng/jpnペア＋whisperで解決した絶対秒(abs)
 *   clips[]      … 手で選ぶパンチライン { id, hook, lines:[候補index...], songStartSec?, durationSec?, tManual? }
 * 出力: agent/shorts-out/<slug>/<slug>--<clipId>.mp4 / .caption.txt （gitignore対象）
 *
 * 【重要】歌詞テキストをstdoutに出力しない。件数・秒数のみ報告する。
 */

import fs from "fs";
import path from "path";
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";

process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const AGENT = path.resolve(__dirname, "..");

const WHISPER_MODEL = "/opt/homebrew/share/whisper-cpp/ggml-small.en.bin";
const OUT_ROOT = path.join(AGENT, "shorts-out");
const MIN_DUR = 15;
const MAX_DUR = 40;
const LEAD_IN = 1.6; // 音源開始からファーストラインまでの余白（タイトルカード表示時間）
const OUTRO = 3.0;   // 最終ライン開始からクリップ終端までの余白

// ── args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const cmd = args[0];
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  if (i !== -1) return args[i + 1];
  return args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}
const slug = getArg("slug");
const onlyClip = getArg("clip");

if (!["init", "render", "check"].includes(cmd) || !slug) {
  console.error("Usage: node agent/src/punchline-shorts.mjs <init|render|check> --slug <slug> [--clip <id>]");
  process.exit(1);
}

const astroFile = path.join(ROOT, "src/pages/songs", `${slug}.astro`);
const audioDir = path.join(AGENT, "audio");
const audioFile = path.join(audioDir, `${slug}.mp3`);
const whisperCache = path.join(audioDir, `${slug}.whisper.json`);
const assetsDir = path.join(AGENT, slug, "assets");
const dataFile = path.join(assetsDir, "punchlines.json");
const outDir = path.join(OUT_ROOT, slug);

// ── shared helpers ────────────────────────────────────────────────────────────
const STOP_WORDS = new Set(["the","a","an","in","on","at","is","are","was","were","i","my","to","of","and","or","but","so","for","with","it","its","this","that","we","you","he","she","they","them","our","your","be","do","did","have","had","not","no","up","out","as","if","by"]);
function normalize(t) { return t.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim(); }
function expandCensor(s) {
  return s
    .replace(/f\*+k/gi, "fuck")
    .replace(/n\*+(a|er)/gi, (_, g) => "nigg" + g)
    .replace(/b\*+h/gi, "bitch")
    .replace(/s\*+t/gi, "shit")
    .replace(/[^a-z0-9' ]/gi, " ");
}
function fmtMMSS(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function readData() {
  if (!fs.existsSync(dataFile)) return null;
  return JSON.parse(fs.readFileSync(dataFile, "utf-8"));
}
function writeData(data) {
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2) + "\n");
}

// songs.ts からメタデータ取得
function readSongMeta() {
  const songsMeta = fs.readFileSync(path.join(ROOT, "src/data/songs.ts"), "utf-8");
  const block = songsMeta.match(new RegExp(`slug:\\s*['"]/songs/${slug}['"][^}]*`))?.[0] ?? "";
  const title = block.match(/,\s*title:\s*["']([^"']+)["']/)?.[1] ?? slug;
  const artist = block.match(/,\s*artists:\s*["']([^"']+)["']/)?.[1] ?? "";
  const year = block.match(/,\s*year:\s*(\d{4})/)?.[1]
    ?? block.match(/subtitle:\s*["'][^"']*\b(\d{4})\b[^"']*["']/)?.[1] ?? "";
  return { title, artist, year };
}

// ── init: .astro → candidates + whisperアライメント ──────────────────────────
function parseAstroPairs() {
  const content = fs.readFileSync(astroFile, "utf-8");
  const ytMatch = content.match(/youtubeId=["']([^"']+)["']/);
  const youtubeId = ytMatch ? ytMatch[1] : null;

  const pairs = [];
  const blockRe = /<(LyricsBlock|LearningUnit)[^>]*>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = blockRe.exec(content)) !== null) {
    const inner = m[2];
    const eng = inner.match(/<Fragment slot="eng">([\s\S]*?)<\/Fragment>/)?.[1];
    const jpn = inner.match(/<Fragment slot="jpn">([\s\S]*?)<\/Fragment>/)?.[1];
    if (!eng || !jpn) continue;
    const splitLines = (s) =>
      s.split(/<br\s*\/?>/i)
        .map((l) => l.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
        .filter((l) => l.length > 0);
    const engLines = splitLines(eng);
    const jpnLines = splitLines(jpn);
    if (!engLines.length || !jpnLines.length) continue;
    if (engLines.length === jpnLines.length) {
      for (let i = 0; i < engLines.length; i++) pairs.push({ eng: engLines[i], jpn: jpnLines[i] });
    } else {
      pairs.push({ eng: engLines.join(" \\N "), jpn: jpnLines.join("") });
    }
  }
  return { youtubeId, pairs };
}

function ensureAudio(youtubeId) {
  fs.mkdirSync(audioDir, { recursive: true });
  if (fs.existsSync(audioFile)) { console.log(`[audio] cache hit: ${audioFile}`); return; }
  const { title, artist } = readSongMeta();
  const tryDl = (url) => {
    try {
      execSync(`yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${audioFile}" "${url}"`, { stdio: "pipe" });
      return true;
    } catch { return false; }
  };
  console.log(`[yt-dlp] downloading audio...`);
  let ok = youtubeId ? tryDl(`https://www.youtube.com/watch?v=${youtubeId}`) : false;
  if (!ok) ok = tryDl(`ytsearch1:${artist} ${title} official audio`);
  if (!ok) { console.error("[yt-dlp] audio download failed"); process.exit(1); }
}

function runWhisper(pairs) {
  if (fs.existsSync(whisperCache)) {
    console.log(`[whisper] cache hit: ${whisperCache}`);
    return JSON.parse(fs.readFileSync(whisperCache).toString("latin1"));
  }
  const wav = `/tmp/punchline_${slug}.wav`;
  spawnSync("ffmpeg", ["-y", "-i", audioFile, "-ar", "16000", "-ac", "1", wav], { stdio: "pipe" });
  const promptWords = pairs.slice(0, 15).map((p) => p.eng).join(" ")
    .replace(/[^a-zA-Z0-9 ']/g, "").replace(/\s+/g, " ").trim().split(" ").slice(0, 40).join(" ");
  console.log("[whisper] transcribing full track (may take a few minutes)...");
  const r = spawnSync("whisper-cli", [
    "-m", WHISPER_MODEL, "-f", wav,
    "--output-json-full", "--output-file", `/tmp/punchline_whisper_${slug}`,
    "-t", "8", "--prompt", promptWords,
  ], { stdio: "pipe" });
  const jsonPath = `/tmp/punchline_whisper_${slug}.json`;
  if (r.status !== 0 || !fs.existsSync(jsonPath)) {
    console.error("[whisper] transcription failed");
    process.exit(1);
  }
  fs.copyFileSync(jsonPath, whisperCache);
  return JSON.parse(fs.readFileSync(whisperCache).toString("latin1"));
}

// サブワードトークンを単語に結合（先頭スペース＝新語の区切り）
function whisperWords(data) {
  const words = [];
  for (const seg of data.transcription || []) {
    for (const tok of seg.tokens || []) {
      let startSec = null;
      if (tok.offsets?.from != null) startSec = tok.offsets.from / 1000;
      else if (tok.timestamps?.from) {
        const tm = tok.timestamps.from.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
        if (tm) startSec = +tm[1] * 3600 + +tm[2] * 60 + +tm[3] + +tm[4] / 1000;
      }
      if (startSec == null) continue;
      const raw = tok.text || "";
      if (raw.trim().startsWith("[")) continue;
      const isNewWord = /^[\s♪â]/.test(raw) || words.length === 0;
      const clean = raw.toLowerCase().replace(/[^a-z0-9']/g, "");
      if (!clean) continue;
      if (!isNewWord) words[words.length - 1].text += clean;
      else words.push({ text: clean, startSec });
    }
  }
  return words;
}

// ── YouTube公式キャプション（二重照合用・align-yt-captions.mjs と同方式） ─────
const capCache = path.join(audioDir, `${slug}.captions.json`);
const normCap = (s) => s.toLowerCase()
  .replace(/’|'/g, "")
  .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
  .replace(/[^a-z0-9\s]/g, " ")
  .replace(/\s+/g, " ").trim();
const tokMatch = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

function fetchCaptions(youtubeId) {
  if (fs.existsSync(capCache)) return JSON.parse(fs.readFileSync(capCache, "utf-8"));
  if (!youtubeId) return null;
  const tmp = fs.mkdtempSync(path.join("/tmp", `plcap-${slug}-`));
  const dl = (auto) => {
    const a = ["--skip-download", "--write-subs"];
    if (auto) a.push("--write-auto-subs");
    a.push("--sub-langs", "en.*", "--sub-format", "json3", "-o", path.join(tmp, "cap"),
      `https://www.youtube.com/watch?v=${youtubeId}`);
    try { execSync(`yt-dlp ${a.map((x) => `"${x}"`).join(" ")}`, { stdio: "pipe", timeout: 60000 }); } catch {}
    return fs.readdirSync(tmp).filter((f) => f.endsWith(".json3")).map((f) => path.join(tmp, f));
  };
  let files = dl(false), source = "manual";
  if (!files.length) { files = dl(true); source = "auto"; }
  if (!files.length) { fs.rmSync(tmp, { recursive: true, force: true }); return null; }
  const j = JSON.parse(fs.readFileSync(files[0], "utf-8"));
  const stream = [];
  for (const ev of j.events || []) {
    if (!ev.segs) continue;
    for (const seg of ev.segs) {
      const t = Math.round((ev.tStartMs + (seg.tOffsetMs || 0))) / 1000;
      for (const w of normCap(seg.utf8 || "").split(" ")) if (w) stream.push({ sec: t, tok: w });
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (stream.length < 20) return null;
  const data = { videoId: youtubeId, source, stream };
  fs.writeFileSync(capCache, JSON.stringify(data));
  return data;
}

// キャプション単語ストリームからテキストの最良マッチ秒を返す（prefix寛容・0.55未満はnull）
// hintSec指定時、スコア同点なら hint に近い位置を採用（手前の類似フレーズ誤拾い防止）
function capBestMatch(stream, text, fromSec = 0, toSec = Infinity, hintSec = null) {
  const toks = normCap(expandCensor(text.replace(/\\N/g, " ").toLowerCase()))
    .split(" ").filter((w) => w.length > 1).slice(0, 10);
  if (toks.length < 2) return null;
  let best = null;
  for (let i = 0; i < stream.length; i++) {
    if (stream[i].sec < fromSec) continue;
    if (stream[i].sec > toSec) break;
    const startAt = tokMatch(stream[i].tok, toks[0]) ? 0 : tokMatch(stream[i].tok, toks[1]) ? 1 : -1;
    if (startAt < 0) continue;
    let matched = 1, si = i + 1, ti = startAt + 1;
    while (ti < toks.length && si < Math.min(i + 25, stream.length)) {
      if (tokMatch(stream[si].tok, toks[ti])) { matched++; ti++; }
      si++;
    }
    const ratio = matched / toks.length;
    const sec = Math.round(stream[i].sec * 10) / 10;
    const better = !best || ratio > best.score + 1e-9 ||
      (Math.abs(ratio - best.score) < 1e-9 && hintSec != null &&
        Math.abs(sec - hintSec) < Math.abs(best.sec - hintSec));
    if (better) best = { sec, score: Math.round(ratio * 100) / 100 };
  }
  return best && best.score >= 0.55 ? best : null;
}

const NONCONTIG_GAP = 6.5; // ブロック内の行間がこれを超えたら「非連続引用」とみなす

// 各候補に capT（キャプション秒）・subT（\N行ごとの秒）・nonContiguous を焼く
function annotateWithCaptions(candidates, cap) {
  if (!cap) return;
  for (const c of candidates) {
    const subs = c.eng.split(/\s*\\N\s*/).map((s) => s.trim()).filter(Boolean);
    // ブロック先頭のキャプション秒（whisper absの近傍を優先、無ければ全域）
    const near = c.abs != null
      ? capBestMatch(cap.stream, subs[0], Math.max(0, c.abs - 4), c.abs + 8, c.abs)
      : null;
    const first = near ?? capBestMatch(cap.stream, subs[0]);
    c.capT = first?.sec ?? null;
    c.capConf = first?.score ?? 0;
    // whisperが取れなかった候補はキャプションからabsを補完
    if (c.abs == null && first && first.score >= 0.7) {
      c.abs = first.sec;
      c.conf = first.score;
      c.src = "caption";
    }
    // \N複数行は行ごとに照合し、連続性を判定
    if (subs.length >= 2) {
      const times = [c.capT];
      let from = c.capT != null ? c.capT + 0.3 : 0;
      for (let k = 1; k < subs.length; k++) {
        const hit = capBestMatch(cap.stream, subs[k], from, from + 30);
        times.push(hit?.sec ?? null);
        if (hit) from = hit.sec + 0.3;
      }
      c.subT = times;
      c.nonContiguous = times.some((t, i) =>
        i > 0 && t != null && times[i - 1] != null && t - times[i - 1] > NONCONTIG_GAP);
    } else {
      c.subT = null;
      c.nonContiguous = false;
    }
  }
}

// 候補ごとに全域スキャンで最良マッチ → 増加列フィルタで順序矛盾を除去
function alignCandidates(pairs, words) {
  const matched = pairs.map((pair) => {
    const anchor = expandCensor(pair.eng.replace(/\\N/g, " ").toLowerCase()).trim()
      .split(/\s+/).filter((w) => w.length > 1).slice(0, 6);
    if (anchor.length < 2) return { ...pair, abs: null, conf: 0 };
    let bestIdx = -1, bestScore = 0;
    for (let i = 0; i < words.length - anchor.length + 1; i++) {
      let m = 0;
      for (let j = 0; j < anchor.length; j++) {
        if (words[i + j].text === anchor[j]) m++;
      }
      const score = m / anchor.length;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    if (bestScore >= 0.5 && bestIdx >= 0) {
      return { ...pair, abs: Math.round(words[bestIdx].startSec * 100) / 100, conf: Math.round(bestScore * 100) / 100 };
    }
    return { ...pair, abs: null, conf: 0 };
  });

  // 最長増加部分列（conf加重）: 順序が崩れるマッチをabs=nullに落とす
  const idxs = matched.map((c, i) => (c.abs != null ? i : -1)).filter((i) => i >= 0);
  const n = idxs.length;
  if (n > 1) {
    const score = new Array(n).fill(0).map((_, k) => matched[idxs[k]].conf);
    const best = [...score];
    const prev = new Array(n).fill(-1);
    for (let k = 1; k < n; k++) {
      for (let j = 0; j < k; j++) {
        if (matched[idxs[j]].abs < matched[idxs[k]].abs && best[j] + score[k] > best[k]) {
          best[k] = best[j] + score[k];
          prev[k] = j;
        }
      }
    }
    let end = 0;
    for (let k = 1; k < n; k++) if (best[k] > best[end]) end = k;
    const keep = new Set();
    for (let k = end; k >= 0; k = prev[k]) { keep.add(idxs[k]); if (prev[k] === -1) break; }
    for (const i of idxs) {
      if (!keep.has(i)) { matched[i].abs = null; matched[i].conf = 0; }
    }
  }
  return matched;
}

function cmdInit() {
  if (!fs.existsSync(astroFile)) { console.error(`❌ not found: ${astroFile}`); process.exit(1); }
  const { youtubeId, pairs } = parseAstroPairs();
  if (!pairs.length) { console.error("❌ no eng/jpn pairs found in .astro"); process.exit(1); }
  console.log(`[parse] ${pairs.length} candidate pairs from .astro`);

  ensureAudio(youtubeId);
  const wdata = runWhisper(pairs);
  const words = whisperWords(wdata);
  console.log(`[whisper] ${words.length} words`);

  const candidates = alignCandidates(pairs, words).map((c, i) => ({ i, ...c }));

  // YouTube公式キャプションで二重照合（whisper単独の誤マッチ・非連続引用ブロックを検出）
  const cap = fetchCaptions(youtubeId);
  if (cap) console.log(`[captions] ${cap.source} track (${cap.stream.length} words) → cross-check enabled`);
  else console.log(`[captions] ⚠ no caption track — cross-check unavailable (whisper only)`);
  annotateWithCaptions(candidates, cap);

  const aligned = candidates.filter((c) => c.abs != null);
  console.log(`[align] ${aligned.length}/${candidates.length} candidates resolved`);
  const nonContig = candidates.filter((c) => c.nonContiguous);
  if (nonContig.length) {
    console.log(`[guard] ⚠ non-contiguous quote blocks (shorts使用不可): ${nonContig.map((c) => "#" + c.i).join(" ")}`);
  }
  const drift = candidates.filter((c) => c.abs != null && c.capT != null && Math.abs(c.abs - c.capT) > 2.5);
  if (drift.length) {
    console.log(`[guard] ⚠ whisper/caption drift >2.5s: ${drift.map((c) => `#${c.i}(${c.abs}s vs ${c.capT}s)`).join(" ")}`);
  }

  const prev = readData();
  const data = {
    slug,
    v: 2,
    meta: readSongMeta(),
    captions: cap ? { videoId: cap.videoId, source: cap.source } : null,
    generatedAt: new Date().toISOString().slice(0, 10),
    candidates,
    clips: prev?.clips ?? [],
  };
  // clips[]が参照する候補のengが変わっていたら警告（.astro編集でindexズレの疑い）
  if (prev?.candidates && data.clips.length) {
    for (const clip of data.clips) {
      for (const idx of clip.lines || []) {
        if (prev.candidates[idx] && candidates[idx] && prev.candidates[idx].eng !== candidates[idx].eng) {
          console.log(`[guard] ⚠ [${clip.id}] line #${idx} の引用内容が前回initから変化 — clips[]のindexを確認`);
        }
      }
    }
  }
  writeData(data);

  // 歌詞は出さずタイミング概要のみ
  const timeline = aligned.map((c) => `#${c.i}@${Math.round(c.abs)}s(${c.conf}${c.src === "caption" ? "c" : ""})`).join(" ");
  console.log(`[timeline] ${timeline}`);
  console.log(`\n✅ init done: ${path.relative(ROOT, dataFile)}`);
  console.log(`次: clips[] にパンチラインを定義（docs/punchline-shorts.md 参照）→ render`);
}

// ── clip解決（render/check共通・純関数） ─────────────────────────────────────
function resolveClip(data, clip) {
  const errs = [];
  const lines = (clip.lines || []).map((idx) => {
    const c = data.candidates[idx];
    if (!c) { errs.push(`line index ${idx} out of range`); return null; }
    if (c.nonContiguous) {
      errs.push(`line #${idx} quotes non-contiguous lyrics (行間>${NONCONTIG_GAP}s) — 1ブロック表示不可。別の候補を選ぶ`);
    }
    const manual = clip.tManual?.[String(idx)];
    const abs = manual != null ? manual : c.abs;
    if (abs == null) errs.push(`line #${idx} has no timestamp (abs=null, set tManual)`);
    // whisperとYouTube公式キャプションの二重照合（tManual指定時は実測を正とする）
    if (manual == null && abs != null && c.capT != null && Math.abs(abs - c.capT) > 2.5) {
      errs.push(`line #${idx} whisper/caption mismatch (${abs}s vs ${c.capT}s) — 誤マッチ疑い。tManualで実測を焼く`);
    }
    return { idx, eng: c.eng, jpn: c.jpn, abs, subT: c.subT ?? null };
  }).filter(Boolean);

  if (!lines.length) errs.push("no lines");
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].abs != null && lines[i - 1].abs != null && lines[i].abs <= lines[i - 1].abs) {
      errs.push(`line #${lines[i].idx} not after #${lines[i - 1].idx} (${lines[i].abs}s <= ${lines[i - 1].abs}s)`);
    }
  }
  if (errs.length) return { errs };

  const firstAbs = lines[0].abs;
  // 最終ラインが\N複数行なら「最後の行が歌われる秒」までクリップに含める
  const lastLine = lines[lines.length - 1];
  const lastSung = Math.max(lastLine.abs, ...(lastLine.subT || []).filter((t) => t != null));
  const songStartSec = clip.songStartSec != null
    ? clip.songStartSec
    : Math.max(0, Math.round((firstAbs - LEAD_IN) * 10) / 10);
  let durationSec = clip.durationSec != null
    ? clip.durationSec
    : Math.round((lastSung + OUTRO - songStartSec) * 10) / 10;
  durationSec = Math.min(Math.max(durationSec, MIN_DUR), MAX_DUR);

  const timed = lines.map((l) => ({ ...l, t: Math.round((l.abs - songStartSec) * 100) / 100 }));
  if (timed[0].t < 0.8) errs.push(`first line too early (t=${timed[0].t}s, need >=0.8s; lower songStartSec)`);
  if (timed[timed.length - 1].t > durationSec - 2.0) {
    errs.push(`last line too late (t=${timed[timed.length - 1].t}s vs duration ${durationSec}s)`);
  }
  // 表示する全行がクリップの音声窓内で実際に歌われるか（キャプション実測で検証）
  const endAbs = songStartSec + durationSec;
  for (const l of lines) {
    for (const t of (l.subT || []).filter((x) => x != null)) {
      if (t < songStartSec - 0.5 || t > endAbs + 0.5) {
        errs.push(`line #${l.idx} は ${t}s に歌われる行を含む — クリップ窓 [${songStartSec}-${endAbs.toFixed(1)}s] の外`);
      }
    }
  }
  if (errs.length) return { errs };
  return { songStartSec, durationSec, lines: timed, errs: [] };
}

// ── ASS生成 ───────────────────────────────────────────────────────────────────
function assTime(sec) {
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
function wrapEng(text, max = 22) {
  const parts = text.split(/\s*\\N\s*/);
  const lines = [];
  for (const part of parts) {
    const words = part.replace(/\s+/g, " ").trim().split(" ");
    let cur = "";
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (cand.length <= max) cur = cand;
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
  }
  return lines.join("\\N");
}
function wrapJpn(text, max = 14) {
  const t = text.replace(/\n/g, "").replace(/,/g, "，").trim();
  if (t.length <= max) return t;
  const lines = [];
  let rem = t;
  while (rem.length > max) {
    let br = -1;
    for (let i = Math.min(max, rem.length - 1); i >= Math.floor(max * 0.5); i--) {
      if ("。、！？ 　".includes(rem[i])) { br = i + 1; break; }
    }
    if (br === -1) br = max;
    lines.push(rem.slice(0, br).trim());
    rem = rem.slice(br).trim();
  }
  if (rem) lines.push(rem);
  return lines.join("\\N");
}

const GOLD = "&H006BA9C8"; // #c8a96b (ABGR)
const WHITE = "&H00FFFFFF";
const GRAY = "&H00999999";

function buildAss(meta, resolved) {
  const { durationSec, lines } = resolved;
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Line,Helvetica Neue,68,${WHITE},&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,1,0,1,0,0,5,60,60,0,1
Style: TitleCard,Helvetica Neue,96,${WHITE},&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,0,0,5,60,60,0,1
Style: Meta,Helvetica Neue,36,${GRAY},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,1,0,1,0,0,2,60,60,200,1
Style: Mark,Helvetica Neue,34,${GRAY},&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,0,0,2,60,60,110,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  let ev = "";
  const endAll = assTime(durationSec - 0.05);
  const artistUp = (meta.artist || "").toUpperCase();
  const metaLine = [artistUp, meta.title ? `"${meta.title}"` : "", meta.year].filter(Boolean).join("  ·  ");

  // タイトルカード（冒頭〜ファーストライン直前）
  const cardEnd = Math.max(0.9, lines[0].t - 0.15);
  ev += `Dialogue: 0,${assTime(0.15)},${assTime(cardEnd)},TitleCard,,0,0,0,,{\\pos(540,900)\\fad(250,250)}{\\fs56\\c${GOLD}\\b1}${artistUp}\\N{\\fs30\\c${WHITE}} \\N{\\fs88\\c${WHITE}\\b1}${meta.title}\n`;

  // 常時表示: メタバー + ウォーターマーク
  ev += `Dialogue: 0,${assTime(cardEnd)},${endAll},Meta,,0,0,0,,{\\fad(200,0)}${metaLine}\n`;
  ev += `Dialogue: 0,${assTime(0.15)},${endAll},Mark,,0,0,0,,waxthink.com\n`;

  // 歌詞ライン: 次のライン開始まで保持（ただし歌い終わり+3.2sで消す＝無関係な小節に被せない）
  const lastHoldEnd = durationSec - 2.2;
  for (let i = 0; i < lines.length; i++) {
    const t0 = lines[i].t;
    const subT = (lines[i].subT || []).filter((x) => x != null);
    const sungSpan = subT.length >= 2
      ? subT[subT.length - 1] - subT[0]
      : (lines[i].eng.split(/\\N/).length - 1) * 2.8;
    const holdCap = t0 + Math.max(sungSpan, 0) + 3.2;
    let t1 = i + 1 < lines.length ? lines[i + 1].t - 0.05 : lastHoldEnd;
    t1 = Math.min(t1, holdCap);
    if (t1 <= t0) continue;
    const engPart = `{\\fs68\\c${WHITE}\\b1}${wrapEng(lines[i].eng)}`;
    const jpnPart = `{\\fnHiragino Sans W6\\fs44\\c${GOLD}\\b0}${wrapJpn(lines[i].jpn)}`;
    const fad = i === lines.length - 1 ? "\\fad(120,500)" : "\\fad(120,80)";
    ev += `Dialogue: 0,${assTime(t0)},${assTime(t1)},Line,,0,0,0,,{\\pos(540,880)${fad}}${engPart}\\N{\\fs26} \\N${jpnPart}\n`;
  }

  // エンドカード
  ev += `Dialogue: 0,${assTime(durationSec - 2.0)},${endAll},TitleCard,,0,0,0,,{\\pos(540,900)\\fad(500,200)}{\\fs84\\c${GOLD}\\b1}WAXTHINK\\N{\\fs30\\c${WHITE}} \\N{\\fs40\\c${WHITE}}和訳・解説はサイトで\n`;
  return header + ev;
}

// ── render ────────────────────────────────────────────────────────────────────
function renderClip(data, clip) {
  const resolved = resolveClip(data, clip);
  if (resolved.errs.length) {
    console.log(`❌ [${clip.id}] ${resolved.errs.join(" / ")}`);
    return false;
  }
  const { songStartSec, durationSec, lines } = resolved;
  fs.mkdirSync(outDir, { recursive: true });

  const assFile = `/tmp/punchline_${slug}_${clip.id}.ass`;
  fs.writeFileSync(assFile, buildAss(data.meta, resolved));

  const mp4 = path.join(outDir, `${slug}--${clip.id}.mp4`);
  const r = spawnSync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", `color=c=0x0a0a0a:s=1080x1920:r=30:d=${durationSec}`,
    "-f", "lavfi", "-t", String(durationSec), "-i", "anullsrc=r=44100:cl=stereo",
    "-vf", `ass=${assFile}`,
    "-c:v", "libx264", "-preset", "fast", "-crf", "20",
    "-c:a", "aac", "-b:a", "128k",
    "-shortest", "-movflags", "+faststart",
    mp4,
  ], { stdio: "pipe" });
  if (r.status !== 0) {
    console.log(`❌ [${clip.id}] ffmpeg failed:\n${r.stderr.toString().slice(-800)}`);
    return false;
  }

  // caption.txt（歌詞は入れない）
  const { artist, title, year } = data.meta;
  const hook = clip.hook || `${artist} - ${title} のパンチライン和訳`;
  const artistTag = (artist || "").replace(/[\s.']/g, "");
  const caption = `${hook}

和訳と解説の全文はサイトで（プロフィールのリンクから）
https://waxthink.com/songs/${slug}

#hiphop #和訳 #${artistTag}

――― 投稿メモ（ここから下は本文にコピーしない）―――
曲: ${artist} - ${title}${year ? ` (${year})` : ""}
アプリ内サウンド検索: ${artist} ${title}
サウンド開始位置: ${fmtMMSS(songStartSec)}（曲頭から ${songStartSec} 秒）
クリップ長: ${durationSec} 秒 / ライン数: ${lines.length}
`;
  fs.writeFileSync(path.join(outDir, `${slug}--${clip.id}.caption.txt`), caption);

  console.log(`✅ [${clip.id}] ${durationSec}s / ${lines.length} lines / sound@${fmtMMSS(songStartSec)} → ${path.relative(ROOT, mp4)}`);
  return true;
}

function cmdRender() {
  const data = readData();
  if (!data) { console.error(`❌ not found: ${dataFile} — run init first`); process.exit(1); }
  const clips = (data.clips || []).filter((c) => !onlyClip || c.id === onlyClip);
  if (!clips.length) { console.error("❌ no clips defined in punchlines.json"); process.exit(1); }
  let ok = true;
  for (const clip of clips) {
    if (!renderClip(data, clip)) ok = false;
  }
  process.exit(ok ? 0 : 1);
}

// ── check（DoD機械検証） ──────────────────────────────────────────────────────
function ffprobe(file) {
  try {
    const out = execSync(
      `ffprobe -v quiet -show_entries stream=codec_type,width,height -show_entries format=duration -of json "${file}"`
    ).toString();
    const j = JSON.parse(out);
    const v = (j.streams || []).find((s) => s.codec_type === "video");
    const a = (j.streams || []).find((s) => s.codec_type === "audio");
    return { width: v?.width, height: v?.height, hasAudio: !!a, duration: parseFloat(j.format?.duration ?? "0") };
  } catch { return null; }
}

function cmdCheck() {
  const data = readData();
  if (!data) { console.error(`❌ not found: ${dataFile}`); process.exit(1); }
  const clips = (data.clips || []).filter((c) => !onlyClip || c.id === onlyClip);
  if (!clips.length) { console.error("❌ no clips defined"); process.exit(1); }

  let hasError = false;
  const fail = (id, msg) => { hasError = true; console.log(`  ❌ [${id}] ${msg}`); };

  console.log(`[check] ${slug}: ${clips.length} clips`);
  if (data.v !== 2) {
    fail("schema", "punchlines.json が旧形式（キャプション二重照合なし）— init を再実行してから check する");
  } else if (!data.captions) {
    console.log(`  ⚠ 字幕トラックなし: whisper単独アライメント。QuickTime+Spotifyでの口パク確認を必ずやる`);
  }
  for (const clip of clips) {
    if (!clip.id) { fail("?", "clip without id"); continue; }
    const resolved = resolveClip(data, clip);
    if (resolved.errs.length) { resolved.errs.forEach((e) => fail(clip.id, e)); continue; }
    const { songStartSec, durationSec, lines } = resolved;

    if (durationSec < MIN_DUR || durationSec > MAX_DUR) fail(clip.id, `duration ${durationSec}s outside ${MIN_DUR}-${MAX_DUR}s`);
    if (lines.length === 1) console.log(`  ⚠ [${clip.id}] only 1 line`);

    // hook/captionへの歌詞混入ガード
    const engFrags = lines.map((l) => normalize(l.eng.replace(/\\N/g, " "))).filter((e) => e.length >= 12);
    if (clip.hook && engFrags.some((e) => normalize(clip.hook).includes(e))) {
      fail(clip.id, "hook contains lyric text (write JP hook without quoting lyrics)");
    }

    const mp4 = path.join(outDir, `${slug}--${clip.id}.mp4`);
    const cap = path.join(outDir, `${slug}--${clip.id}.caption.txt`);
    if (!fs.existsSync(mp4)) { fail(clip.id, "mp4 not rendered"); }
    else {
      const p = ffprobe(mp4);
      if (!p) fail(clip.id, "ffprobe failed");
      else {
        if (p.width !== 1080 || p.height !== 1920) fail(clip.id, `resolution ${p.width}x${p.height} != 1080x1920`);
        if (!p.hasAudio) fail(clip.id, "no audio stream (X/IGでの互換用に無音トラック必須)");
        if (Math.abs(p.duration - durationSec) > 1.0) fail(clip.id, `mp4 duration ${p.duration.toFixed(1)}s != ${durationSec}s`);
      }
    }
    if (!fs.existsSync(cap)) fail(clip.id, "caption.txt missing");
    else {
      const c = fs.readFileSync(cap, "utf-8");
      if (!c.includes(`waxthink.com/songs/${slug}`)) fail(clip.id, "caption missing article URL");
      if (!c.includes("サウンド開始位置")) fail(clip.id, "caption missing sound start position");
      if (engFrags.some((e) => normalize(c).includes(e))) fail(clip.id, "caption contains lyric text");
    }
    const dcap = lines.map((l) => {
      const c = data.candidates[l.idx];
      return c?.capT != null ? (l.abs - c.capT).toFixed(1) : "-";
    });
    console.log(`  [${clip.id}] ${durationSec}s, ${lines.length} lines, sound@${fmtMMSS(songStartSec)}, t=[${lines.map((l) => l.t.toFixed(1)).join(", ")}], Δcap=[${dcap.join(", ")}]`);
  }

  console.log("");
  if (hasError) { console.log("❌ punchline check failed"); process.exit(1); }
  console.log("✅ punchline check OK");
  process.exit(0);
}

// ── main ──────────────────────────────────────────────────────────────────────
if (cmd === "init") cmdInit();
else if (cmd === "render") cmdRender();
else cmdCheck();
