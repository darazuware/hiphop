---
format: 1920x1080
duration: 5m45s
message: "8 Mileで流れたあの緊張感のビートは、3枚のサンプル重ねと、消されかけた1本のテープから生まれた"
arc: フック(8 Mileの記憶) → 背景(QB/Havoc & Prodigy) → ビート制作秘話 → リリック深掘り → Part I→II経緯 → 8 Mile秘話 → 批評的評価 → レガシー → 締め
audience: 洋楽/ヒップホップトリビア好きの日本語話者(waxthink.com読者層)
mode: autonomous
---

## Frame 1 — フック

- scene: MVの冒頭カットを背景に、黄色ハイライト風の大見出し「あの緊張感、8 Mileで聴いたことがある」が画面の大半を覆う。hold-you-down踏襲のフックデザイン。ナレーション「両方で流れていたビート、覚えていますか」の直後、2〜3秒ナレーションを止めてMV実音源をそのまま聴かせる無音ナレーション区間を挟む。8 Mileトレーラー(5秒予算のうち約2.5秒)をこのフックの冒頭でティザー的に使用。
- duration: 26.0s
- transition_in: cut
- status: outline
- voiceover: "にせんにねん公開の映画『エイト・マイル』。Eminem演じるB-Rabbitが、汚れたトイレの鏡の前で自分を落ち着かせるあのオープニング。そして映画のクライマックス、最後のバトル。両方で流れていたビート、覚えていますか。Mobb Deep『Shook Ones, Pt. II』。せんきゅうひゃくきゅうじゅうごねんの曲です。その中身を今日は深掘りしていきます。"
- src: compositions/frames/01-hook.html

Shape: 単一ブループリントは無し(製品デモ向けの22種は本ドキュメンタリーの意匠に合わない)。ルール構成 = `waterfall-entry`(見出しカスケード到着)+ `css-marker-patterns`(「8 Mile」部分に黄色ハイライトのマーカー掃引)+ `coordinate-target-zoom`(MV静止フレームへの緩やかなズーム)。MV断片(`assets/clips/01-hook-mv.mp4`)は無加工で3〜4秒のみ使用+8 Mileトレーラー断片(`assets/clips/01b-8mile-teaser.mp4`・2.5秒・Frame6と合計5秒の枠内)をティザー挿入。「覚えていますか」の直後2〜3秒はナレーション休止・MV実音源のみ聴かせる。

## Frame 2 — 背景

- scene: QB街並み映像(GhettoMerica素材)+ Havoc/Prodigy若い頃の写真をクロスフェードで切り替え、大きめ日本語キャプションが下部を占める。
- duration: 29.2s
- transition_in: crossfade
- status: outline
- voiceover: "ぶたいはニューヨーク、クイーンズブリッジ団地。ハボックとProdigyは同じ高校で出会い、Mobb Deepを結成しました。デビューアルバム『Juvenile Hell』は、正直そこまで話題になりませんでした。二人はまだ10代。次のアルバムで結果を出せなければ終わる、という空気があったそうです。その不安の中で作られたのが『The Infamous』。この曲はそのアルバムを代表する1曲になりました。"
- src: compositions/frames/02-background.html

Shape: ルール構成 = `multi-phase-camera`(QB街並み映像上を緩やかにパン/プッシュ)+ `depth-of-field-blur`(街並み→Havoc/Prodigy若い頃写真へのラック フォーカス切り替え)+ `waterfall-entry`(キャプション到着)。QB映像は数秒切り抜き、無加工。

## Frame 3 — ビート制作

- scene: サンプル元3枚のジャケット(Hancock/Jones/Daly-Wilson)が順にポップインして重なる合成ビジュアル→実音源から生成した自前の波形ビジュアル(hold-you-down方式・Tracklib映像はもう使わない)を数秒表示。大見出し「あのビート、実は3枚のレコードの重ね技」。
- duration: 66.4s
- transition_in: cut
- status: outline
- voiceover: "ハボックが作ったこのビート、実は1枚のレコードではなく3枚を重ねて作られています。Herbie Hancockの「Jessica」からピアノのメロディ、Quincy Jonesの「Kitty With the Bent Frame」からハイハット、Daly-Wilson Big Bandの「Dirty Feet」からドラム。この3つを重ねて、あの不穏な質感を作り上げました。それぞれの元ネタも、掘り下げると面白い組み合わせです。Herbie Hancockの「Jessica」が入っている『Fat Albert Rotunda』は1969年、Blue Noteを離れてWarner Brosに移籍した直後の作品。ビル・コスビーのアニメ番組のために書いた曲を土台にした、Hancock自身にとって最初のファンク方面への本格的な挑戦でした。Quincy Jonesの「Kitty With the Bent Frame」は、1971年の映画『$』ことドルズのサウンドトラック。Warren BeattyとGoldie Hawn主演の銀行強盗コメディで、Little RichardやRoberta Flackも参加しています。そしてDaly-Wilson Big Bandは、1968年にシドニーで結成されたオーストラリアの18人編成ビッグバンド。地球の反対側のジャズバンドのドラムブレイクが、クイーンズブリッジのハードコアラップの名曲になるとは、当時誰も想像していなかったはずです。さらに逸話があります。当時ハボックはこのビートをまだ手応えのないループだと感じていて、消して新しく作り直そうとしていたそうです。ちょうどそこにProdigyが部屋に入ってきて、流れていたビートを聴くなり「待った、それは消すな」と止めた。もしその瞬間が無ければ、世に出ていなかった1曲なんです。ちなみに、あのハイハットの音は台所のガスコンロの着火音がヒントになった、という噂が長年ファンの間で語られてきました。でもハボック本人は後年、これは作り話だと認めています。本当の話よりそっちの方が面白いから、広まるままにしている、と。"
- src: compositions/frames/03-beat-making.html

Shape: ルール構成 = `spring-pop-entrance`(3枚のジャケットが1枚ずつspring popで登場・スタガー)+ `gsap-effects`(audio-visualizer系。実音源から自前生成した波形PNGをhold-you-down方式でスクラブ再生ハイライト)+ `gradient-text-sweep`(「3枚重ね」「消されかけた」の強調テキストにグラデーション掃引)+ `waterfall-entry`(キャプション)。

**波形ビジュアル(確定・3サンプル別カラー版・hold-you-down方式)**: Tracklib動画は使わない(ブランドUIそのまま使用は避ける)。Tracklib「Sample Breakdown: Mobb Deep - Shook Ones Pt II」(短尺版・youtu.be/Eh0kdRVH9m8)で各サンプルが単体で鳴る区間を特定し、実音声を抜き出して自前で3本の波形PNGを生成(ffmpeg `showwavespic`):
- `assets/waveform/wave-dirtyfeet.png`(Daly-Wilson Big Band「Dirty Feet」・元動画t=4-12sから抽出・オレンジ #E8700A)
- `assets/waveform/wave-kitty.png`(Quincy Jones「Kitty With the Bent Frame」・元動画t=14-22sから抽出・ティール #4FD1C5)
- `assets/waveform/wave-jessica.png`(Herbie Hancock「Jessica」・元動画t=30-38sから抽出・ゴールド #F0CD6A・主役サンプル)
3本を縦に積んで表示(各160px高・計520pxの3段構成)。各波形は実際に異なる音源のため波形の形も実際に異なる(確認済み)。hold-you-downのスクラブ再生ハイライト技法(`overflow:hidden`+`width:0→フル幅`のGSAP漸増、白グロー付き再生位置バー、`clip-path`/`scaleX`不使用)を各段に適用可能。MV/Tracklib元音源は数秒のみ無加工使用、Content IDクレーム受け入れ前提は他クリップと同様。単一ビート波形(`beat-wave-base.png`等)は不採用・3サンプル版に置き換え。

## Frame 4 — リリック深掘り

- scene: Prodigy若い頃の写真2枚をゆっくり切り替え、Pitchfork誌面スクショを一部フレームインさせる。「19歳」を強調する数字テキスト。
- duration: 57.5s
- transition_in: crossfade
- status: outline
- voiceover: "このビートに乗せてProdigyが書いたリリックは、当時19歳とは思えないほど容赦のないものでした。クイーンズブリッジという場所のリアルな空気を、飾らない言葉で叩きつけています。Prodigyは生まれつき鎌状赤血球症という病気と闘ってきました。生後3ヶ月で診断され、生涯にわたって発作の痛みと付き合ってきた人です。本人は後年のインタビューで、その闘病が自分のニヒリズムの土台になったと語っています。この曲一曲がその病気について歌っている、というわけではありません。ただ、あの容赦のない言葉の奥に、そういう背景があったことは知っておいていいと思います。Pitchforkは後にこの曲のレビューで、Prodigyを「この5分26秒の間、地球上で最も危険な人物」と評しました。それくらい、リリックの説得力がずば抜けていたということです。"
- src: compositions/frames/04-lyrics.html

Shape: ルール構成 = `depth-of-field-blur`(Prodigy写真間のラックフォーカス切り替え)+ `css-marker-patterns`(「19歳」への丸囲み強調)+ `waterfall-entry`(キャプション段階到着)。Pitchfork誌面スクショは歌詞原文部分を避けてクロップ表示(著作権方針に従い歌詞は転記しない)。

## Frame 5 — Part I からPart II へ

- scene: 『The Infamous』アルバムジャケット(既存写真素材で代用)をspring popで表示、「Part I」「Part II」の対比テキスト。
- duration: 30.8s
- transition_in: cut
- status: outline
- voiceover: "実はこの曲、いきなり今の形で生まれたわけではありません。前作『Juvenile Hell』が不発に終わった不安を引きずる中、Mobb Deepはまず1994年に「Shook Ones」を一度プロモ盤としてリリースしました。でも二人はその出来に納得できなかった。作り直して、より研ぎ澄まされた形にしたのが、1995年2月7日にリリースされた「Shook Ones, Pt. II」。『The Infamous』のリード曲になりました。"
- src: compositions/frames/05-part1-to-part2.html

Shape: ルール構成 = `spring-pop-entrance`(ジャケット登場)+ `gradient-text-sweep`(Part I→Part IIの対比テキストに掃引)+ `waterfall-entry`(キャプション)。

## Frame 6 — 8 Mile秘話

- scene: 8 Mileトレーラー断片(5秒予算のうち残り約2.5秒・無加工)+ 大見出しキャプション。Frame1のティザーと合わせて2箇所に分割配置(著作権合意済みの合計5秒枠は変えない)。**字幕は「QBの地下室」表記のまま、ナレーション音声のみ「クイーンズブリッジの地下室」とフルで読む。**
- duration: 38.4s
- transition_in: cut
- status: outline
- voiceover: "ぼうとうでふれた『エイト・マイル』での使用。オープニングのがくやしーんと、ラストのバトルシーン、2箇所で流れています。『エイト・マイル』は当時のハリウッドが本格的にヒップホップを取り上げた最初期の大作のひとつで、Wu-Tang ClanやNotorious B.I.G.といった曲も劇中に散りばめられていました。その中でもShook Onesは、映画の始まりと終わりを締めくくる曲という特別な扱いを受けています。ハボック本人は当時、EminemがMobb Deepのファンだったとは知らず、心底驚いたそうです。そして使用料が入ってくると分かった瞬間は「頭の中でレジの音が鳴った」と振り返り、そのお金でFendiのセーターを買った、と後のインタビューで笑いながら語っています。クイーンズブリッジの地下室で生まれたビートが、ハリウッド映画のクライマックスを支える。誰も予想していなかった展開でした。"
- src: compositions/frames/06-8mile.html

Shape: ルール構成 = `coordinate-target-zoom`(トレーラー断片への軽いズーム)+ `motion-blur-streak`(トレーラー断片への導入トランジションに速度感)+ `waterfall-entry`(キャプション)。**著作権厳守: 8 Mileトレーラーは16秒フル尺のうち合計5秒のみ使用(Frame1ティザー2.5秒+本Frame2.5秒`assets/clips/06-8mile-trailer.mp4`に分割)、無加工、検知回避加工なし(ユーザー了承済みの特例上限)。**

## Frame 7 — 評価

- scene: Rolling Stone/Pitchfork/Complex誌面スクショが順にフレームイン、ランキング数字(35位・25位・1位)を強調表示。
- duration: 42.4s
- transition_in: crossfade
- status: outline
- voiceover: "この曲の評価は、時間が経つほど上がっています。Rolling Stone誌は2012年、33人のアーティストや批評家に投票を依頼した「史上最高のヒップホップ曲50選」でこの曲を35位に選出。同誌のこの企画、1位はGrandmaster Flash「The Message」でした。Pitchforkは2010年の「90年代ベストトラック200」で25位。そしてComplex誌が読者投票を実施したところ、この曲のビートが史上最高のラップビート第1位に選ばれました。ハボック本人はこの結果について「グラミー賞よりも価値がある」とコメントしています。"
- src: compositions/frames/07-acclaim.html

Shape: ルール構成 = `spring-pop-entrance`(誌面クリッピングが順に登場)+ `counting-dynamic-scale`(35位→25位→1位の数字をカウント/スケール強調)+ `waterfall-entry`(キャプション)。

## Frame 8 — レガシー

- scene: QB街並み映像を再度使用しつつ、Prodigy追悼壁画の写真へゆっくりプッシュイン。しめやかなトーン。
- duration: 42.8s
- transition_in: crossfade
- status: outline
- voiceover: "さんじゅうねんちかく経った今も、このビートはフリースタイルバトルの定番として使われ続けています。そして2017年6月、Prodigyが42歳で亡くなりました。ラスベガスでのライブ後、鎌状赤血球症の発作で倒れて入院しましたが、検視の結果、直接の死因は入院中の誤嚥による事故死だったと発表されています。その11日後、Nasはオランダで開催されたウーハーフェスティバルのステージでこの曲を演奏し、「RIP Prodigy」と客席に呼びかけました。クイーンズブリッジの街には、今もProdigyを描いた追悼の壁画が残っています。"
- src: compositions/frames/08-legacy.html

Shape: ルール構成 = `multi-phase-camera`(壁画写真へのゆっくりしたプッシュイン)+ `ambient-glow-bloom`(しめやかなトーンの淡いグロー)+ `waterfall-entry`(キャプション)。QB映像は数秒切り抜き、無加工。

## Frame 9 — 締め + エンドカード

- scene: 締めのキャプション一枚をタイトルカードとして提示 → waxthink.comブランディングのエンドカード。
- duration: 11.6s
- transition_in: crossfade
- status: outline
- voiceover: "消されかけた1本のビートが、映画のクライマックスを支え、専門誌が認める伝説になった。それが『Shook Ones, Pt. II』という曲です。"
- src: compositions/frames/09-endcard.html

Shape: ブループリント `titlecard-reveal`(締めの落ち着いた1枚カード演出、控えめな1モーションで静止ホールド)を採用。

## Notes

- 全編通じて画面の大半をテキストキャプションで覆うデザイン(hold-you-down踏襲)。
- MV/映像断片は無加工のまま数秒のみ使用、検知回避加工は一切しない。Content IDクレームは受け入れる前提。
- 歌詞原文はキャプションに引用しない。Pitchfork誌面スクショ使用時は歌詞行を避けてクロップする。
- narration.md に全文台本あり。TTSはFish Audio(ブラウザ操作)で生成済み。音声ファイルは `assets/narration/part1-hook.mp3`〜`part9-outro.mp3`(Ethanボイス)。実尺合計5分40秒(台本執筆時の見積もり10分半より短い。読み上げ速度が想定より速かったため、実音声尺を正とする)。
- **発音対策(確定)**: 英語読み対策で漢数字/年号・固有名詞の一部をひらがな/カタカナ表記に変換して読ませている(例: 2002年→にせんにねん、Havoc→ハボック、8 Mile→エイト・マイル、冒頭で触れた→ぼうとうでふれた、楽屋シーン→がくやしーん、30年近く→さんじゅうねんちかく、Woo Hah! Festival→ウーハーフェスティバル)。キャプション(字幕)表示は元の表記のまま(「QBの地下室」等、ナレーションのみフル表記に変える箇所あり・Frame6参照)。
- **音声ファイル検証手順(確定・重要)**: Fish AudioのUIは複数生成が並ぶとhistory行と実際の再生src(taskId)がズレることがあり、durationだけでの一致確認は誤判定しうる(実例: Part1とPart2で取り違え発生)。ダウンロード後は必ず `whisper-cli -m ~/.cache/hyperframes/whisper/models/ggml-small.bin -l ja -nt -f {file}.mp3` で書き起こし、期待する台本と内容が一致するか確認してから確定させる。
