# fast-life: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `fast-life.full.astro.txt`（.astro全文・27unit）と `units.full.json`。今は15unit。

## 外したもの（2026-10-31）
### unit
- `fishscales-triple-beams`: fishscales from triple beams — コカインの純度をはかる暗号語
- `fifty-calis`: fifty cali's — 数字＋短縮でできる武器の隠語
- `rocked-amadeus`: get rocked like Amadeus — rock を暴力の動詞に使う
- `shells-adidas`: more shells than Adidas — shell(弾)とシェルトゥ靴のダブルミーニング
- `payola-no-cola`: payola / coke without the cola — 二重の意味を一行に埋める
- `smoke-trees`: smoke trees — trees が「大麻」になる置き換え
- `lickin-shots-holliday`: lickin' shots Holliday style — 発砲を lick で言う言い回し
- `yayo-blizzard`: yayo like a blizzard — コカインを雪に喩える定番
- `arm-hammer-scramblers`: Arm & Hammer / scramblers — ブランド名が隠語として機能する
- `perico`: a cut inside perico — perico(スペイン語のコカイン)を混ぜる
- `blue-steel`: packin' all the blue steel — blue steel が銃を指す換喩
- `graveyards-kings`: graveyards is buried with kings — 栄華の果てを暗示する終わりの一行

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。
- DiveCards の /columns/crack-epidemic-hiphop への誘導を削除

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `fast-life.full.astro.txt` を `src/pages/songs/fast-life.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/fast-life/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug fast-life`。
3. `node agent/src/check-article.mjs fast-life` 全✅を確認。
