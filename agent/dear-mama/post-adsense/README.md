# Dear Mama: AdSense審査通過後に戻すもの

審査が終わるまで、銃・暴力・薬物・差別語などの危険な表現は載せない方針（2026-10-19運営者指示／2026-10-30適用）。
全文版は `dear-mama.full.astro.txt`（.astro全文）と `units.full.json`（30unit版）。

## 外したもの（2026-10-30）
- unit `elementary`（elementary / penitentiary の韻）
- unit `whoopin`（親のお仕置き）
- unit `slangin`（slangin'）
- unit `crack-fiend-black-queen` を `black-queen`（2行目のみ引用）に縮小
- unit `sell-rocks` を `mailbox`（2行目のみ引用）に縮小
- welfare unit の蔑称への言及、文化的背景の「クラック・エピデミックと黒人コミュニティ」ボックス、アフェニの依存症の記述、導入の事件名
- キーワード早見表の crack fiend / slangin' / whoopin'
- DiveCards（/columns/crack-epidemic-hiphop への誘導）
- description / highlights / 導入見出しの crack fiend・slangin'・sell rocks への言及

## 復元手順
1. `dear-mama.full.astro.txt` を `src/pages/songs/dear-mama.astro` へ戻す（その後の文体修正があれば差分マージ）。
2. `units.full.json` を `agent/dear-mama/assets/units.json` へ戻し、`align-yt-captions.mjs --slug dear-mama --apply` → `gen-fallback-timestamps.mjs --slug dear-mama`。
3. `check-article.mjs dear-mama` 全✅を確認。
