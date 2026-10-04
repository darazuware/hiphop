# AdSense監査 2026-10-04

## A. AdSense合格のための課題（重要な順）

| # | 対象 | 問題 | 対処 | モデル |
|---|---|---|---|---|
| 1 | 曲11本: lose-yourself, juicy, ms-jackson, it-was-a-good-day, check-the-rhime, the-message, empire-state-of-mind, gangstas-paradise, passin-me-by, the-light, mass-appeal | `src/data/songs.ts` 35-45行目で `songs` ではなく `ranking` 配列に誤追記。トップ一覧・アーティストページ・関連記事・ジャケットAmazonリンクが全部欠落し、孤立ページ化。トップの曲数も「26曲」と表示（実際は37曲） | `songs` 配列へ移す（rankingは上位3件のみ残す）。check-article に「songs配列に存在するか」のチェックを追加 | Sonnet・中 |
| 2 | /contact | POST `/api/contact` が500エラー（functions/api/contact.ts はCloudflare形式。Vercelでの扱い・環境変数を要確認） | Vercelで動く形に直す or Formspree等に切り替え | Sonnet・中 |
| 3 | 全ページtitle・トップH1・About | 「歌詞和訳」「歌詞の完全解読」「各センテンスに英語原文→日本語訳→解説」が旧仕様のまま | 「ヒップホップ英語・スラング解説」系に改称。Aboutを学習型の説明に書き直し | Opus・中 |
| 4 | /songs/fuck-compton | URLとタイトルの卑語がAdSenseの冒涜的表現ポリシーに当たる | 審査中は noindex or 一時退避。表示名は伏字 | Haiku・低 |
| 5 | /songs/99-problems | tier=thin なのに本番で noindex が効いていない | SongLayoutで tier=thin なら自動 noindex | Haiku・低 |
| 6 | /artists/*（index対象21本） | 本文約350字＋メルカリリンク3本のみ。アフィリエイト主体の薄いページ判定のリスク | 審査中は全部 noindex（sitemapからも除外）or 1500字以上に増補 | noindexならHaiku・低 |
| 7 | /columns/*（13本） | 本文1300〜1800字と薄め（triumph-nine-mcs が最少） | 3000字以上に増補 or 曲ページへ統合 | Opus・高 |
| 8 | トップ「アクセスランキング」 | 固定3曲で、実際のアクセス数ではない | 「編集部おすすめ」に改名 | Haiku・低 |
| 9 | /privacy | 最終更新が6/1のまま。Amazon・メルカリ等のアフィリエイト、YouTube埋め込み、Deezer試聴の記載なし | 追記して日付を更新 | Sonnet・低 |
| 10 | Layout | AdSenseはmetaタグのみで広告コードなし | 自動広告タグ（adsbygoogle.js?client=ca-pub-7526742711058970）を追加。CSPは対応済み | Haiku・低 |
| 11 | Search Console | — | 1・4・5を直したらサイトマップ再送信、11曲のインデックス登録をリクエスト | 手作業 |

問題なし: ads.txt / robots / sitemap / canonical / ナビ / 免責・著作権の表記 / 退避した54曲の404。学習型37曲（8,500〜14,000字）は強み。

## B. アフィリエイト改善案

1. 上記1の修正（11曲でジャケットのAmazonリンクが出ていない）。
2. 学習型ページの末尾に英語学習系CTA（DMM・ネイティブキャンプ・Cambly。報酬は1件数千円）を共通コンポーネントで置く。
3. Amazon内の高単価商品へ誘導: Amazon Music Unlimited・Audible無料体験（登録で報酬）、アナログ盤、レコードプレーヤー、ヘッドホン、ヒップホップ関連書籍。
4. VOD: 映画コラム（Juice、Do the Right Thing、How High、Time Is Illmatic）とLose Yourself（8 Mile）にU-NEXT無料トライアル。VodCtaは既存なので配置漏れを確認。
5. もしもアフィリエイトのかんたんリンクでAmazon・楽天・Yahooを併記。メルカリは楽天のTシャツ・レコードに置き換え。
6. 主要スラングに個別ページ（/slang/{語}、800字以上）。まず上位30語。今の `/slang?q=` は語ごとにインデックスされない。
7. GA4の `affiliate_click` イベントで、ページ種別・位置ごとのクリック数を月1回確認する。
8. アフィリエイトの追加は審査通過後。審査中に増やすと薄いページ判定のリスクが上がる。

## C. 進め方
1. 1・2・4・5・6（noindex）・8・9・10をまとめて1セッション（Sonnet・中）
2. 3をOpus・中で書き直す
3. AdSense申請
4. 7とBは審査通過後
