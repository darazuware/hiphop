#!/usr/bin/env python3
# subvideo: 強制アライメント(MMS_FA)＋YouTube自動字幕での自動検証・区間再アライメント。
# usage: subvideo-align.py <dir>   (dir = agent/subvideo/{slug})
#   reads  lines.json ([[en, ja|null], ...]) / yt-words.json ([{s,w}]) / vocals.wav
#   writes fa.json (行ごとの [{w,s,e}]) / align-report.json
import json, re, sys, os, statistics
import torch, torchaudio, soundfile as sf
from torchaudio.pipelines import MMS_FA as bundle

d = sys.argv[1]
lines = json.load(open(os.path.join(d, "lines.json")))
yt = json.load(open(os.path.join(d, "yt-words.json"))) if os.path.exists(os.path.join(d, "yt-words.json")) else []
vocals = os.path.join(d, ".stems", "htdemucs", "audio", "vocals.wav")
data, sr = sf.read(vocals, dtype="float32", always_2d=True)
full = torch.from_numpy(data.T).mean(0, keepdim=True)
full = torchaudio.functional.resample(full, sr, 16000); SR = 16000
model = bundle.get_model(); tok = bundle.get_tokenizer(); aligner = bundle.get_aligner(); DICT = bundle.get_dict()

def norm(s):
    s = (s or "").lower().replace("’", "'")
    s = re.sub(r"[^a-z' ]", " ", s)
    return [w for w in s.split() if any(c in DICT for c in w)]

def align(texts, t0=0.0, t1=None):
    wav = full[:, int(t0 * SR): int((t1 if t1 else full.shape[1] / SR) * SR)]
    words, counts = [], []
    for t in texts:
        w = norm(t); counts.append(len(w)); words += w
    with torch.inference_mode():
        em, _ = model(wav)
        spans = aligner(em[0], tok(words))
    ratio = wav.shape[1] / em.shape[1] / SR
    se = [(s[0].start * ratio + t0, s[-1].end * ratio + t0) for s in spans]
    out, i = [], 0
    for k, t in enumerate(texts):
        w = norm(t)
        out.append([{"w": w[j], "s": round(se[i + j][0], 3), "e": round(se[i + j][1], 3)} for j in range(len(w))])
        i += counts[k]
    return out

def line_stat(ws):
    if ws:
        cand = [y for y in yt if ws[0]["s"] - 5 < y["s"] < ws[-1]["e"] + 5]
    else:
        cand = []
    n, m = len(ws), len(cand)
    # 重み付きLCS: 一致=1-0.05*|dt|（時刻が近い一致を優先。繰り返し句の取り違えを避ける）
    dp = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            best = max(dp[i - 1][j], dp[i][j - 1])
            if ws[i - 1]["w"] == cand[j - 1]["w"]:
                sc = 1 - 0.05 * abs(cand[j - 1]["s"] - ws[i - 1]["s"])
                if sc > 0: best = max(best, dp[i - 1][j - 1] + sc)
            dp[i][j] = best
    dl, i, j = [], n, m
    while i > 0 and j > 0:
        if ws[i - 1]["w"] == cand[j - 1]["w"] and 1 - 0.05 * abs(cand[j - 1]["s"] - ws[i - 1]["s"]) > 0 and abs(dp[i][j] - (dp[i - 1][j - 1] + 1 - 0.05 * abs(cand[j - 1]["s"] - ws[i - 1]["s"]))) < 1e-9:
            dl.append(cand[j - 1]["s"] - ws[i - 1]["s"]); i -= 1; j -= 1
        elif dp[i][j] == dp[i - 1][j]: i -= 1
        else: j -= 1
    med = statistics.median(dl) if dl else None
    longw = max((w["e"] - w["s"] for w in ws[:-1]), default=0)
    return med, len(dl), longw

def is_bad(ws):
    if not ws: return False
    med, n, longw = line_stat(ws)
    if (n >= 3 and abs(med) > 0.4) or (n >= 2 and abs(med) > 0.8): return True
    return longw > 2.2 and len(ws) > 2

texts = [l[0] for l in lines]
print(f"[align] global: {sum(len(norm(t)) for t in texts)} words", flush=True)
fa = align(texts)
windows = []
for rnd in range(3):
    bad = [i for i, ws in enumerate(fa) if is_bad(ws)]
    if not bad: break
    ranges, cur = [], [bad[0]]
    for i in bad[1:]:
        if i - cur[-1] <= 1: cur.append(i)
        else: ranges.append(cur); cur = [i]
    ranges.append(cur)
    for r in ranges:
        a, b = max(0, r[0] - 1), min(len(fa) - 1, r[-1] + 1)
        t0 = max(0.0, fa[a][0]["s"] - 0.3) if fa[a] else 0.0
        t1 = fa[b][-1]["e"] + 0.3 if fa[b] else full.shape[1] / SR
        sub = align(texts[a:b + 1], t0, t1)
        for k in range(r[0], r[-1] + 1):
            fa[k] = sub[k - a]
        windows.append({"round": rnd, "lines": [r[0], r[-1]], "window": [round(t0, 2), round(t1, 2)]})
        print(f"[align] window round{rnd} lines {r[0]}-{r[-1]} [{t0:.1f}-{t1:.1f}]", flush=True)

rep = {"lines": len(fa), "windows": windows, "stats": []}
for i, ws in enumerate(fa):
    med, n, longw = line_stat(ws)
    rep["stats"].append({"i": i, "hidden": lines[i][1] is None, "start": ws[0]["s"] if ws else None, "ytMedian": med, "ytN": n, "words": len(ws), "longWord": round(longw, 2), "bad": is_bad(ws)})
json.dump(fa, open(os.path.join(d, "fa.json"), "w"))
json.dump(rep, open(os.path.join(d, "align-report.json"), "w"))
print(f"[align] done. remaining bad lines: {[s['i'] for s in rep['stats'] if s['bad']]}")
