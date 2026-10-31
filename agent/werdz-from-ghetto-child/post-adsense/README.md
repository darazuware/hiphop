# werdz-from-ghetto-child: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `werdz-from-ghetto-child.full.astro.txt`（.astro全文・12unit）と `units.full.json`。今は7unit。

## 外したもの（2026-10-31）
### unit
- `drug-story`: my life is like a never-endin' drug story — 直喩で人生を語る
- `rises-grams`: Death percentages rises in the hood — AAVEの主述と the hood
- `food-plate`: keep food on my plate — 「食べていく」のイディオム
- `mac`: MAC — 「銃」を指すストリートの隠語
- `bite-dust`: bite the dust, or dodge that bullet — 二つの名イディオムで締める

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `werdz-from-ghetto-child.full.astro.txt` を `src/pages/songs/werdz-from-ghetto-child.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/werdz-from-ghetto-child/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug werdz-from-ghetto-child`。
3. `node agent/src/check-article.mjs werdz-from-ghetto-child` 全✅を確認。
