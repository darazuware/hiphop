# 字幕ショート（英字幕カラオケ＋日本語訳＋スラング解説・縦型分割）

YouTubeのフリースタイル/PV/インタビューに字幕を焼き込み、フル版＋Instagramリール用縦型(1080x1920)分割を出す。サイト非掲載（Instagram用）。
**合言葉: 「字幕ショート {YouTube URL}」**（`/subshorts {URL}` でも可）。

## 3点セット
| 役割 | コマンド |
|---|---|
| 入口 | `node agent/src/subvideo.mjs init --url <URL> --slug <slug> --brand "EMINEM & PROOF" --sub "Stereo Car Freestyle"` |
| 機械検証DoD | `node agent/src/subvideo.mjs check --slug <slug>` 全✅ |
| 出口 | `agent/subvideo/{slug}/renders/reels/part*.mp4` を `SendUserFile`（30MB超のフル版は保存先のみ報告）。サイト動画ページに出すなら `captions.json` を `src/data/video-captions/{slug}.json` へコピー→reviewブランチにpush |

## 手順
1. **init**（DL・音声・Demucsボーカル分離・whisper・YT自動字幕→`draft.md`）。Chromeのログインが要る（yt-dlp cookies）。
2. **lines.json / glossary.json をClaudeが書く**（唯一の人手/判断工程。下記§2）。
3. `node agent/src/subvideo.mjs run --slug <slug>`（align→build→render→check）。`parts.json`（分割位置・ラベル）は初回buildで自動生成されるので**labelだけ内容に合わせて編集**して `render` をやり直す。
4. checkが全✅→出口。❌は直して再実行。

## §2 lines.json の書き方（品質はここで決まる）
- 形式: `[["English line","日本語訳"], ...]`。日本語が `null` の行は**非表示（時刻のアンカー専用）**。掛け合い・笑い声・聞き取り不能なバースは `null` で入れる（入れないと強制アライメントが数秒〜十数秒ズレる。実例: 記事の歌詞が欠落していた行があり全体が壊れた）。
- **英語の正**: フリースタイル等は `draft.md` の **2つのASR（YT字幕・whisper）が一致した語のみ採用**。食い違う語は推測で書かず非表示にする。PV/公式曲はGeniusの歌詞（CLAUDE.md「歌詞正確性ルール」・`optimizeQuery:false`）を正とする。記事の既存歌詞は信用しない（誤り・欠落の前例あり）。
- **固有名詞・愛称は要確認**: 例) Eminemの愛称は「M」ではなく「Em」。ASR表記をそのまま採らない。事実主張（サンプル・年・人物）は `docs/fact-check-rules.md`。
- 1行は概ね12語以内・表示6秒以内。長い行は行を分けて日本語も分割（checkが警告）。
- 日本語訳: 意訳でよいがEnglishの語順に情報が出る短い訳。スラングは訳と解説を分ける。
- **glossary.json**: `{"<キュー英文の先頭一致>": [["見出し語","解説"], ...]}`。1キュー最大2語・解説は40字程度。事実（映画/曲/年）は裏取りしてから書く。定番の言い回し（see you later, alligator / step to / ill / raise the roof 等）を優先。
- 歌詞の英語行をレスポンスに貼らない（コンテンツフィルター対策）。結果は「行数・✅❌」だけ報告する。

## 検証の仕組み（人の耳の代わり）
- 時刻＝**強制アライメント(MMS_FA)をボーカル分離音声に対して**実施。
- YouTube自動字幕の語時刻と行ごとに重み付きLCSで突き合わせ、中央値差>0.4s／異常に長い語の行を自動検出→前後の行を含む窓で**自動再アライメント**（最大3周）。残った行は `check` が❌（人が耳で確認して問題なければ `meta.json` の `alignIgnore: [行番号]`）。
- YT字幕が無い動画（公式PVなど）は自動検証がスキップされる。**その場合は語長異常だけが頼り**なので、最初のリールを実際に再生して数箇所を目視確認してから量産する。

## 映像の落とし穴（再発防止）
- yt-dlp由来の映像はSARが1:1でないことがある（例: 1280x540 SAR3:4＝表示16:9）。**`scale`後に必ず `setsar=1`、出力も1:1**（怠ると映像も字幕も縦に伸びる）。`check` がSARを検証。
- フォントはリポジトリ同梱の `agent/assets/fonts/Inter-Bold.ttf`（英語）＋Hiragino Sans（日本語）。
- 縦型のレイアウトはInstagram UI（下部約300px）を避けて字幕を上寄せ。

## 恒久ルール（運営者確定・2026-09-19）
1. **翻訳・煽りは「実際に発話された語」だけ。** 動画の中で言っていない煽り（「せーの！」「声出せ！」「もう一回！」「〜と返せ！」等）を勝手に足さない。hookの「Ooh la la」「oui oui」、掛け声「Uh」「Hey」「Ayy」「oi oi」等の**意味を持たない発声は訳さない**（英語字幕のみ。lines.jsonの日本語は空文字 `""`。`null`は行ごと非表示になるので使い分ける）。実際に言っている意味のある語（Mon cheri / Garçon / モエを一本くれ 等）は逐語訳する。
2. **注記はカード方式**: glossary.jsonの各項目は `["見出し語","意味","タグ","一口メモ(背景)"]`。タグは `AAVE` / `Slang` / `慣用句` / `Memo`。**`慣用句`は決まり文句・成句だけ**（see you later, alligator / keep it real 等）。普通の言い回し（on welfare）や一般語の比喩（flatline / spike）は `Memo`、砕けた口語は `Slang`。白系の角丸カード＋黒文字で表示（`subvideo.mjs`のevents）。一口メモの事実（曲・年・人物）は裏取りし、解釈は「〜と読める」と明記する。1キュー1カード。
3. **フッターの検索誘導文は入れない**（`meta.footer`は空）。ブランド表示は透かしで行う。
4. **透かし**: `agent/assets/brand/wax-think-logo.png`（WAX&THINK・白抜き透過）をPV映像の右上に常時表示。
6. **聞き取りを確認できないアドリブ（Genius等の括弧書き）は字幕に出さない。** 耳で確認できない語を字幕にしない（例: RTJ「Ooh LA LA」の Mon cheri / Garçon は運営者が Let's go と聞き分けを指摘。Geniusは誤りがあり得る）。ASRで割れる語も同様に非表示。
7. **タグ色**（白文字・彩度/明度は同系統ならOK）: AAVE=#7b00a4（紫）、Slang=#a85400（橙）、慣用句=#007ea8（水色系）、Memo=#03ab00（緑）。
8. **分割は意味のまとまり（バース単位）で決める**。「Part 1/3」等の連番表記は付けない（後から並べ替え・差し替えの自由度のため）。上帯にはlabelのみ（例: `Verse 2 — Killer Mike & Chorus`）。`parts.json` は `fromIdx`/`toIdx`（キュー番号）で範囲指定でき、繰り返しの多いhookでも確実に切れる。90秒以内。
9. **透かしは映像の絵の内側（黒帯を除いた右上）に、透過率を上げたウォーターマーク（不透明度40%）で入れる。** `cropdetect`で黒帯を検出して位置を決める。
10. **hook（同一フレーズの繰り返し）は強制アライメントが崩れやすい**（ボーカルステムに素材が薄い・行間が詰まる）。`meta.json` の `hookGrids: [{from,to,t0,d}]` で「1小節=d秒・先頭の"ooh"がt0」の格子に固定し、語内タイミングはテンプレート(`HOOK_TPL`)を使う。t0/dはボーカルステムのエネルギー包絡（`la la`と`ah`の間の無音が小節ごとに出る）から決める。6語の行と3語の断片行のみ対応。
5. **締め**: 各パート/フル版の末尾に暗転→ロゴ（同PNG）を中央にフェードイン→フェードアウト（約2.8秒延長・音声もフェードアウト）。`ffrender`が自動で付ける。

## 著作権
公式映像・音源をそのまま使うため、**YouTubeへは上げない**（Content ID）。Instagramでも権利者管理での削除リスクは残る（`docs/full-lyric-video.md` の縦型リールと同じ扱い）。
