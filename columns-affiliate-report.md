# フェーズB アフィリンク挿入レポート

- 監査日: 2026-06-05
- タグ: `wax1124-22` 固定（amazon.co.jp のみ）。旧タグ `hiphop_black-22` 残存ゼロ（grep確認済み）。
- 共通コンポーネント: `src/components/ColumnAlbums.astro`（末尾に「関連アルバム（Amazon）」ブロック＋アフィリエイト開示文言を出力）
- リンク形式:
  - ASIN流用: `https://www.amazon.co.jp/dp/<ASIN>/?tag=wax1124-22`
  - 検索: `https://www.amazon.co.jp/s?k=<artist album>&i=music&tag=wax1124-22`（アルバム名は必ず非空）
- 開示文言: 各コラム末尾ブロック内に1箇所（「※当サイトはAmazonアソシエイト・プログラムの参加者です。…」）。全6本に出力済み（ビルド出力でgrep確認）。
- Appleリンクは範囲外（未着手）。

## ASIN流用元マップ（既存 /songs ページから取得）

| アルバム | ASIN | 流用元ページ |
|---|---|---|
| Wu-Tang Clan「Enter the Wu-Tang (36 Chambers)」 | B000002WPR | /songs/cream, /songs/protect-ya-neck |
| Nas「Illmatic」 | B0000029GA | /songs/ny-state-of-mind |
| Mos Def「Black on Both Sides」 | B00001XDNV | /songs/mathematics |
| Gang Starr「Hard to Earn」 | B000003JCL | /songs/mass-appeal |
| The Notorious B.I.G.「Ready to Die」 | B014Q2980U | /songs/juicy |
| 2Pac「Me Against the World」 | B00009YNFQ | /songs/dear-mama |
| 2Pac「All Eyez on Me」 | B00005AQE8 | /songs/california-love |
| Mobb Deep「The Infamous」 | B000002WR5 | /songs/shook-ones-pt-ii |
| A Tribe Called Quest「Midnight Marauders」 | B0000004ZA | /songs/electric-relaxation |
| A Tribe Called Quest「The Low End Theory」 | B0000004X7 | /songs/check-the-rhime |
| Big L「The Big Picture」 | B00004TUWL | /songs/ebonics |

## ⚠️ ASIN未確定（検索リンクで設置・後で要チェック）

リポジトリ内に既存ASINがなく、検索リンクで設置したもの。死リンク化しない設計だが、正規ジャケットを出したい場合は後日ASIN確定を推奨。

| アルバム | 検索クエリ(k=) | 使用コラム |
|---|---|---|
| Raekwon「Only Built 4 Cuban Linx...」 | Raekwon Only Built 4 Cuban Linx | wu-tang-clan, triumph-nine-mcs |
| GZA「Liquid Swords」 ← ユーザー指摘 | GZA Liquid Swords | wu-tang-clan |
| Ghostface Killah「Ironman」 | Ghostface Killah Ironman | wu-tang-clan |
| Method Man「Tical」 | Method Man Tical | wu-tang-clan |
| Wu-Tang Clan「Wu-Tang Forever」 | Wu-Tang Clan Wu-Tang Forever | wu-tang-clan, triumph-nine-mcs |
| Group Home「Livin' Proof」 | Group Home Livin' Proof | dj-premier-sampling |
| Souls of Mischief「93 'til Infinity」 | Souls of Mischief 93 til Infinity | aave-hiphop-language |

## コラム別 設置一覧

### wu-tang-clan
1. Enter the Wu-Tang (36 Chambers) — ASIN B000002WPR（流用: cream）
2. Raekwon「Only Built 4 Cuban Linx...」— 検索（ASIN未確定）
3. GZA「Liquid Swords」— 検索（ASIN未確定）
4. Ghostface Killah「Ironman」— 検索（ASIN未確定）
5. Method Man「Tical」— 検索（ASIN未確定）
6. Wu-Tang Clan「Wu-Tang Forever」— 検索（ASIN未確定）

### triumph-nine-mcs
1. Wu-Tang Clan「Wu-Tang Forever」（Triumph収録）— 検索（ASIN未確定）
2. Enter the Wu-Tang (36 Chambers) — ASIN B000002WPR（流用）
3. Raekwon「Only Built 4 Cuban Linx...」— 検索（ASIN未確定）

### dj-premier-sampling
1. Gang Starr「Hard to Earn」— ASIN B000003JCL（流用: mass-appeal）
2. Nas「Illmatic」— ASIN B0000029GA（流用）
3. Mos Def「Black on Both Sides」— ASIN B00001XDNV（流用: mathematics）
4. Group Home「Livin' Proof」— 検索（ASIN未確定）

### crack-epidemic-hiphop
1. Nas「Illmatic」— ASIN B0000029GA（流用）
2. Enter the Wu-Tang (36 Chambers) — ASIN B000002WPR（流用）
3. The Notorious B.I.G.「Ready to Die」— ASIN B014Q2980U（流用: juicy）
4. 2Pac「Me Against the World」— ASIN B00009YNFQ（流用: dear-mama）
5. 2Pac「All Eyez on Me」— ASIN B00005AQE8（流用: california-love）
6. Mobb Deep「The Infamous」— ASIN B000002WR5（流用: shook-ones-pt-ii）

### ny-golden-era-1994
1. Nas「Illmatic」— ASIN B0000029GA（流用）
2. The Notorious B.I.G.「Ready to Die」— ASIN B014Q2980U（流用）
3. Enter the Wu-Tang (36 Chambers) — ASIN B000002WPR（流用）
4. A Tribe Called Quest「Midnight Marauders」— ASIN B0000004ZA（流用: electric-relaxation）
5. Gang Starr「Hard to Earn」— ASIN B000003JCL（流用）

### aave-hiphop-language
1. Big L「The Big Picture」— ASIN B00004TUWL（流用: ebonics）
2. ATCQ「The Low End Theory」— ASIN B0000004X7（流用: check-the-rhime）
3. ATCQ「Midnight Marauders」— ASIN B0000004ZA（流用）
4. Nas「Illmatic」— ASIN B0000029GA（流用）
5. Souls of Mischief「93 'til Infinity」— 検索（ASIN未確定）

## 検証
- `npm run build` 成功（160ページ）
- ビルド出力の全Amazonリンクに `tag=wax1124-22` 付与、検索リンクは `i=music` 付き、アルバム名非空を確認
- 旧タグ `hiphop_black-22` の残存ゼロ
- 開示文言: 全6コラムのビルドHTMLに出力確認済み
