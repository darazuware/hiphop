# Dead Presidents: AdSense審査通過後に戻すもの

審査が終わるまで、銃・暴力・薬物・差別語などの危険な表現は載せない方針（2026-10-19運営者指示／2026-10-30適用）。
全文版は `dead-presidents.full.astro.txt`（.astro全文）と `units.full.json`（27unit版）。

## 外したもの（2026-10-30）
- unit `catch-a-freeze`（fiends / freeze の行またぎ）
- unit `sl-bail-toast`（roast a L / throw your toast）
- unit `bodiers-cap-peelers`（bodiers / cap-peelers の造語）
- 差別語・卑語を含む行の引用を外した: `narcin-bargain`（1行目）、`kosher-hasidic`（2行目）、`rise-to-riches`・`snitchin-aint-you`（引用なしに変更）、`aside-from-honeys`（後半）、`money-play-out`（先頭の slayin'）
- narc の「麻薬捜査官」表記を「捜査官」に、キーワード早見表の Toast / Bodier を削除
- 代わりに追加: unit `cerebral-breeds`（引用なし）。復元後も残してよい

## 復元手順
1. `dead-presidents.full.astro.txt` を `src/pages/songs/dead-presidents.astro` へ戻し、`cerebral-breeds` unit を pins-and-needles の後ろへ再挿入。
2. `units.full.json` に `cerebral-breeds` を足して `agent/dead-presidents/assets/units.json` へ戻し、`gen-fallback-timestamps.mjs --slug dead-presidents`。
3. `check-article.mjs dead-presidents` 全✅を確認（[D]は58%前後に戻る）。
