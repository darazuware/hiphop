# incarcerated-scarfaces: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `incarcerated-scarfaces.full.astro.txt`（.astro全文・26unit）と `units.full.json`。今は17unit。

## 外したもの（2026-10-31）
### unit
- `out-the-box`: knock niggas out the box — out the box で「いきなり」
- `lifted-staircases`: get lifted in the staircases — lifted と団地の階段
- `fronting`: fake be fronting — front を動詞にして「見栄を張る」
- `lick-shots`: lick shots, peace Connecticut — lick shots はパトワ由来
- `timbs-mac10`: with Timbs, with MAC-10's — ブーツと銃で武装する
- `retail`: I move rhymes like retail — ライムを商品に喩える直喩
- `mad-police`: mad police from Manhattan — mad は「怒った」じゃない
- `ferrigno-coke`: like Lou Ferrigno on coke — 文化参照で強さを語る
- `knots`: rubber band wrap all my knots — knots で「札束」

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `incarcerated-scarfaces.full.astro.txt` を `src/pages/songs/incarcerated-scarfaces.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/incarcerated-scarfaces/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug incarcerated-scarfaces`。
3. `node agent/src/check-article.mjs incarcerated-scarfaces` 全✅を確認。
