# 93-til-infinity: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `93-til-infinity.full.astro.txt`（.astro全文・25unit）と `units.full.json`。今は21unit。

## 外したもの（2026-10-31）
### unit
- `forty-stoge`: Here's a 40 — swig it! / the fattest stoge — 週末のチル語彙
- `good-vibrations`: Now we feel the Good Vibrations — カリフォルニアの引用と内部韻
- `v6-blunts-flip`: The cops wanna stop our fun — 警官を軽くいなすくだりと blunts
- `indo`: tons of indo — 西海岸の葉っぱスラング

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `93-til-infinity.full.astro.txt` を `src/pages/songs/93-til-infinity.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/93-til-infinity/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug 93-til-infinity`。
3. `node agent/src/check-article.mjs 93-til-infinity` 全✅を確認。
