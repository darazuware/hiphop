# classic-better-than-ive-ever-been---dj-premier-remix: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `classic-better-than-ive-ever-been---dj-premier-remix.full.astro.txt`（.astro全文・25unit）と `units.full.json`。今は19unit。

## 外したもの（2026-10-31）
### unit
- `another-drought`: another drought / buggin' out — 不作の年に、みんな浮足立つ
- `made-you-look`: Nas made you look — 仲間のMCを一行に編み込む
- `habitual-be`: I be killing s**t — AAVEのhabitual be
- `its-just-iron`: it's just iron — 「鉄」が「銃」になる換喩
- `wall-toast`: the wall they toast up on — 「乾杯」と「処刑」が重なる
- `smoke-them-trees`: smoke them trees — 「木」が大麻になる

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `classic-better-than-ive-ever-been---dj-premier-remix.full.astro.txt` を `src/pages/songs/classic-better-than-ive-ever-been---dj-premier-remix.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/classic-better-than-ive-ever-been---dj-premier-remix/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug classic-better-than-ive-ever-been---dj-premier-remix`。
3. `node agent/src/check-article.mjs classic-better-than-ive-ever-been---dj-premier-remix` 全✅を確認。
