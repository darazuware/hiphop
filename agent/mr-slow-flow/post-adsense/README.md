# mr-slow-flow: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `mr-slow-flow.full.astro.txt`（.astro全文・27unit）と `units.full.json`。今は21unit。

## 外したもの（2026-10-31）
### unit
- `eighth-spliff`: smoked a whole eighth in a spliff — 分量とブツの言い方
- `dutch-drift`: light my dutch then start to drift — 運転とブツを重ねる
- `unsigned-typewriters`: Unsigned death threats written in typewriters — 「unsigned」の二重義
- `peace-not-word`: Peace ain't the word to play — Main Sourceへのリスペクト
- `slow-flows-death`: I slow flows y'all to death — フックのAAVE三人称
- `choke-checklist`: Choke 'em out; another off the checklist — 淡々と片付ける凄み

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `mr-slow-flow.full.astro.txt` を `src/pages/songs/mr-slow-flow.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/mr-slow-flow/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug mr-slow-flow`。
3. `node agent/src/check-article.mjs mr-slow-flow` 全✅を確認。
