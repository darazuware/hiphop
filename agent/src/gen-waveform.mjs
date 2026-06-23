// mp3 → 80分割ピーク配列（0..1）を src/data/waveforms/{slug}.json に書き出す。
// 再生はYouTube iframeでライブFFT不可のため、曲の実振幅を事前計算した静的波形を使う
// （SoundCloud/Serato方式）。プレーヤーの棒グラフ高さに利用。
import { spawnSync } from "node:child_process";
import { readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");          // repo root
const AGENT = join(ROOT, "agent");
const OUT = join(ROOT, "src", "data", "waveforms");
const N_BARS = 80;

mkdirSync(OUT, { recursive: true });

function peaksFromMp3(mp3) {
  // mono 16-bit PCM @ 8kHz を ffmpeg で取り出す
  const res = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", mp3, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
    { maxBuffer: 1 << 30 }
  );
  if (res.status !== 0) {
    throw new Error(res.stderr?.toString() || "ffmpeg failed");
  }
  const buf = res.stdout;
  const n = Math.floor(buf.length / 2);
  if (n < N_BARS) return null;
  const bucket = Math.floor(n / N_BARS);
  const peaks = new Array(N_BARS).fill(0);
  for (let b = 0; b < N_BARS; b++) {
    let max = 0;
    const start = b * bucket;
    const end = b === N_BARS - 1 ? n : start + bucket;
    for (let i = start; i < end; i++) {
      const v = Math.abs(buf.readInt16LE(i * 2));
      if (v > max) max = v;
    }
    peaks[b] = max;
  }
  const globalMax = Math.max(...peaks, 1);
  // 正規化 → 知覚的に持ち上げ（pow 0.7）→ 下限0.12でツブれ防止
  return peaks.map((v) => {
    const norm = Math.pow(v / globalMax, 0.7);
    return Math.round(Math.max(0.12, Math.min(1, norm)) * 100) / 100;
  });
}

const only = process.argv[2]; // 任意: 特定slugだけ
let done = 0;
for (const dir of readdirSync(AGENT, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const slug = dir.name;
  if (only && slug !== only) continue;
  const mp3 = join(AGENT, slug, "assets", "audio.mp3");
  if (!existsSync(mp3)) continue;
  try {
    const peaks = peaksFromMp3(mp3);
    if (!peaks) {
      console.log(`skip  ${slug} (too short)`);
      continue;
    }
    writeFileSync(join(OUT, `${slug}.json`), JSON.stringify(peaks));
    console.log(`ok    ${slug}`);
    done++;
  } catch (e) {
    console.log(`fail  ${slug}: ${String(e).split("\n")[0]}`);
  }
}
console.log(`\n${done} waveform(s) written to src/data/waveforms/`);
