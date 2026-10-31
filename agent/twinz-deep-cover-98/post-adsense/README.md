# twinz-deep-cover-98: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `twinz-deep-cover-98.full.astro.txt`（.astro全文・26unit）と `units.full.json`。今は16unit。

## 外したもの（2026-10-31）
### unit
- `dead-little-italy`: Dead in the middle of Little Italy — 31音節・内部韻の教科書
- `snub-tre-eight`: my snub tré-eight — 数字で銃を呼ぶストリートの隠語
- `cop-killers`: cop-killers, fill 'em to the top — 弾薬の隠語（フック）
- `cracks-the-rock`: Joey cracks the rock — 名前と隠語のダブルミーニング（フック）
- `one-eight-seven`: 1-8-7 on an undercover cop — 西海岸の言語を東海岸が継承する
- `first-amendment`: the First Amendment's culturally biased — 憲法用語で社会を撃つ
- `tec-jeep-lexus`: Three TEC's in the Jeep Lexus — 銃器スラングと三連の脚韻
- `street-professors`: Street professors, Terror Squad — ghetto scholars — オクシモロンで自らを定義する
- `walk-the-walk`: taught to walk the walk — 「有言実行」のイディオム
- `armageddon`: 'til it's Armageddon — 聖書語とメンバー名のダブルミーニング

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。
- DiveCards の /columns/crack-epidemic-hiphop への誘導を削除

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。
- 元ネタ動画を #behind 内へ移動した（`<SampleYoutube>`・`sampleInContent`）。full 版に戻すと元に戻るので再適用する（[SMP]）。

## 復元手順
1. `twinz-deep-cover-98.full.astro.txt` を `src/pages/songs/twinz-deep-cover-98.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/twinz-deep-cover-98/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug twinz-deep-cover-98`。
3. `node agent/src/check-article.mjs twinz-deep-cover-98` 全✅を確認。
