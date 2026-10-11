# C.R.E.A.M. review結果 — 2026-10-11

対象はcreamのみ。完成本番NY（main 74a1863）とreview dc99baeは対象ソース・共通プレーヤーで一致していた。公開CREAMはHTTP200、24項目・23頭出し。常設main/reviewの未コミット変更は使用せず、最新reviewから隔離clone `/private/tmp/cream-reader-review` を作った。

## 完了した改善

- ジャケット左／作品データ右、短い導入、意味・表現・元ネタの3入口、24項目への目次と戻り。NYの17項目へは揃えない。
- 句読点で改行、話題ごとの段落、重複説明・引用の削減。語法、場面、韻の説明を残した。補足ツールチップも断定を修正。
- スタテン・フェリーとStax Museumの写真。年代・撮影者・原典・CC BY-SA・無変更を可視表示。詳細はcream-evidence JSON。
- RCA通常1CDの36 Chambersと、The Charmels原曲を含む国内9CDのStax/Voltボックス。画像・媒体・規格・買う理由を明記。Amazon ASINを実商品で確認し、Mercariは媒体をCDに絞った検索。

## 検証

三稿制のハッシュと再読結果はcream-editorial JSON。check-article creamは10項目合格、Genius実取得・引用重複0・文体・pre-push合格。build、内部リンク、SEO、check:publish-safety、diff --check合格。専用check-cream-championは元の手動14／caption7／非収録1の記録をbyte相当で保全し、全24項目・23seek・23停止・購入5リンクを検証した。

PC1440／390px／320pxは実際のdocument幅を取得し、横溢れ0、ジャケット左・データ右、3入口の見出しが固定バーの下に着地することを確認。320pxでは全24目次往復、全23頭出しの表示時刻と停止UI合格。390pxでも全23の操作を実施。両写真と両商品画像の読み込みを確認した。画像証拠とbrowser.jsonをcream-qa-2026-10に保存。

購入5リンクはタグ／afid、PR、sponsored、商品識別・位置を検証。実Layoutハンドラを使用し、gtagとdataLayer fallbackのaffiliate_click payloadがcream／song／媒体／商品／位置／hostを送ることを確認。Amazon2商品の詳細とMercari検索の到達先を確認した。GA4サーバーの受信・成約報告は今回未取得。成約を確認済みとは扱わない。

## 未完了・人間待ち

音源は公式Edited MV PBwAxmrE194（242秒）を維持。推定2件は公式字幕ブロックから109.780／136.401秒の候補へ変更し、≈表示を付けた。発声開始の実測済みとは扱わない。既存手動14・caption7は上書きしていない。アルバム版4yNQ7_7I5aEは254秒で、音源切替・オフセット適用はしていない。

IABのYouTube埋め込みは「再生できません」と出るため、実際の音の再生・停止と発声開始は未確認。ローカル聴取ページ http://127.0.0.1:4334/ に2区間と両版の導入を用意。音声・字幕はGit／サイトに含めない。①15歳の発声開始、②階段の発声開始、③導入のMV非収録を人間が聴取して確定する。

Amazon商品画像は既存affiliate部品の外部参照。自由利用画像として扱わず、個別のAPI取得・画像再利用許諾の証跡は新たに確認できていない。CC写真と区別してledgerに記録した。

本番公開は未実施。確認URLは https://hiphop-git-review-darazuwares-projects.vercel.app/songs/cream/ 。認証保護がある場合はVercelへログインする。

## 次にする1タスク

再生位置の聴取確定。理由は字幕ブロックと実際の声の開始を区別し、版違いの導入も確認するため。難度：中。推奨：GPT-6.1 Sol／high。ユーザー操作：聴取ページで4本を再生し「①秒、②秒、③非収録確認／相違あり」と返信。確認値を反映・再検証した後、CREAMだけの本番公開承認を受け、未変更publish-main.mjsのみで公開する。次の記事へ進まない。
