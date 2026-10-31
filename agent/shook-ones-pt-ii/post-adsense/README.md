# shook-ones-pt-ii: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `shook-ones-pt-ii.full.astro.txt`（.astro全文・30unit）と `units-timestamps.full.json`（units.json は元々なし）。今は13unit。

## 外したもの（2026-10-31）
### unit
- `intro-billers`: a hundred dollar billers — 百ドル札を動かす連中
- `stuck-realness`: stuck off the realness / Infamous — リアルさで釘付けにする、悪名高き者たち
- `warfare`: equipped for warfare / crime family — 戦争装備で来る犯罪一家
- `profile-pose`: profile and pose — 格好だけつけてポーズをとる
- `shook-crews`: shook crews — 怯えたクルー
- `laced-up`: get they whole body laced up — 全身を弾で飾り立てられる
- `featherweight`: featherweight / levitate — 最軽量級、銃声で宙に浮かせる
- `spark-philly`: ayo, dunn, spark the Philly — なあ相棒、ブラントに火をつけろ
- `yellow-backed`: yellow-backed niggas — 腰抜けども
- `slugs`: when the slugs penetrate — 弾が貫くとき
- `gats`: in gats we trust — 銃を信じる
- `pack-heat`: pack heat, but scared to hold — 銃を持つと言うが構える度胸はない
- `dome`: one in your dome — 頭に一発
- `projects`: thirteen years in the projects — プロジェクトで13年
- `dwell-front`: No time to dwell — くよくよ引きずる暇はない
- `like-macs`: spit lyrics like MACs — MACのようにライムを撃ち出す
- `creepin`: don't be caught sleepin', 'cause I'm creepin' — 油断するな、俺は忍び寄ってる

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。
- DiveCards の /columns/crack-epidemic-hiphop への誘導を削除

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `shook-ones-pt-ii.full.astro.txt` を `src/pages/songs/shook-ones-pt-ii.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units-timestamps.full.json` を `agent/shook-ones-pt-ii/assets/units-timestamps.json` へ戻す。
3. `node agent/src/check-article.mjs shook-ones-pt-ii` 全✅を確認。
