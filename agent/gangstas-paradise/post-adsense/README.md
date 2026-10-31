# gangstas-paradise: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `gangstas-paradise.full.astro.txt`（.astro全文・18unit）と `units.full.json`。今は17unit。

## 外したもの（2026-10-31）
### unit
- `blastin-laughin`: I've been blastin' and laughin' so long that / my mind is gone

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `gangstas-paradise.full.astro.txt` を `src/pages/songs/gangstas-paradise.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/gangstas-paradise/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug gangstas-paradise`。
3. `node agent/src/check-article.mjs gangstas-paradise` 全✅を確認。
