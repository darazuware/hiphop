---
workflow: general-video
flow: automation
storyboard: no
message: "8 Mileで流れたあの緊張感のビートは、3枚のサンプル重ねと、消されかけた1本のテープから生まれた"
destination: youtube-long
aspect: 1920x1080
language: ja
audience: 洋楽/ヒップホップトリビア好きの日本語話者(waxthink.com読者層)
length: 10m
angle: narrative
narration: yes
---

## Intent

waxthink.com(hiphopプロジェクト)の曲記事「Shook Ones Pt. II」(Mobb Deep, 1995)に紐づくYouTube長尺解説ドキュメンタリー。水増しなしで実質10分、フック→背景→ビート制作秘話→リリック深掘り→Part I/II経緯→8 Mile秘話→批評的評価→レガシー→締めの9パート構成(内容は既にユーザーと確定済み、下記Notes参照)。完成後は各パートを30秒〜1分のショートに切り出し「続きは本編へ」で本編へ誘導する二次利用計画があるため、各パートは単独でも見出しが立つよう作る。

スタイル参照は別プロジェクト back-to-the-melody の hold-you-down ショート(/Users/ktamatzmoto/Desktop/back-to-the-melody/songs/hold-you-down)。フック→トリビア→評価→締めエンドカードの構成、画面の大半をテキストキャプションで覆うデザイン、MV/映像断片は数秒だけ無加工でそのまま使用しContent IDクレームを受け入れる方針を踏襲する。今回は尺が長いため上記9パート構成に拡張。

ユーザーは「お任せで、俺がチェックする」と明言(自律実行・逐次確認なし。完成後にユーザー本人がレビューする)。

## Assets

- agent/shook-ones-pt-ii-doc/../shook-ones-pt-ii/assets/video/8mile-trailer-source.mov — 8 Mile(2002)公式トレーラー(16秒フル尺)。使用は5秒までとユーザー了承済み(映画スタジオ物のため通常のMV断片運用より厳格に制限)。
- agent/shook-ones-pt-ii/assets/photos/sample-hancock-fat-albert-rotunda.jpg — Herbie Hancock『Fat Albert Rotunda』ジャケット(サンプル元1)
- agent/shook-ones-pt-ii/assets/photos/sample-quincy-jones-dollar.jpg — Quincy Jones『$』ジャケット(サンプル元2)
- agent/shook-ones-pt-ii/assets/photos/sample-daly-wilson-big-band.jpg — Daly-Wilson Big Bandジャケット(サンプル元3)
- agent/shook-ones-pt-ii/assets/photos/prodigy-young-1.webp — Prodigy若い頃
- agent/shook-ones-pt-ii/assets/photos/prodigy-young-2.jpg — Prodigy若い頃
- agent/shook-ones-pt-ii/assets/photos/prodigy-mural-qb.webp — 2017年死去後にQueensbridgeに描かれた追悼壁画。レガシーパートの締めに使用
- agent/shook-ones-pt-ii/assets/photos/havoc-with-prodigy.jpg — HavocとProdigyのツーショット
- agent/shook-ones-pt-ii/assets/photos/havoc-recent-1.jpg — Havoc写真
- agent/shook-ones-pt-ii/assets/photos/havoc-recent-2.jpg — Havoc写真
- agent/shook-ones-pt-ii/assets/photos/press-rolling-stone.jpg — Rolling Stone「50 Greatest Hip-Hop Songs of All Time」誌面スクショ(35位)
- agent/shook-ones-pt-ii/assets/photos/press-pitchfork-1.png — Pitchfork「Top 200 Tracks of the 1990s」誌面スクショ(25位)
- agent/shook-ones-pt-ii/assets/photos/press-pitchfork-2.jpg — Pitchforkレビュー本文スクショ(歌詞原文引用あり・キャプションには転記しないこと)
- agent/shook-ones-pt-ii/assets/photos/press-complex.jpg — Complex記事スクショ(読者投票で史上最高のラップビート1位)
- MV公式(YouTube): https://youtu.be/yoYZf-lBF_U — 数秒の断片のみ無加工で使用
- Havoc本人のビート解説インタビュー(Tracklib, YouTube): https://youtu.be/Zhcp9RCXBho — 波形/スタジオ映像を数秒拝借
- QB街並み映像(GhettoMerica「QUEENS NYC HOODS」, YouTube): https://youtu.be/NAK5WcNPCEk — 数秒切り抜き

## Customizations

- 画面の大半をテキストキャプションで覆うデザイン(hold-you-down踏襲)。日本語ナレーション音声はFish Audio生成(ブラウザ操作で取得、API不使用)。
- MV/映像断片は無加工のまま数秒のみ使用、検知回避加工は一切しない。Content IDクレームは受け入れる前提。
- 歌詞原文はキャプションに引用しない(ナレーション内の解説のみ・断定的な直接引用は避ける)。

## Notes

確定済みの9パート構成(実質10分・パディングなし。事実は全てWebSearchで裏取り済み):

1. フック(0:30) — 8 Mile(2002)オープニング/ファイナルバトルで流れた曲という導入
2. 背景(1:30) — Queensbridge、Havoc & Prodigyの出会い、『The Infamous』制作経緯
3. ビート制作(1:30) — Herbie Hancock「Jessica」+ Quincy Jones「Kitty With the Bent Frame」+ Daly-Wilson Big Band「Dirty Feet」の3サンプル重ね。Havocが一度消そうとしたビートをProdigyが「残せ」と止めて世に出た逸話。ハイハットが「台所のストーブの着火音」という都市伝説をHavoc本人が後年(2023年)「作り話。本当の話よりそっちの方が面白いから広まるままにしてる」と否定した経緯も入れる。
4. リリック深掘り(2:00) — 19歳のProdigyが書いた言葉、当時のQBの現実。Pitchforkレビューが触れた鎌状赤血球症(sickle cell)という土台(過度な因果断定はしない。Prodigyは生後3ヶ月で診断、生涯の闘病がニヒリズム・赤裸々なリリックの根底にあると本人が語っている、という一般的な影響として扱う)。
5. Part I→Part II(1:00) — 前作『Juvenile Hell』の不発を受けた不安から、一度出したプロモ盤(1994年)を作り直し、Pt. IIとして1995年2月7日『The Infamous』リード曲としてリリース。
6. 8 Mile秘話(1:00) — 採用経緯(オープニングのB-Rabbit楽屋シーンとファイナルバトルの2箇所で使用)、Havoc本人の反応。
7. 評価(1:00) — Rolling Stone「50 Greatest Hip-Hop Songs of All Time」(2012年12月・33人のアーティスト/批評家投票、1位はGrandmaster Flash「The Message」)で35位。Pitchfork「Top 200 Tracks of the 1990s」(2010年)で25位。Complex誌の読者投票で史上最高のラップビート1位に選出(編集部評価では2位だったが読者投票で1位に上昇)、Havoc本人「ファンからの評価であり、グラミー賞よりも価値がある」という発言。同記事内でNasも絶賛したという逸話あり(補助トリビアとして余裕があれば)。
8. レガシー(1:30) — 今も使われ続けるフリースタイルの定番ビート。2017年6月20日のProdigy死去後、同年7月1日にNasがオランダWoo Hah! Festivalで本曲を演奏し「RIP Prodigy」コールをリードした追悼エピソード。
9. 締め(0:30) — まとめ。

著作権方針(厳守): MV/映像断片は無加工のまま数秒のみ使用。検知回避加工(反転・ノイズ付加等)は一切行わない。Content IDクレームは受け入れる前提(収益は権利者へ)。8 Mileトレーラーのみ特別に5秒上限(映画スタジオ物のため)。歌詞原文の引用は最小限に留め、キャプションには転記しない。

自律実行モード: ユーザーから追加の確認・質問は求められていない(flow: automation, storyboard: no)。完成後にユーザー本人がレビューする。
