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

**表示の微調整（2026-07-25追加）**
- **終了つまみ**: 選択中の行だけ波形に「開始〜終了」の帯が出て、下側のオレンジのつまみ（終）を指でドラッグすると**表示の終わりだけ**を動かせる。次の行に食い込まない・最短0.2秒でクランプ。上側の旗は従来どおり開始。
- **改行**: ✂ボタンのモーダルで「⏎ 改行」に切り替えると、キューを増やさず**同じ表示の中で折り返す**（時間は変わらない）。日本語は語中で切れない安全境界のみ選べる。既存の改行は選択状態として復元され、「解除」で外せる。eng/jpn欄はtextareaなので直接改行を打ってもよい。
- **文字サイズ**: 行ごとの `1.0x` ボタンで 1→1.15→1.3→1.5→1.8→1 を巡回（⇧クリックで逆順）。パンチラインだけ大きくする用途。キューの `scale` に保存され、作曲側で英日ともその倍率になる。
- **訳のネタバレ防止**: 訳を英語と同時に出すと落ちが先に割れるので、既定で**全キュー**、`fa_words` の「最後の語が歌われ始める瞬間」まで訳を伏せる（語秒が無い行は尺の割合で代用）。

  **遅らせるほど訳を読む時間が減るのがトレードオフ。** lose-yourselfはキュー尺の中央値が1.97秒しかなく、実測は下表のとおり（字幕の読みやすさの目安は4〜8字/秒）。既定は読める側に倒してある。

  | `--jp-max-delay` | 訳の遅延(中央値) | 訳が出ている時間 | 読字速度 |
  |---|---|---|---|
  | 1.2 | 1.19s | 0.81s | 13.8字/秒（実質読めない） |
  | **0.7（既定）** | 0.70s | 1.29s | 10.0字/秒 |
  | 0.5 | 0.50s | 1.48s | 8.8字/秒 |

  `--jp-min-show`（訳が出てから消えるまで最低確保する秒・既定1.0）／`--jp-frac`（語秒が無い行の割合・既定0.35）／`--jp-timing sync`（従来の同時表示に戻す・`--jp-delay` で遅延秒）。**キュー尺を伸ばせば両立できる**ので、訳が読みにくい曲はエディタの終了つまみで表示を伸ばすのが先。

## 高精度ルート（記事対訳がある曲・2026-07-25標準）

**時刻＝強制アライメントの実測 / 分割＝意味 / 日本語＝訳し下し** の3層に分けたルート。
whisper＋NW補間の推定秒とカンマ機械分割・日本語の文字数比分割（＝旧 `align-and-chunk.mjs`）を置き換える。

```
node agent/src/build-full-lines.mjs --slug {slug}              # .astro対訳 → full-lines.json
node agent/src/fa-align.mjs --slug {slug} --source lines       # Demucs分離+MMS_FA → fa_words_lines.json
node agent/src/semantic-chunk.mjs run --slug {slug} --apply    # 意味分割＋訳し下し → full-cues.json
node agent/src/check-full-video.mjs {slug}                     # DoD（[FA]整合が✅になること）
```

- **時刻に補間を使わない**。キューの `start` は先頭語の実発声（-0.06s）、`end` は次キュー直前まで（末尾語+1.2sを上限）。旧ルートは実発声から中央値0.4s・最大4.3sズレていた（lose-yourself実測）。
- **分割はモデルが意味で決める**。切れ目候補として実発声の「間」（`gaps`）を渡すが、句をまたぐなら使わない。
- **日本語は比率分割しない**。英語断片の出る順に情報が出る訳へ組み替える（同時通訳の訳し下し）。ここが従来との最大の差。
- **モデル出力は機械ガードを通す**。落ちた行は分割せず1キューに戻すだけなので、品質が下がる方向には壊れない:

  | ガード | 内容 |
  |---|---|
  | en不一致 | 英語断片の連結が原文の語列と完全一致しない＝ハルシネーション/欠落 |
  | 断片数過多 | `--max-segs`（既定3）超え |
  | ja空 / ja分量逸脱 | 訳が空、または元訳の0.5〜2.2倍の外＝要約や膨張 |
  | 短すぎ | 表示が `--min-show`（既定0.5s）未満になる断片は隣と併合し直す |

- 同一原文行（コーラス等）はモデルへ1回だけ投げ、同じ分割・同じ訳を全出現に適用する（表示ゆれ防止）。
- `--apply` を付けなければ `full-cues.new.json` に出るだけ。付けると `full-cues.json` を上書きし、`cue-history/` へ世代バックアップ＋新しい区切りに合わせて `fa_words.json` も再生成する（`fa-align` の再実行は不要）。
- **`run` は `claude` CLI を呼ぶ。Claude Codeセッション内から実行するとsandboxでEPERM/401になる**ので、ユーザー自身のターミナルで回すか、2段階ルート（`prepare` → `seg-prompt.txt` をモデルに渡す → 結果を `seg-out.jsonl` に保存 → `apply`）を使う。

### 分割せず時刻だけ直す場合

既存キューの文言・区切りはそのままで、ズレだけ実測に合わせる:

```
node agent/src/fa-align.mjs --slug {slug}                 # fa_words.json（キュー単位）
node agent/src/fa-retime.mjs --slug {slug}                # ドライラン（ズレ分布と何行動くか）
node agent/src/fa-retime.mjs --slug {slug} --apply --conf # 反映（履歴バックアップ付き）
```

### 要確認フラグ（人が触る行を絞る）

キューに `conf`（0〜1）と `flags` が焼かれる。`conf<0.6` の行はエディタで **行番号に⚠** が付き、**✓lint に日本語の理由付きで一覧**される。クリックでその行へジャンプ、**その行を編集すると⚠は自動で消える**（＝確認済み）。
主な `flags`: `word-too-short`/`word-too-long`（整列が怪しい）・`inner-gap-*`（行内に長い無音）・`span-*`（1行が長すぎ）・`model-unsure`（モデルが自信なしと申告）・`remerged`（短すぎて併合し直した）・`no-fa`（強制アライメント無し＝推定秒）。

## 旧ルート（whisper＋NW大域アライメント・参考）

1. 歌詞抽出: .astroのLyricsBlockから `lyrics-map.json`（既存スクリプト）
2. `build-full-lines.mjs --slug {slug}` → `full-lines.json`
3. whisper: **モデルはmedium必須**（small.enは無音イントロ誤検出で40秒ズレた前例）
   `ffmpeg -i audio-full.mp3 -ar 16000 -ac 1 /tmp/{slug}.wav && whisper-cli -m /opt/homebrew/share/whisper-cpp/ggml-medium.en.bin -f /tmp/{slug}.wav -ml 1 -oj -of /tmp/{slug}_med`
4. `align-and-chunk.mjs --slug {slug} --whisper /tmp/{slug}_med.json`
   - 分割方針: 11語未満の行は割らない / 1チャンク5語以上 / 日本語は語中で切らない（カタカナ連続・漢字連続・次がひらがな＝禁止、読点直後のみ例外）。安全に割れなければ行ごと1キュー
5. エディタで微調整 → 再生成＋レンダー

※ 記事対訳がある曲は上の高精度ルートを使う。このルートは字幕トラックも記事対訳も無い曲の初期キュー生成用に残している。

## DoD検証

```
node agent/src/check-full-video.mjs {slug}                 # 編集中の健全性チェック
node agent/src/check-full-video.mjs {slug} --require-render # 納品前（mp4の存在・尺・鮮度まで）
```

❌=ブロッカー（型不正・重なり・逆行・音源外・尺乖離）、⚠=注意（長い行・日本語未入力・mp4が古い等）。歌詞テキストは出力しない。

**[FA]強制アライメント整合**（2026-07-25追加）: `fa_words.json` があれば、全キューの `start` が実発声から0.35s以内かを検証する。ズレが残っていれば件数と最大ズレを出して `fa-retime.mjs --apply` を促す。`conf<0.6` の要確認件数もここに出る。

## 縦型リール（PV映像に字幕・Instagram用・2026-07-21）

```
node agent/src/gen-reel.mjs --slug {slug} --start 56 --end 104 \
  --comment "上帯のコメント（改行可）" [--title ""] [--artist ""] [--yt <URL|ID>] [--render]
```

- 1080x1920。中央にPV映像（**実アスペクト比に合わせた帯**。4:3のMVも切らずに収める）、字幕は映像の上に重ねる。上帯＝コメント、下帯＝曲名/アーティスト/`対訳 waxthink.com`。
- PV映像は `yt-dlp` で `agent/{slug}/reel/assets/pv.mp4` へ（記事の `youtubeId` か `--yt` から解決）。`full-cues.json` の指定区間だけを切り出し、時刻をシフトして流用するのでキュー調整はエディタと共通。
- 映像の切り出しは `data-media-start`（ファイルは切らない）。音声は同じファイルから `<audio>` で鳴らす。
- **著作権**: 公式MV映像の再利用は [`docs/shorts-strategy.md`](shorts-strategy.md) の方針（MV切り抜き禁止）の**例外**として、**YouTubeへは上げない**前提でのみ生成する。Instagram等へ投稿する場合も Meta Rights Manager による削除・アカウント警告のリスクは残る（2026-07-21 ユーザー判断）。`pv.mp4` と `reel/renders/` は `.gitignore` 済み。

## 語間ギャップの時間差表示（2026-07-25）
- `gen-full-composition.mjs` は `fa_words.json`（`fa-align.mjs`で生成済みなら）を読み、キュー内の語間ポーズ（既定0.35秒超、`--word-gap`で変更・`--no-stagger`で無効化）を検出して**行は割らずに**後半の語群を実発声タイミングまで遅らせてフェードイン表示する（例: "if you had, **one shot**" の間で"one shot"だけ後から出る）。fa_words未生成の曲や語数不一致時は従来通り一括表示にフォールバック（回帰なし）。
- 既存キューの `end` が実際の発声より早めに切られている行（チャンク分割の推定誤差）では、フェードアウト開始時刻に間に合うようreveal時刻を前倒しでクランプする＝実際の間より早く出ることがある。ズレが気になる行はエディタで波形を見ながら旗を実際のポーズ後ろへ広げると改善する。

## 注意
- 作曲は `gen-full-composition.mjs`（title/artistは 引数 > `meta.json` > songs.ts）。**アセットは `full/` 内に置く**（CLIは `full/` をhttpルートに配信、`../assets` は404）。
- 最初の歌詞まで4秒以上ある曲はイントロにタイトルカードを自動表示。
- 著作権: フル歌詞表示はContent IDクレーム許容・ブロックなら諦め・異議申し立てなし（ユーザー決裁事項）。
- 歌詞テキストをstdout/レスポンスに出さない（コンテンツフィルター対策・CLAUDE.md参照）。
