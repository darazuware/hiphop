# Design spec — Shook Ones Pt. II ドキュメンタリー

## Visual identity
- 背景: `#111111`(waxthink.com本体の`--c-bg`と統一)
- アクセント: ゴールド `#D4AF37`(`--c-gold`)/ライトゴールド `#F0CD6A`(`--c-gold-light`)
- 補助アクセント: オレンジ `#E8700A`(`--c-orange`)、ティール `#4FD1C5`(波形3段の2段目のみ)
- テキスト: `#EEEEEE`(`--c-text`)、控えめ情報は `#999999`(`--c-muted`)
- 画面の大半をテキストキャプションで覆うデザイン(hold-you-down踏襲)。映像/写真はキャプションの背後に覗く構図。

## Typography
- 見出し/大キャプション: **Montserrat**(700/900) — サイト本体のSpace Grotesk(幾何学的サンセリフ)に近い質感で、HyperFrames組み込みフォントのため確実にレンダリングされる
- 日本語本文: **Noto Sans JP**(400/700) — 組み込みフォント
- ラベル/タイムスタンプ/出典表記: **IBM Plex Mono**(400/700) — サイト本体の`.font-mono`と統一

## レイアウト原則
- 1920×1080横長。大見出しは画面上部〜中央、下1/3に映像/写真クロップを配置(hold-you-down式)
- キャプションは1〜2行で区切り、画面を埋めすぎない(3行以上詰めない)
- 波形ビジュアルは専用シーン(Frame3後半)でのみフルスクリーン表示

## モーション基調
- ハイライト/強調: `css-marker-patterns`(黄色マーカー掃引)、`gradient-text-sweep`
- キャプション到着: `waterfall-entry`(カスケード)
- 写真/映像切り替え: `depth-of-field-blur`(ラックフォーカス)、`multi-phase-camera`(緩やかなパン/プッシュ)
- 締め: `titlecard-reveal`(控えめ・静止ホールド)

詳細な各フレームの構成・引用ルール・タイミングは `STORYBOARD.md` を正とする。
