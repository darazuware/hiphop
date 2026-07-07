# ▶頭出し秒数のYouTubeキャプション自動整合（align-yt-captions）

**目的**: 学習ユニットの▶頭出しリンクと引用歌詞の開始位置を、**埋め込んでいる動画そのもの**から機械的に一致させる。whisper・音源DLは使わない（2026-07-03方針のまま）。どのAIモデルのセッションでも1コマンドで再現できる。

## 任務3点セット（mission-protocol準拠）

- **入口**: `node agent/src/align-yt-captions.mjs --slug {slug}`（dry-run）→ 問題なければ `--apply`
- **DoD（機械検証）**: exit 0（全unitマッチ or NOT_FOUNDが`mvAbsent`登録済みのみ）＋ `npm run build` 成功
- **出口**: reviewブランチへpush → `notify-review.mjs {slug}`

## 仕組み

1. `src/pages/songs/{slug}.astro` の `youtubeId` から、yt-dlpで**字幕トラックのみ**取得（動画DLなし・数秒で完了）。公式MVの多くは手動キャプション付き＝行単位で正確。手動が無ければ自動字幕にフォールバック。
2. `agent/{slug}/assets/units.json` の各unitの `anchor` を、キャプション単語ストリームに曲順どおり照合（正規化＋前方一致トークンマッチ・30語のバックトラック窓・フック反復は単調カーソルで正しい回を選ぶ）。
3. マッチ秒を `captionSec` として焼く。**優先度: `manualSec`（運営者実測・最優先）> `captionSec` > `fallbackT`**。`--apply` しても実測値は消えない。

## NOT_FOUND の意味（これが本体機能の半分）

キャプションは**その動画の写し**なので、照合失敗は「ズレ」ではなく**引用と動画の食い違い**を示す:

- **アルバム版にしかないパート**（例: cream の "two for five" イントロ寸劇はMV未収録）
  → units.json の該当unitに `"mvAbsent": true` を付ける。▶リンクが消え、align/genの両方でスキップ扱いになる。記事側には「アルバム版のみ・MV未収録」の一文を添える。
- **クリーン版MVで歌詞が改変・ミュートされた行**（例: cream の fifteen-bagged / bones-staircase）
  → 動画内にパート自体はあるので、fallbackT または運営者実測（`set-manual-timestamp.mjs`）で秒数を維持してよい。
- **表記差**（キャプションとGeniusの綴り違い）→ bestScoreが0.4前後ならこれを疑う。anchorを短くして再実行。

## 運用フロー

### 新規曲（記事作成フロー step 12 に組み込み）
```
1. units.json 作成（anchor・fallbackT・manualSec:null は従来どおり）
2. node agent/src/align-yt-captions.mjs --slug {slug}          # dry-run で表を確認
3. NOT_FOUND があれば原因判定（mvAbsent登録 or 表記差修正）
4. node agent/src/align-yt-captions.mjs --slug {slug} --apply  # captionSec焼き＋timestamps再生成
5. 運営者レビューでズレ指摘があれば従来どおり set-manual-timestamp.mjs（manualSecが常に勝つ）
```

### 既存曲の一括整合
各slugに対して dry-run → 差分が±3秒超のunitだけ `--apply` 判断。manualSec設定済みunitは影響を受けない。

### 字幕トラックが無い動画
スクリプトが「字幕トラックなし」で exit 1。従来運用（fallbackT＋実測）のまま。動画差し替え時に再実行すると取れることがある。

## 出力安全（コンテンツフィルター対策）

スクリプトは歌詞テキスト（anchor・キャプション本文）を一切標準出力に出さない。unit id・秒数・スコアのみ。**このスクリプトの改修時もこの不変条件を守る。**

## アイキャッチ（unit毎のビジュアル）

`LearningUnit` の `embed` / `embedCaption` prop（→ `SocialEmbed.astro`）が既に Instagram / X / YouTube の公式埋め込みに対応済み。CSPも設定済み（public/_headers）。

- 使い方: 文化的背景があるunit（例: cream の 'Lo goose → Lo Lifeカルチャー）に、公式埋め込みURLを1本貼るだけ。
  `<LearningUnit ... embed="https://www.instagram.com/p/XXXX/" embedCaption="Lo Life クルーの..." >`
- **画像のDL再ホストは禁止**（著作権）。公式埋め込みのみ。投稿が消えたら埋め込みも消えるだけで安全。
- URL選定は自動化しない（良い投稿の判断は人間/対話セッションでWebSearch・実在確認してから貼る）。デッドリンク厳禁の原則どおり、貼る前に投稿の実在を確認する。
