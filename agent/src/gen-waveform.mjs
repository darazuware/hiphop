// mp3 → 1200分割×3帯域（低/中/高）の細密波形データ（0..100整数）を src/data/waveforms/{slug}.json に書き出す。
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
const N_BARS = 1200;

mkdirSync(OUT, { recursive: true });

const BANDS = {
  low: "lowpass=f=200",
  mid: "highpass=f=200,lowpass=f=2000",
  high: "highpass=f=2000",
};

function bandEnvelope(mp3, filter) {
  // mono 16-bit PCM @ 16kHz を帯域フィルタ付きで取り出し、N_BARS分割の強度（RMS主体）を返す
  const res = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", mp3, "-ac", "1", "-ar", "16000", "-af", filter, "-f", "s16le", "-"],
    { maxBuffer: 1 << 30 }
  );
  if (res.status !== 0) throw new Error(res.stderr?.toString() || "ffmpeg failed");
  const buf = res.stdout;
  const n = Math.floor(buf.length / 2);
  if (n < N_BARS) return null;
  const bucket = Math.floor(n / N_BARS);
  const env = new Array(N_BARS).fill(0);
  for (let b = 0; b < N_BARS; b++) {
    let max = 0, sq = 0;
    const start = b * bucket;
    const end = b === N_BARS - 1 ? n : start + bucket;
    for (let i = start; i < end; i++) {
      const v = Math.abs(buf.readInt16LE(i * 2));
      if (v > max) max = v;
      sq += v * v;
    }
    env[b] = 0.3 * max + 0.7 * Math.sqrt(sq / Math.max(1, end - start));
  }
  return env;
}

// 3帯域（低/中/高）の細密波形。各帯域を自身の99パーセンタイルで正規化→pow→0..100整数
function peaksFromMp3(mp3) {
  const out = {};
  for (const [name, filter] of Object.entries(BANDS)) {
    const env = bandEnvelope(mp3, filter);
    if (!env) return null;
    const sorted = [...env].sort((x, y) => x - y);
    const ref = Math.max(sorted[Math.floor(sorted.length * 0.99)], 1);
    out[name] = env.map((v) => Math.round(Math.min(1, Math.pow(v / ref, 0.95)) * 100));
  }
  return { v: 2, ...out };
}

const only = process.argv[2]; // 任意: 特定slugだけ（AUDIO_DIR={dir} で {slug}.mp3 置き場を追加指定可）
let done = 0;
for (const dir of readdirSync(AGENT, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const slug = dir.name;
  if (only && slug !== only) continue;
  let mp3 = join(AGENT, slug, "assets", "audio.mp3");
  if (!existsSync(mp3) && process.env.AUDIO_DIR) mp3 = join(process.env.AUDIO_DIR, `${slug}.mp3`);
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
