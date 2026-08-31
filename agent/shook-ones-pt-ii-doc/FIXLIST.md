# Shook Ones Pt.II ドキュメンタリー 修正リスト

元データ: `全体について.pages`（本ファイルに全項目を書き出し済みなので以後.pagesは開かなくてよい）
進行順: **B(削除) → A(素材/グローバル) → F(エンディング) → C(アニメーション) → D(音声再生成) → E(字幕/ナレーション同期)**
理由: 尺に影響しない/小さい変更を先に固め、尺が変わる変更(C)→音声(D)→同期(E)の順で後戻りを防ぐ。
**進捗(2026-08-31時点): B・A・F・C完了。次はD(音声再生成、Fish Audioブラウザセッション要)から再開。**

各項目チェック後、`npx hyperframes check` で機械検証。フルレンダーはC後・D後・E後の節目のみ。

提供素材は `assets/images/` `assets/clips_provided/` に整理済み:
- `images/jacket-juvenile-hell.jpeg` / `images/jacket-the-infamous.jpeg`
- `images/teen-photo-stairs.jpeg` / `images/teen-photo-crouch.jpeg`（どちらも「二人がまだ10代」用、両方使うか1枚選ぶか要判断）
- `images/logo-complex.jpeg` / `images/logo-pitchfork.png` / `images/logo-rollingstone.png`（クロップ済みロゴのみ）
- `clips_provided/8mile-opening-bathroom.mov`（8mileオープニング=バスルームの鏡シーン）
- `clips_provided/8mile-climax-battle.mov`（8mileクライマックス=ラストバトルのマイクアップ）
- `clips_provided/kitchen-stove-mv.mov`（本家MVの台所着火音シーン・音声付き）

---

## Phase B — 削除（2項目）✅完了

- [x] B1. 「サンプリング元の逸話」= narration.md Part3内、リリース年+映画/アニメサントラ由来の段落（Fat Albert Rotunda 1969/映画『$』1971/Daly-Wilson結成1968）。**03-beat-making.htmlの字幕には対応ブロックが無く、音声のみが喋っていた**のが「シンクロしてない」の正体。narration.mdから該当段落を削除済み。要Phase D: `part3-beat.mp3`再生成。
- [x] B2. 「同誌のこの企画、1位はGrandmaster Flash」を削除 — 対象は`06-8mile.html`ではなく**`07-acclaim.html`**（narration.md Part7 + `f07-acclaim-c3`ブロック+aside）。narration.md・HTML両方から削除済み。要Phase D: `part7-acclaim.mp3`再生成。

## Phase A — 素材差し替え/グローバル（10項目）✅完了

- [x] A1. 英語フォント全てInter(Extra Bold=weight 800)に統一（見出し/キャプションのMontserratだけでなく波形ラベル・出典表記等IBM Plex Monoも含め全部、ユーザー確認済み）— 8フレーム23箇所を機械置換。09-endcard.htmlはPhase Fで新規作成時に反映。
- [x] A2. WAX&THINKウォーターマーク追加（hold-you-downの`#video-watermark`レシピを移植: Inter 900・opacity 0.55・text-stroke） — `index.html`ルートに1箇所追加（全frame重複させず、0〜413.9sで表示）。
- [x] A3/D5. "Pt. II"の読み上げをnarration.mdで「パートトゥー」に修正（オンスクリーン表記は正式表記のまま"Pt. II"を維持）— `narration.md` Part1。要Phase D: `part1-hook.mp3`再生成。
- [x] A4. Havocドアップ→Queensbridge街並みに変更 — `assets/clips/02-qb-courtyard.mp4`から静止画切り出し(`queensbridge-street.jpg`)。`02-background.html`のphoto-world構成を3枚→5枚に再構成(a:QB街並み/b:Juvenile Hellジャケット/c:10代写真/d:Infamousジャケット/e:Havoc&Prodigy)、ラックフォーカス4箇所に増設。
- [x] A5. Juvenile Hellジャケット表示 — `02-background.html` world-b（A4と同時に実装）
- [x] A6. 「二人はまだ10代」当時写真 — `02-background.html` world-c、`teen-photo-crouch.jpeg`採用（stairs版は不使用・予備）
- [x] A7. The Infamousジャケット表示 — `02-background.html` world-d（A4と同時に実装）
- [x] A8. 8mileオープニング/クライマックス動画差し替え — **対象は06-8mile.htmlではなく`01-hook.html`**（該当フレーズ"あのオープニング"/"最後のバトル"はPart1側）。提供.mov(HEVC/縦回転メタデータ)をH.264 1920幅以下・30fpsへ変換(`assets/clips/06a-8mile-opening.mp4`, `06b-8mile-climax.mp4`)、旧`01b-8mile-teaser.mp4`挿入を2本の実クリップに置き換え、後続の静止画プッシュのタイミングも再計算。
- [x] A9. 台所の着火音くだりを本物のMV(音付き)に差し替え — `03-beat-making.html`のh3-cap-9(台所コンロ神話紹介)の窓に新規videoカードを追加(`assets/clips/03-kitchen-stove-mv.mp4`+対応audio要素)。同じくHEVCから変換済み。
- [x] A10. Pitchfork/RollingStone/Complexをロゴのみに変更 — `07-acclaim.html`の画像src差し替え+CSSをcover→contain(クリーム背景)に変更。ロゴ画像はPages文書から抽出・書き出し確認済み。

**素材変換メモ**: 提供された3本の.mov(`assets/clips_provided/`に保管)はHEVCコーデック+90°回転メタデータ付きのiPhone画面収録。ffmpegで自動回転を確認の上、H.264/AAC/30fpsへ変換して`assets/clips/`に配置。回転処理は手動指定不要（ffmpegのデフォルト自動回転で正しい向きになることをフレーム抽出で目視確認済み）。

## Phase F — エンディング（1項目）✅完了

- [x] F1. エンディングをhold-you-downと同じ方式に変更 — `09-endcard.html`をhold-you-down方式（実写映像+キャプション→ブランドカード）に全面書き直し。未使用だった`assets/clips/08-qb-legacy.mp4`（QB街並み・5.0秒）を closing shot に採用、Ken Burnsプッシュインの後グラデーション背景へクロスフェード。あわせて字幕フォントもA1未反映分（IBM Plex Mono/Montserrat）をInter(kicker/sub=800・logo=900)に統一。
  - **E7を同時解決**: whisper.cpp(`ggml-small.bin`, `-ml 1 -sow`)で`part9-outro.mp3`を単語区切りアライメントした結果、実際の発話境界は「消されかけた...伝説になった。」=0-8.08s／「それがShook Ones, Pt.IIという曲です」=8.08-11.68sと判明（旧実装は4.0/6.6sで分割しておりナレーションと大きくズレていた＝これがE7の正体）。キャプション2枚の切替を7.7s/8.15sに修正。
  - **尺の変更**: ナレーション終了後にブランドカード（WAX&THINKロゴ）を表示する余白が旧11.6s尺に収まらないため、`09-endcard.html`のdata-duration/scene-09を11.6s→16.0sへ延長（`index.html`のroot/bg data-durationも426.3→430.7へ連動）。ナレーション音声(`narration-09`)自体は11.6sのまま変更なし＝末尾4.4秒はhold-you-down同様の無音ブランドホールド。
  - 検証: `npm run check`（0 error）＋`npx hyperframes snapshot`で415.5/419/422.8/424/425.8/427.5/430.5sの各ビートを目視確認済み。

## Phase C — アニメーション/レイアウト（6項目）✅完了

- [x] C1. ジャケット重なりアニメーションを解消 — `03-beat-making.html`。回転・重なり配置(jones/daly/hancock)を廃止し、narration/entrance順に合わせてHancock(Jessica)/Jones(Kitty)/Daly(DirtyFeet)を左→右へ等間隔(left:160/830/1500px, 260x260, 無回転)で配置。
- [x] C2. ジャケットタグ(アーティスト名/曲名)を3倍拡大 — `03-beat-making.html`。14px→42px(Inter 800のまま)、width480pxのtop起点配置に変更(旧bottom起点だと肥大化したテキストが上へ食い込むため)。
- [x] C3. 波形順とジャケット順を一致 — C1の左→右並び(Hancock/Jones/Daly)が既存の波形上→下順(Jessica/Kitty/DirtyFeet)・キャプション登場順と一致するよう揃えたため、波形DOM順の変更は不要だった。
- [x] C4. 該当ジャケットを囲む演出を追加 — `03-beat-making.html`。`.h3-jacket-ring`(gold border+glow)を各ジャケットに追加し、対応するキャプション表示中(7.0-12.3/12.9-17.3/17.9-22.3)だけfromTo opacityでフェード。
- [x] C5. 波形に音声再生を追加 — `03-beat-making.html`。既存の`assets/waveform/sample-{jessica,kitty,dirtyfeet}-8s.wav`(8秒・既存アセット)を各波形revealの2秒前からdata-startして白波形(周辺音)→着色部分(実サンプル)へ連続再生。3サンプル説明後(cap-4, 22.9s)に`beat-sample-8s.wav`(合成ビート)を追加再生して「重ねた質感」を聴かせる。
  - **2026-08-31追記（演出リデザイン）**: 運営者からTracklib公式「Sample Breakdown: Mobb Deep - Shook Ones」動画（スマホ経由で共有）を参照に、波形演出をTracklib風の2段表示へ作り替え。各行を「thin dim context strip（常時薄く見える波形の全体像・アクセントカラーのglow枠付き）」＋「main strip（colored reveal・playhead付き・従来のスクラブ再生を継続）」の2層構成に再構築し、波形の左に曲名＋リリース年（Jessica 1969 / Kitty 1971 / Dirty Feet 1975）のラベルを追加。当初はTracklib同様「曲名＋by アーティスト＋年」のフル表記を波形行内に収めようとしたが、(a)左マージン(160px)に収まらずcanvas外へのはみ出し、(b)行内に置くと下部キャプション帯とテキストが実際に重なる(content_overlap error)ことが判明したため、アーティスト名はジャケット側で既出のためラベルは「曲名＋年」の短縮形に整理して解決。`npm run check`は0 error/0 warning（15 info=既存許容パターン＋新規のtext_occluded info数件）。`npx hyperframes snapshot`で62.5/64.5/68.5/73.5/78.5sを目視確認済み。**8秒ファイル内の「実際のサンプリング箇所」の頭出し位置自体（元のレビュー待ち事項）は今回未着手** — 提供動画はTracklibの元曲（未トリミングの全曲）基準の波形のため、こちらの8秒切り出しクリップ内の相対位置には直接使えなかった。頭出し位置の実測が必要なら別途要指示。
  - **2026-08-31再追記(レビュー指摘の修正)**: Telegramでのレビューで2点指摘 — 「波形と字幕が被っている」「どの部分をサンプリング抽出したのか色付けされていない」。原因調査の結果、後者は当初の2段(context/main)構成が実質同一波形の見せ方違いに過ぎず「サンプル範囲」を明示していなかったこと、前者はcaptionゾーン(bottom:86px・最大3行で高さ約286px)とwave-stack(top:705px)が構造的に重なる領域を持っていたこと(実は本redesign以前からの潜在バグ・row2/3は1行キャプションでも隠れていた)が判明。対応: ①2段構成を廃止し単層(base+colored reveal)へ簡素化、②各行に色付き半透明バンド(`.h3-wave-band`)を追加— 8秒クリップ自体がループ済みの抽出サンプルそのものである以上「全体を色付けする」のが正直な表現と判断、③行の高さを110px→42pxへ圧縮しwave-stack合計高さを358px→126pxに削減、1行キャプション(box top≈861px)を確実にクリアするよう再配置(705〜831px着地)。`npm run check`は0 error/0 warning(13 info)。`npx hyperframes snapshot`で62.5/68.5s等を目視確認し、字幕とのオーバーラップ解消・色付きバンドの視認性を確認済み。Telegramへ更新版クリップ再送済み。
  - **2026-08-31三度目追記(ハイライト区間を「全体色付け」から「実際に再生される範囲だけ」へ修正)**: 運営者からback-to-the-melody/hold-you-downプロジェクトの実例(ジャケット+波形+赤い部分ハイライト+白playhead線のスクリーンショット)を提示され「以前と同じ手法でやってほしい」と指示。Exploreサブエージェントで`hold-you-down/index.html`の実装を調査し、`width` + `overflow:hidden`のネスト構造(clip-pathはHyperFramesの決定論的レンダーでアニメーションしないことをhold-you-down側で実測済み・幅0%→100%のtweenのみが有効)を移植。直前の実装(行全体を色付け)を「ハイライト区間=8秒ファイル中、実際に再生される部分(`data-duration`: jessica 7.0s/kitty・dirtyfeet 6.5s、いずれも8.0sクリップ中)」に限定するよう修正 — `ffmpeg silencedetect`で3ファイルとも該当カットオフ直後に実際の無音ギャップがあることを確認済み(未再生の末尾は本当に「使われていない」)。`.h3-wave-highlight`という固定幅(1400px/1300px/1300px、1600px中)のoverflow:hiddenボックスを新設し、その内側でのみ着色reveal+playheadがスクロールする構造。`npm run check`は0 error/0 warning。`npx hyperframes snapshot`で66/80.5s等を目視確認し、ハイライト後の未着色の尾(ファイル終端の無音部分)が視覚的に明確に区別されることを確認済み。
  - **2026-08-31四度目追記(本当の原因: レンダー動画だけが壊れていた・fast-capture不具合)**: 運営者から「縦バーが波形をなぞり通過後に色が付く、という動きになっておらず、ただ波形が表示され音が流れているだけ」「字幕もまだ被っている」と再度指摘。調査の結果、**このプロジェクトの`.astro`/CSS実装自体は正しく、`npx hyperframes snapshot`は最初から一貫して正しいアニメーション途中経過を返していた**が、Telegramに送っていた確認用MP4(`hyperframes render`のdraft品質プレビュー)だけが壊れていた。原因はHyperFramesのデフォルト`--experimental-fast-capture`(Chrome `drawElementImage` APIによる高速キャプチャ)— reveal要素の`width`アニメーションの変化を正しく検知できず、1〜12秒台のフレームがバイト単位で完全に同一(=常に100%revealed済みの静止画)になっていた。`--no-experimental-fast-capture`(通常のスクリーンショットキャプチャ)で再レンダーすると、白playheadが波形をなぞりながら色が伸びていく正しい動きを確認。字幕オーバーラップも、このフリーズしたフレームのせいで「常に全幅着色されたバンド」が字幕と近接して見えていただけで、正しいキャプチャでは字幕とwave-stackの間に十分な余白があることを確認(C5の行圧縮修正自体は有効だった)。
  - **恒久対処**: `package.json`の`render`スクリプトへ`--no-experimental-fast-capture`を追加し、以後このプロジェクトの全レンダー(`npm run render`含む)がデフォルトで安全なキャプチャモードを使うよう固定。**手動で`npx hyperframes render`を叩く際も必ず`--no-experimental-fast-capture`を付けること**(付け忘れると今回と同じ「アニメーションが止まって見える」壊れたプレビューになる)。フルレンダー(Phase D/E後の節目)でもこの設定を維持する。
  - **2026-08-31五度目追記(本当の不具合その2: revealが音声と2秒ズレていた)**: fast-capture修正後の動画を確認した運営者から「縦バーが右へ移動しているだけで音とシンクロしていない。hold-you-downではできていたのに」と指摘。確認したところ、`.h3-wave-*-reveal`のGSAPタイムは対応する`<audio>`要素の`data-start`より常に+2.0秒遅れて開始し、`duration`も実際の`data-duration`(7.0/6.5/6.5s)より短く(5.0/4.5/4.5s)、かつ`ease: "power1.inOut"`(イーズイン・アウト)を使っていた ― 対してhold-you-down側は`ease: "none"`(等速)。イーズが付くと再生速度が一定の音声とバーの速度が常にズレる。修正: reveal開始時刻を対応audioの`data-start`と完全一致させ、durationも`data-duration`と完全一致させ、easeを`"none"`に変更(1600px=8.0s→200px/秒の等速)。`hyperframes snapshot`で60.7/62.45/64.2/67.7sの各点のplayhead位置を実測し、想定ピクセル位置(経過秒数×200px/s)と一致することを確認済み。
  - **2026-08-31六度目追記(事実修正+レイアウト全面作り替え=jacket-zoom×waveform-spotlight方式)**: 運営者から2点指摘。①「真ん中の波形(Kitty With the Bent Frame)はハイハットじゃなく金管楽器/ホーンの音だと思う」→ WebSearch/WebFetchでWikipedia「Shook Ones, Part II」・WhoSampled・beatsboxingmayhem.comを裏取りした結果、**Kitty With the Bent Frameが提供するのは「ストリングス」**(ホーンでもハイハットでもない)、**Jessica=ピアノ、Dirty Feet=ドラム**が正しい。さらに「あのハイハットの音」自体は、Complex/REVOLT誌のHavocインタビュー("The truth of the matter is that the hi-hat that I used on the actual track of 'Shook Ones' sounds similar to a project stove.")によれば**どのレコードからもサンプリングされていない、Havoc自身が選んだハイハット**(ガスコンロの着火音に似ているのは偶然、というのが2020年時点の本人の説明)。narration.md Part3および`03-beat-making.html`のcap-2(Kitty)を「ストリングス」に、cap-4を「この3つに、Havoc自身のハイハットを重ねて」に修正 ― Phase 9(スタウ神話)の「あのハイハットの音は…」という呼び戻しが正しく機能するよう、ハイハットをHavoc自身の別素材として先に導入する形にした。**Phase Dでのpart3-beat.mp3再生成にこのテキスト変更も反映すること。**
    ②「hold-you-downに比べて波形が細すぎる。半透明マスクのせいで着色箇所が見づらい」→ 運営者と相談の上、**ジャケット常時小型化+紹介中のみズームイン、波形も紹介中のみ大きくなるスポットライト方式**へ全面作り替え。ジャケットはt=3.2sで0.62倍に縮小(タグも一緒に縮小、`.h3-jacket-tag`が子要素のため)、各サンプルのリング表示と同時に1.0倍へズームバック。波形行は`position:absolute`化し、通常時は高さ18pxの細い3本(top:0/26/52、常時ラベル可視)、紹介中の1本だけ`height:150px`(実質top:0の共有スポットライト位置へ`y`transformで移動)まで拡大表示してz-index最前面へ。半透明の着色バンド(`.h3-wave-highlight`のbackground/box-shadow)は完全撤去し、白(base)と着色(reveal)の2枚の画像コントラストのみで見せる方式(hold-you-down本来の技法)に統一。副作用として紹介中でない2本のメタラベルが位置的に衝突する(`content_overlap`エラー)問題が出たため、スポットライト中は非アクティブ2本の`.h3-wave-meta`をopacity 0へ一時フェード。`top`ベースの移動はHyperFramesのlintで`gsap_non_transform_motion`エラー(整数px丸めでカクつく)に引っかかったため、`top`は各行のCSS既定値に固定し、移動は`y`(transform)のみで行うよう修正。`npm run check`は0 error/0 warning。`hyperframes snapshot`で紹介中(ジャケットズーム+大波形+正しいストリングス字幕)・全休止中(3本とも極小・ラベル可視)の両状態を目視確認済み。
- [x] C6. Pt.I→Pt.II演出 — `05-part1-to-part2.html`。Pt.Iのグラデーションを白基調に変更(#4a4a4a/#d9d9d9→#aaaaaa/#ffffff/#cfcfcf)。REMAKE_START時にPt.Iをopacity維持のままx:-480pxへスライド、Pt.IIをx:+480px位置(CSS初期値)でopacityフェードイン、間に矢印(→ Inter 900 130px gold)をscaleX 0→1で描画。

**検証**: `npm run check`(0 error, 12 info=既存許容パターン) + `npx hyperframes snapshot`で03(56.7/60.5/64.2/70.2/75.2/82/103.5/108/119.6/121s)・05(253.6/262/266.5s)の各ビートを目視確認済み。ジャケット非重複・タグ可読・リング演出・波形/ジャケット順一致・Pt.I→II演出とも意図通り。フルレンダーは未実施(Phase D後の節目でまとめて実施予定)。

## Phase D — 音声再生成（Fish Audio、テキスト側は準備完了・要ブラウザセッション）

narration.md側のテキスト修正は完了済み。以下すべてFish Audioでの再生成が必要（部位ごとにバラバラ実行せず1セッションでまとめる）:
- [x/ ] D1+D2 テキスト修正済み（「手応えのないビート」「ボツにして」）／[ ] 音声再生成 — `assets/narration/part3-beat.mp3`（B1の逸話削除、および2026-08-31の事実修正=Kitty With the Bent Frameは「ハイハット」ではなく「ストリングス」・ハイハットはHavoc自身の別素材、と合わせて全面再生成になる。詳細はC5追記参照）
- [x/ ] D5(=A3) テキスト修正済み（"パートトゥー"）／[ ] 音声再生成 — `assets/narration/part1-hook.mp3`
- [ ] D3. 「消されかけた1本のビート〜」が「水をかけた」に空耳する → 発音明瞭化して再生成 — `assets/narration/part6-8mile.mp3`（.bak既存あり、要確認。これもpart3-beatと同じセッションでまとめて対応可）
- [ ] D4. Part.6冒頭が聞き取れない → 該当箇所を再生成 — `assets/narration/part6-8mile.mp3`
- [x/ ] B2連動 テキスト削除済み（同誌企画くだり）／[ ] 音声再生成 — `assets/narration/part7-acclaim.mp3`

**Fish Audio再生成が必要な音声ファイル一覧**: part1-hook.mp3 / part3-beat.mp3 / part6-8mile.mp3 / part7-acclaim.mp3（4本。voice選択はユーザー確認必須 — [[feedback_fish_audio_browser_workflow]]参照）

## Phase E — 字幕/ナレーション同期（全部の尺・音声が確定してから、6項目）

- [ ] E1. 1995年2月7日 → 冒頭で一度出ているので2回目は「1995年」に短縮 — `06-8mile.html`
- [ ] E2. 字幕（特別な扱い等）が表示されていない箇所を追加 — `06-8mile.html`
- [ ] E3. havocインタビューの字幕が先行して大きくズレている → タイミング修正 — `06-8mile.html`
- [ ] E4. prodigyの死の字幕とナレーションがズレている → タイミング修正 — `06-8mile.html`
- [ ] E5. prodigyの壁画が映り続けて「残っています」の説明と尺が合わず弱くなる → タイミング調整 — `06-8mile.html` / `assets/images/prodigy-mural-qb.webp`
- [ ] E6. 「映画のクライマックスを支」で改行される表示バグ → 「映画のクライマックスを支え」で改行されるよう修正 — `06-8mile.html`（CSS/文言の折返し位置）
- [x] E7. 「それがshook〜という曲です」の字幕がナレーションとズレている → Phase F(F1)でエンディング全面差し替え時に解決済み。詳細はF1の項目を参照。

---

## 素材の残課題
- `teen-photo-stairs.jpeg` と `teen-photo-crouch.jpeg` のどちらを使うか（または両方使うか）は実装時に画面尺と相談
- Complexのロゴは `logo-complex.jpeg`（JPEG・背景が白地でない可能性）→ 実装時に透過PNG化が必要か確認
