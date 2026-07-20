# 横長フル歌詞動画（英日同期・キネティック）

1920x1080の歌詞動画パイプライン。縦型ショート（`generate-short.mjs`）とは別系統。
翻訳の正は従来型記事(.astro)のjpnスロット（ある場合）。パイロット曲: lose-yourself。

## 3点セット（mission-protocol準拠）

| 役割 | コマンド |
|---|---|
| 入口1コマンド | `node agent/src/cue-editor.mjs` → http://localhost:4577 にYouTube URLを貼る |
| 機械検証DoD | `node agent/src/check-full-video.mjs {slug} --require-render` |
| 出口 | mp4は `agent/{slug}/full/renders/`（サイト非掲載・review push不要。キュー等のassetsはmainへcommit可） |

## 入口: cue-editor（YouTube取り込み一体型）

```
node agent/src/cue-editor.mjs [--slug {slug}] [--port 4577]
```

- トップページ: YouTube URL + slug を入力 → 音源DL(yt-dlp) → ジャケット取得（`public/images/covers/{slug}.jpg` 流用 > YouTubeサムネ > 黒画像）→ whisper文字起こし(medium.en, `-ml 1`) → キュー生成 → `/edit/{slug}/` へ。
- キュー生成の分岐:
  - `agent/{slug}/assets/full-lines.json` あり → `align-and-chunk.mjs`（NW大域アライメント）で英日キュー
  - なし → whisper文字起こしを行グループ化（語間ギャップ0.8s / 9語 / 4.2秒で区切り）した英語のみキュー。日本語は編集画面で手入力
- 途中失敗しても再実行で続きから（audio / whisper-words.json / full-cues.json は再利用）。
- スマホ: 同一Wi-FiはLAN URL、外出先はTailscale URL（起動ログに表示。Macスリープ対策は `caffeinate -dis`）。

### 編集画面の主要機能
波形（全体+ズーム・旗ドラッグで秒調整）/ タップ同期（S・●SYNC）/ 行の分割✂（日本語は安全境界のみ・語中は暗赤）/ 結合⤵ / Undo・Redo(⌘Z) / 一括ずらし / ✓lint / 保存履歴10世代 / 再生速度0.5–1x / 行ループ / SRT書き出し（dual/en/ja）/ 再生成＋レンダー。
保存で `full-cues.json` 上書き（`cue-history/` に世代バックアップ）。

## 記事対訳ルート（従来型記事がある曲を高品質でやる場合）

1. 歌詞抽出: .astroのLyricsBlockから `lyrics-map.json`（既存スクリプト）
2. `build-full-lines.mjs --slug {slug}` → `full-lines.json`
3. whisper: **モデルはmedium必須**（small.enは無音イントロ誤検出で40秒ズレた前例）
   `ffmpeg -i audio-full.mp3 -ar 16000 -ac 1 /tmp/{slug}.wav && whisper-cli -m /opt/homebrew/share/whisper-cpp/ggml-medium.en.bin -f /tmp/{slug}.wav -ml 1 -oj -of /tmp/{slug}_med`
4. `align-and-chunk.mjs --slug {slug} --whisper /tmp/{slug}_med.json`
   - 分割方針: 11語未満の行は割らない / 1チャンク5語以上 / 日本語は語中で切らない（カタカナ連続・漢字連続・次がひらがな＝禁止、読点直後のみ例外）。安全に割れなければ行ごと1キュー
5. エディタで微調整 → 再生成＋レンダー

## DoD検証

```
node agent/src/check-full-video.mjs {slug}                 # 編集中の健全性チェック
node agent/src/check-full-video.mjs {slug} --require-render # 納品前（mp4の存在・尺・鮮度まで）
```

❌=ブロッカー（型不正・重なり・逆行・音源外・尺乖離）、⚠=注意（長い行・日本語未入力・mp4が古い等）。歌詞テキストは出力しない。

## 縦型リール（PV映像に字幕・Instagram用・2026-07-21）

```
node agent/src/gen-reel.mjs --slug {slug} --start 56 --end 104 \
  --comment "上帯のコメント（改行可）" [--title ""] [--artist ""] [--yt <URL|ID>] [--render]
```

- 1080x1920。中央にPV映像（**実アスペクト比に合わせた帯**。4:3のMVも切らずに収める）、字幕は映像の上に重ねる。上帯＝コメント、下帯＝曲名/アーティスト/`対訳 waxthink.com`。
- PV映像は `yt-dlp` で `agent/{slug}/reel/assets/pv.mp4` へ（記事の `youtubeId` か `--yt` から解決）。`full-cues.json` の指定区間だけを切り出し、時刻をシフトして流用するのでキュー調整はエディタと共通。
- 映像の切り出しは `data-media-start`（ファイルは切らない）。音声は同じファイルから `<audio>` で鳴らす。
- **著作権**: 公式MV映像の再利用は [`docs/shorts-strategy.md`](shorts-strategy.md) の方針（MV切り抜き禁止）の**例外**として、**YouTubeへは上げない**前提でのみ生成する。Instagram等へ投稿する場合も Meta Rights Manager による削除・アカウント警告のリスクは残る（2026-07-21 ユーザー判断）。`pv.mp4` と `reel/renders/` は `.gitignore` 済み。

## 注意
- 作曲は `gen-full-composition.mjs`（title/artistは 引数 > `meta.json` > songs.ts）。**アセットは `full/` 内に置く**（CLIは `full/` をhttpルートに配信、`../assets` は404）。
- 最初の歌詞まで4秒以上ある曲はイントロにタイトルカードを自動表示。
- 著作権: フル歌詞表示はContent IDクレーム許容・ブロックなら諦め・異議申し立てなし（ユーザー決裁事項）。
- 歌詞テキストをstdout/レスポンスに出さない（コンテンツフィルター対策・CLAUDE.md参照）。
