# cream: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `cream.full.astro.txt`（.astro全文・16unit）と `units.full.json`。今は9unit。

## 外したもの（2026-10-31）
### unit
- `gold-tooth`: gold tooth / ’Lo goose / G off — 身なりから稼ぎの話へ
- `runnin-up-gates`: runnin’ up in gates — 売買の場所へ押し入る
- `keys-seas`: keys / seas / forty G’s — 密輸、車、毎週の稼ぎ
- `tec-9`: here go — ものを示すAAVEの言い方
- `fifteen-bagged`: fifteen / young buck — 15歳の収監と若かった自分
- `jakes-base`: Jakes / base / bones — 追跡、密売、階段での喫煙
- `stickup-kids`: stickup kids / stray shots — 名詞を並べる街の描写

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。
- 目次（point-*）と「項目数」の表記を残り unit に合わせて更新

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `cream.full.astro.txt` を `src/pages/songs/cream.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/cream/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug cream`。
3. `node agent/src/check-article.mjs cream` 全✅を確認。
