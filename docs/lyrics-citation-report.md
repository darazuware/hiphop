# Task 6 — 歌詞掲載状況レポート（調査のみ・コード変更なし）

生成日: 2026-06-11

## サマリー（全78曲）

| 指標 | 値 |
|---|---|
| 対象曲数 | 78 |
| LyricsBlock未使用（歌詞ブロックなし）の曲 | 25 |
| 引用された英語原詞の総行数 | 3751 |
| LyricsBlock総数（＝引用ブロック） | 1287 |
| 解説付きブロック | 1041（81%） |
| 解説なしブロック（転載のみ） | 246（19%） |
| 解説付きブロックに含まれる行 | 2955（79%） |
| 解説なしブロックに含まれる行 | 796（21%） |

※「行」= LyricsBlockのeng slot内を `<br>`/改行で分割した非空行数。解説の有無はブロック単位（`hasExplanation={true}` または `slot="explanation"` の有無）。

> **補足: LyricsBlock未使用25曲について** — これらは旧テンプレートの散文・箇条書き解説ページで、`#lyrics` アンカーが空（英語原詞の行単位引用なし）。引用量ゼロのため citation方針上は既に最も安全側で、移行対象外。実質的な書き直し検討対象は LyricsBlock使用の53曲。

## 「解説対象行のみ引用」移行の影響範囲

- **書き直しが必要な曲数: 40 曲**（解説なしブロック＝純粋転載を1つ以上含む曲）。残り 13 曲は全ブロックに解説あり＝そのまま方針適合。
- 削除/解説付与が必要な「解説なしブロック」: 全 **246** 個（=対象行 796 行）。
- 概算工数の目安（1ブロックの解説追加 or 引用削除を5〜10分と仮定）:
  - 解説付与で残す場合: 246ブロック × 5–10分 ≈ **20.5–41.0 時間**
  - 引用削除で対応する場合: 機械的処理が可能なため 40曲 × 確認10分 ≈ **6.7 時間**

### 補足: 全文転載リスクの判定
- 現状は CLAUDE.md 方針（1ブロック=1〜2行・eng<解説の分量）に概ね沿っており、解説付き率が高いほど「批評目的の引用」として安全側。
- 解説なしブロック比率が高い曲を優先的に見直すと、最小工数で方針適合に到達できる。

## 曲別内訳（引用行数の多い順）

| Slug | 英語原詞 行数 | ブロック数 | 解説付き | 解説付き率 | 解説なしブロックの行 |
|---|--:|--:|--:|--:|--:|
| classic-better-than-ive-ever-been---dj-premier-remix | 121 | 38 | 30 | 79% | 61 |
| protect-ya-neck | 120 | 9 | 9 | 100% | 0 |
| stay-real | 108 | 42 | 20 | 48% | 66 |
| tonite | 101 | 31 | 26 | 84% | 30 |
| how-about-some-hardcore | 98 | 10 | 5 | 50% | 16 |
| incarcerated-scarfaces | 95 | 43 | 38 | 88% | 17 |
| stan | 94 | 40 | 39 | 98% | 2 |
| road-to-the-riches | 92 | 46 | 46 | 100% | 0 |
| fast-life | 91 | 40 | 35 | 88% | 21 |
| the-food | 90 | 36 | 28 | 78% | 36 |
| we-dat-nice | 90 | 37 | 30 | 81% | 28 |
| nas-is-like | 87 | 12 | 11 | 92% | 2 |
| acid-raindrops | 83 | 14 | 13 | 93% | 8 |
| fuck-compton | 81 | 9 | 7 | 78% | 12 |
| shook-ones-pt-ii | 81 | 30 | 15 | 50% | 50 |
| straight-outta-compton | 81 | 33 | 29 | 88% | 5 |
| 93-til-infinity | 80 | 38 | 38 | 100% | 0 |
| bow-down | 80 | 28 | 24 | 86% | 19 |
| concrete-schoolyard | 80 | 19 | 19 | 100% | 0 |
| ny-state-of-mind | 80 | 40 | 38 | 95% | 3 |
| i-can | 79 | 13 | 9 | 69% | 17 |
| passin-me-by | 79 | 16 | 10 | 63% | 31 |
| hold-you-down | 77 | 34 | 32 | 94% | 13 |
| california-love | 74 | 24 | 22 | 92% | 16 |
| quality-control | 74 | 18 | 18 | 100% | 0 |
| dead-presidents | 73 | 31 | 27 | 87% | 16 |
| phone-tap | 73 | 35 | 30 | 86% | 14 |
| twinz-deep-cover-98 | 69 | 14 | 14 | 100% | 0 |
| work-the-angles | 69 | 28 | 26 | 93% | 12 |
| nuthin-but-a-g-thang | 67 | 34 | 9 | 26% | 50 |
| mathematics | 65 | 19 | 13 | 68% | 19 |
| regulate | 63 | 32 | 8 | 25% | 47 |
| if-i-ruled-the-world-imagine-that | 62 | 30 | 30 | 100% | 0 |
| lose-yourself | 62 | 25 | 24 | 96% | 1 |
| dead-presidents-ii | 61 | 22 | 22 | 100% | 0 |
| poison | 59 | 13 | 12 | 92% | 2 |
| rebirth-of-slick | 59 | 23 | 23 | 100% | 0 |
| the-light | 59 | 16 | 10 | 63% | 27 |
| the-legacy | 57 | 28 | 9 | 32% | 38 |
| come-down | 56 | 13 | 13 | 100% | 0 |
| ebonics | 56 | 25 | 22 | 88% | 11 |
| real-hiphop | 55 | 9 | 8 | 89% | 5 |
| sound-of-da-police | 55 | 16 | 11 | 69% | 18 |
| get-by | 52 | 16 | 12 | 75% | 12 |
| the-next-episode | 49 | 21 | 20 | 95% | 2 |
| criminology | 48 | 24 | 21 | 88% | 8 |
| hypnotize | 48 | 22 | 22 | 100% | 0 |
| gin-and-juice | 44 | 23 | 7 | 30% | 31 |
| soul-on-ice | 42 | 21 | 14 | 67% | 14 |
| storm | 36 | 11 | 8 | 73% | 14 |
| cream | 34 | 9 | 9 | 100% | 0 |
| brothers-cant-see-me | 33 | 12 | 11 | 92% | 2 |
| werdz-from-ghetto-child | 29 | 15 | 15 | 100% | 0 |
| 99-problems | 0 | 0 | 0 | 0% | 0 |
| ambitionz-az-a-ridah | 0 | 0 | 0 | 0% | 0 |
| bodega | 0 | 0 | 0 | 0% | 0 |
| check-the-rhime | 0 | 0 | 0 | 0% | 0 |
| dear-mama | 0 | 0 | 0 | 0% | 0 |
| electric-relaxation | 0 | 0 | 0 | 0% | 0 |
| fight-the-power | 0 | 0 | 0 | 0% | 0 |
| guess-whos-back | 0 | 0 | 0 | 0% | 0 |
| humble | 0 | 0 | 0 | 0% | 0 |
| i-got-5-on-it | 0 | 0 | 0 | 0% | 0 |
| insane-in-the-brain | 0 | 0 | 0 | 0% | 0 |
| it-was-a-good-day | 0 | 0 | 0 | 0% | 0 |
| juice-know-the-ledge | 0 | 0 | 0 | 0% | 0 |
| juicy | 0 | 0 | 0 | 0% | 0 |
| livin-proof | 0 | 0 | 0 | 0% | 0 |
| mass-appeal | 0 | 0 | 0 | 0% | 0 |
| ms-jackson | 0 | 0 | 0 | 0% | 0 |
| no-vaseline | 0 | 0 | 0 | 0% | 0 |
| ooh-la-la | 0 | 0 | 0 | 0% | 0 |
| say | 0 | 0 | 0 | 0% | 0 |
| stakes-is-high | 0 | 0 | 0 | 0% | 0 |
| supa-star | 0 | 0 | 0 | 0% | 0 |
| thats-when-ya-lost | 0 | 0 | 0 | 0% | 0 |
| the-1st-time | 0 | 0 | 0 | 0% | 0 |
| work | 0 | 0 | 0 | 0% | 0 |
