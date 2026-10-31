# we-dat-nice: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `we-dat-nice.full.astro.txt`（.astro全文・27unit）と `units.full.json`。今は24unit。

## 外したもの（2026-10-31）
### unit
- `catalog-rhyme`: mailers / sellers / tellers — 韻で敵を数え上げるカタログ
- `crackatalism`: crackatalism / politricks — 造語に二重批判を込める
- `colin-ferguson`: Colin Ferguson / hollow points — 現実の事件を引く重さ

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `we-dat-nice.full.astro.txt` を `src/pages/songs/we-dat-nice.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/we-dat-nice/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug we-dat-nice`。
3. `node agent/src/check-article.mjs we-dat-nice` 全✅を確認。
