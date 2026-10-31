# 99-problems: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `99-problems.full.astro.txt`（.astro全文・27unit）と `units.full.json`。今は18unit。

## 外したもの（2026-10-31）
### unit
- `bitch-aint-one`: but a bitch ain't one — 曲全体を欺くための多義的フック
- `rap-patrol-gat`: Rap Patrol on the gat patrol — patrol を二度踏む脚韻と gat
- `money-cash-hoes`: he's Money, Cash, Hoes — 自分の曲名で批評家の紋切り型を晒す
- `trunk-raw`: in my trunk is raw — raw が指すもの
- `strong-arm-ho`: had to strong-arm a ho — strong-arm と ho の再定義
- `pussy-sense`: a pussy havin' no goddamn sense — 語をひっくり返すワードプレイ
- `clappin`: get to clappin' — clap＝撃つ
- `system-riffraff`: back through the system — 司法制度の system と riff-raff
- `saccharine`: like he's saccharine — 「甘い」を裏切る saccharine

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。
- 元ネタ動画を #behind 内へ移動した（`<SampleYoutube>`・`sampleInContent`）。full 版に戻すと元に戻るので再適用する（[SMP]）。

## 復元手順
1. `99-problems.full.astro.txt` を `src/pages/songs/99-problems.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/99-problems/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug 99-problems`。
3. `node agent/src/check-article.mjs 99-problems` 全✅を確認。
