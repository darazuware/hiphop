# criminology: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `criminology.full.astro.txt`（.astro全文・24unit）と `units.full.json`。今は17unit。

## 外したもの（2026-10-31）
### unit
- `ninth-chamber`: The 9th chamber — Wu-Tang「36の部屋」の自己引用
- `essence`: back right to the essence — 「本源へ送り返す」＝殺しの婉曲
- `cash-rules`: cash rules everything around me — 題辞C.R.E.A.M.の回収
- `murder-one`: murder one — 「第一級殺人」という法律用語
- `ak-macs`: bust back like seventy MACs — 銃の固有名詞が語彙になる
- `stuck`: six niggas got stuck — 「強盗に遭う」の stuck
- `ice-rockin`: ice-rockin' niggas — アウトロの ice（宝石）で締める

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `criminology.full.astro.txt` を `src/pages/songs/criminology.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/criminology/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug criminology`。
3. `node agent/src/check-article.mjs criminology` 全✅を確認。
