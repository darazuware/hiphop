#!/usr/bin/env python3
# Forced alignment for full-lyric videos.
# Demucs vocal separation -> torchaudio MMS_FA forced alignment against known lyrics.
# Outputs per-word start/end seconds so the cue-editor can split at real pauses
# and place fragment start times precisely. Does NOT transcribe (lyrics are known).
#
# Usage: fa-align.py <assetsDir> [srcJson=full-cues.json] [outJson=fa_words.json]
#   reads   <assetsDir>/<srcJson>       (array of {eng,...} — cues でも lines でも可)
#   reads   <assetsDir>/audio-full.mp3  (or audio.mp3)
#   writes  <assetsDir>/<outJson>       (array-per-entry of {w,s,e})
#   caches  <assetsDir>/.stems/vocals.wav
import json, re, sys, os, subprocess
import torch, torchaudio
import soundfile as sf

assets = sys.argv[1]
src_json = sys.argv[2] if len(sys.argv) > 2 else "full-cues.json"
out_json = sys.argv[3] if len(sys.argv) > 3 else "fa_words.json"
cues = json.load(open(os.path.join(assets, src_json)))
audio = next((os.path.join(assets, n) for n in ("audio-full.mp3", "audio.mp3", "audio-full.wav")
             if os.path.exists(os.path.join(assets, n))), None)
if not audio:
    print("NO_AUDIO", file=sys.stderr); sys.exit(2)

# --- vocal separation (cached) ---
stem_dir = os.path.join(assets, ".stems")
base = os.path.splitext(os.path.basename(audio))[0]
vocals = os.path.join(stem_dir, "htdemucs", base, "vocals.wav")
if not os.path.exists(vocals):
    print("[demucs] separating vocals...", flush=True)
    subprocess.run([sys.executable, "-m", "demucs", "--two-stems=vocals",
                    "-o", stem_dir, audio], check=True)
src = vocals if os.path.exists(vocals) else audio

data, sr = sf.read(src, dtype="float32", always_2d=True)
wav = torch.from_numpy(data.T).mean(0, keepdim=True)
if sr != 16000:
    wav = torchaudio.functional.resample(wav, sr, 16000); sr = 16000

from torchaudio.pipelines import MMS_FA as bundle
model = bundle.get_model()
tokenizer = bundle.get_tokenizer()
aligner = bundle.get_aligner()
DICT = bundle.get_dict()

def norm(s):
    s = (s or "").lower().replace("’", "'")
    s = re.sub(r"[^a-z' ]", " ", s)
    return [w for w in s.split() if any(c in DICT for c in w)]

transcript, counts = [], []
for c in cues:
    ws = norm(c.get("eng", "")); counts.append(len(ws)); transcript += ws

print(f"[align] {len(transcript)} words on {os.path.basename(src)}", flush=True)
with torch.inference_mode():
    emission, _ = model(wav)
    spans = aligner(emission[0], tokenizer(transcript))
ratio = wav.shape[1] / emission.shape[1] / sr

se = [(s[0].start * ratio, s[-1].end * ratio) for s in spans]
out, idx = [], 0
for i, c in enumerate(cues):
    n = counts[i]; wl = norm(c.get("eng", ""))
    out.append([{"w": wl[k], "s": round(se[idx+k][0], 3), "e": round(se[idx+k][1], 3)} for k in range(n)])
    idx += n

json.dump(out, open(os.path.join(assets, out_json), "w"))
print(f"[done] wrote {out_json} ({len(out)} entries)")
