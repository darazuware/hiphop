# real-hiphop: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `real-hiphop.full.astro.txt`（.astro全文・28unit）と `units.full.json`。今は23unit。

## 外したもの（2026-10-31）
### unit
- `boo-ks-spell`: the B double O K-S — 名前を綴って名乗る
- `snake-fake`: snake fake niggas — 「蛇＝裏切り者」の内韻
- `raw-jaw`: raw from the jaw — 「口先からナマ」の内韻
- `sharon-sliver`: get Stone like Sharon from Sliver — 女優名で「stoned」を掛ける
- `sensi-guinness`: burn some sensi and chase it wit' a Guinness — 締めの一服

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `real-hiphop.full.astro.txt` を `src/pages/songs/real-hiphop.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/real-hiphop/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug real-hiphop`。
3. `node agent/src/check-article.mjs real-hiphop` 全✅を確認。
