# パンチラインショート量産システム（サイト非掲載・SNS手動アップ用）

黒背景＋白文字のみの無音縦動画（1080x1920）を、1曲から複数クリップ量産する。
音源は**各SNSのアプリ内サウンド**（Instagram/TikTok/YouTubeの公式音源）を投稿時に付ける。
動画自体に音源・PV映像を一切含まないので Content ID リスクゼロ。AdSense対策のためサイトには載せない。

## 任務3点セット
- **入口**: `node agent/src/punchline-shorts.mjs init --slug {slug}`
- **DoD**: `node agent/src/punchline-shorts.mjs check --slug {slug}` 全✅（exit 0）
- **出口**: mp4/captionは `agent/shorts-out/{slug}/`（gitignore・手動アップロード）。
  `agent/{slug}/assets/punchlines.json` のみcommit（`agent/`配下＝インフラ扱いでmain直push可）

## フロー（Sonnetでもこの順で回すだけ）
```
1. node agent/src/punchline-shorts.mjs init --slug {slug}
   → .astroからeng/jpn候補を抽出し、音源DL＋whisperで各候補の絶対秒(abs)を自動解決
   → さらにYouTube公式キャプションを取得して二重照合（capT/subT/nonContiguousを焼く・v2）
   → agent/{slug}/assets/punchlines.json が生成される（candidates[]にabs/confが入る）
   ※前提: 曲記事が存在すること（記事なしのショートは作らない）
   ※[guard]警告（non-contiguous / drift）が出た候補はその時点で使用対象から外す

2. punchlines.json の clips[] にパンチラインを定義（下記フォーマット）
   - 候補選定基準は docs/shorts-strategy.md と同じ:「その曲で一番強い1〜2表現」、
     迷ったら記事のhighlights先頭。連続する2〜4候補で1クリップ
   - abs=null の候補を使う場合は tManual で秒を指定（下記）
   - 1曲あたり2〜4クリップが目安

3. node agent/src/punchline-shorts.mjs render --slug {slug}
   → agent/shorts-out/{slug}/{slug}--{clipId}.mp4 と .caption.txt を量産

4. node agent/src/punchline-shorts.mjs check --slug {slug}
   → 全✅になるまで修正。❌残しの完了報告禁止

5. punchlines.json をcommit（mainへ直接でよい。サイト表示に影響しないため）
   対話セッションではTelegram通知は不要（手動アップロードは運営者作業）
```

## clips[] フォーマット
```jsonc
{
  "id": "pl1",                  // 出力ファイル名になる（英数字）
  "hook": "…",                  // キャプション1行目。日本語・歌詞の引用禁止・article-tone準拠
  "lines": [5, 6, 7],           // candidates[] のindex。曲中で連続している並びにする
  "songStartSec": null,         // 省略可。省略時は先頭ラインabs−1.6sに自動設定
  "durationSec": null,          // 省略可。省略時は最終ラインabs+3s（15〜40sにクランプ）
  "tManual": { "5": 61.2 }      // 省略可。候補indexごとの絶対秒の手動上書き（absより優先）
}
```

## タイミングの考え方（アプリ内サウンドとの同期）
- 動画は t=0 が「サウンド開始位置」。caption.txt の投稿メモに
  **サウンド開始位置 m:ss** が出るので、投稿時にアプリ内サウンドをその秒数から開始させる
- クリップ内の相対タイミングは whisper の実測値なので、開始位置さえ合えばバッチリ揃う
- 冒頭がビート強めでwhisperが取れない曲は abs=null になる → 運営者がSpotify等で実測し
  tManual に絶対秒を焼いて render し直す（サイトの set-manual-timestamp と同じ運用思想）
- レンダリング後、QuickTimeでmp4を開き、Spotify等で当該秒から再生して口パク確認すると確実

## デザイン仕様（固定・punchline-shorts.mjs内で完結）
- 背景 #0a0a0a / EN白 bold 68 / JP ゴールド#c8a96b 44 / 中央配置
- タイトルカード（0〜先頭ライン直前）→ ライン切替表示 → WAXTHINKエンドカード（末尾2秒）
- メタバー「ARTIST · "Title" · YEAR」＋ waxthink.com 常時表示
- 無音AACトラック入り（X/IG互換のため音声ストリーム必須。BGMは載せない）

## 歌詞位置ガード（2026-07-09新設・nas-is-like pl2事故の再発防止）
記事のeng引用ブロックは**曲中で連続していない2行を1ブロックに引用することがある**（記事としては合法）。
これをショートにそのまま使うと「画面の歌詞と実際に鳴っている歌詞が別物」になる。
以下は init/check が機械検出し、**❌が出た候補・クリップは絶対に使わない**（バイパス禁止）:

- **nonContiguous**: ブロック内の行間がキャプション実測で6.5s超 → resolveClipが拒否。
  別の候補を選ぶ（そのブロックの片方の行だけが欲しい場合も、単独行の別候補を探す）
- **whisper/caption mismatch**: absと公式キャプション秒の乖離>2.5s → 誤マッチ疑いで拒否。
  運営者がSpotify等で実測し tManual を焼いた場合のみ実測を正とする
- **クリップ窓外の行**: 表示する全行（\N内の各行）がクリップの音声窓内で歌われていなければ拒否
- **字幕トラックが無い曲**: check が⚠を出す。whisper単独になるので、
  QuickTime＋Spotifyでの口パク確認を必ずやってから完了報告する
- punchlines.json が旧形式（v2でない）の場合 check が❌ → init を再実行してから進める
- 表示は「歌い終わり＋3.2s」で自動的に消える（次のラインまで無関係な小節に被せない）

## 禁止・注意（コンテンツフィルター/著作権）
- **歌詞テキストをstdout・チャット・commit message・caption.txtに出さない**
  （check が caption/hook への歌詞混入を機械検出する）
- hookは日本語で「何が起きるか」を書く。歌詞の直訳引用もしない
- 公式MV映像・音源をmp4に焼かない（このシステムは無音が仕様）
- ハッシュタグは #hiphop #和訳 #アーティスト名 の基本3点（caption自動生成済み）

## 既知の限界
- whisper small.en はイントロ・フック等で取りこぼす（candidates の abs=null）→ tManual運用
- アプリ内サウンドがMV版とAlbum版で尺が違う曲は、投稿時に波形を見て開始位置を微調整する
