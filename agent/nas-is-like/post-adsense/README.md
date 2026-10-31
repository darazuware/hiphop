# nas-is-like: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `nas-is-like.full.astro.txt`（.astro全文・29unit）と `units.full.json`。今は20unit。

## 外したもの（2026-10-31）
### unit
- `baby-born-murdered`: A baby's bein' born, same time a man is murdered — 並置(juxtaposition)で世界観を一行に
- `fiends-flatline`: Saw fiends shoot up... am I sane? — fiend(ヤク中)と反復のSaw...
- `weak-picture-squeeze`: squeeze — 引き金を「絞る」、の一語で撃つ
- `they-possessive`: around they neck — AAVEの所有格 they（＝their）
- `seiko-rolex`: from Seiko to Rolex — モノで語る come-up（成り上がり）
- `siete-pesos`: siete zeros / pesos — 英語にスペイン語を差し込むコードスイッチ
- `beef-heat`: beef / bustin' heat — 「揉め事」と「火を噴く銃」
- `street-sweeper`: I'm like a street sweeper, green leaf breather — 二重の意味と内部韻
- `like-pac`: I'm like 'Pac, dude you would cry for — 2Pacの引用と die for / cry for

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。
- 元ネタ動画を #behind 内へ移動した（`<SampleYoutube>`・`sampleInContent`）。full 版に戻すと元に戻るので再適用する（[SMP]）。

## 復元手順
1. `nas-is-like.full.astro.txt` を `src/pages/songs/nas-is-like.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/nas-is-like/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug nas-is-like`。
3. `node agent/src/check-article.mjs nas-is-like` 全✅を確認。
