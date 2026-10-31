# thats-when-ya-lost: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `thats-when-ya-lost.full.astro.txt`（.astro全文・26unit）と `units.full.json`。今は22unit。

## 外したもの（2026-10-31）
### unit
- `cataclysm-schism`: cataclysm / schism — 難語で畳む多音節ライム
- `hollow-tips`: wallow / swallow / hollow — 多音節ライムの実演
- `illin`: illin' — 「病気」が「イカれた真似」になる
- `crack-bricks`: crack bricks — 「レンガを砕く」で見せる破壊力

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `thats-when-ya-lost.full.astro.txt` を `src/pages/songs/thats-when-ya-lost.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/thats-when-ya-lost/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug thats-when-ya-lost`。
3. `node agent/src/check-article.mjs thats-when-ya-lost` 全✅を確認。
