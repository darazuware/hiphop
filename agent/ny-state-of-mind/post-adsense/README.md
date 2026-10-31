# ny-state-of-mind: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `ny-state-of-mind.full.astro.txt`（.astro全文・17unit）と `units.full.json`。今は9unit。

## 外したもの（2026-10-31）
### unit
- `scarface-simile`: I'm like Scarface sniffin' cocaine — 映画の引用を直喩に畳む
- `gun-malfunction`: Stuck — 銃が撃てない瞬間
- `corners-goners`: Corners / Goners — 縄張りの街角と、生き残れない者
- `stickup-kids`: Stick-up kids — 街角で襲う若者たち
- `moet-tec`: drinkin' Moëts, holdin' TECs — ブランドと銃で描くギャングスタの夢
- `blocks-rocks`: sewin' up the blocks to sell rocks — ドラッグ経済のスラングと脚韻
- `smith-wesson`: Smith &amp; Wesson — Smith &amp; Wessonと脅しの韻
- `lamp-capone`: lamp like Capone — 「くつろぐ」を意味するNYスラング

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。
- DiveCards の /columns/crack-epidemic-hiphop への誘導を削除
- 目次（point-*）と「項目数」の表記を残り unit に合わせて更新

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `ny-state-of-mind.full.astro.txt` を `src/pages/songs/ny-state-of-mind.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/ny-state-of-mind/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug ny-state-of-mind`。
3. `node agent/src/check-article.mjs ny-state-of-mind` 全✅を確認。
