# i-can: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `i-can.full.astro.txt`（.astro全文・26unit）と `units.full.json`。今は22unit。

## 外したもの（2026-10-31）
### unit
- `strung-out`: got her strung on that heroin — 依存を表す strung / hang with
- `company-you-keep`: the company you keep — 「付き合う仲間」を表すことわざ的表現
- `porch-monkeys`: never porch monkeys — 蔑称をひっくり返す一句
- `read-more`: Read more, learn more — 命令形を畳む並列構文

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。
- 元ネタ動画を #behind 内へ移動した（`<SampleYoutube>`・`sampleInContent`）。full 版に戻すと元に戻るので再適用する（[SMP]）。

## 復元手順
1. `i-can.full.astro.txt` を `src/pages/songs/i-can.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/i-can/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug i-can`。
3. `node agent/src/check-article.mjs i-can` 全✅を確認。
