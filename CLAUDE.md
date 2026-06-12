# hiphop — プロジェクト設定

## 事実チェック（最重要・常駐）
- **サンプル系記事（曲ページ・コラム）を追加／編集するときは、作業前に必ず [`docs/fact-check-rules.md`](docs/fact-check-rules.md) を読み、本ルールに従う。**
- サンプル・年・アルバム・客演・チャート順位・曲の実在性に関する事実主張は、生成時のハルシネーションを前提に一次ソース（WhoSampled / Wikipedia / Discogs / Genius）で必ず裏取りする。

## スタック
- Astro + Tailwind CSS v4 + TypeScript
- デプロイ: Cloudflare Pages（GitHub連携 → git pushで自動デプロイ）
- サイトURL: https://waxthink.com

## ディレクトリ構成
```
src/
  pages/songs/   # 曲ページ — 各.astroファイル
  pages/         # index, about, slang, privacy, 404
  layouts/Layout.astro
  components/    # DeepSlang, LyricsBlock, QuickSlang, ThemeToggle
  data/songs.ts  # 全曲データ一元管理
  styles/global.css
public/images/   # アルバムアート
```

## 開発コマンド
- 開発サーバー: `npm run dev` → http://localhost:4321
- ビルド確認: `npm run build`
- デプロイ: `git push` (Cloudflare Pages自動)

## ルール
- 新曲追加は `src/data/songs.ts` にデータ追記 → `src/pages/songs/[slug].astro` 作成
- OGP画像は `src/pages/og/[slug].png.ts` で自動生成済み
- CSPはpublic/_headersで管理（YouTube埋め込み・Adsense対応済み）
- コメント不要、型安全を維持
- **songs.tsの文字列はダブルクォートを使う**（アポストロフィを含む曲名・タイトルでシングルクォートを使うとシンタックスエラーになる）
- **git push前に必ず `npm run build` でビルド確認**してからpushすること

## スラング詳細リンクのルール
- `QuickSlang` は中央辞書 `src/data/slang.ts` に登録がある語のみ「もう一度タップで詳細 →」リンクを表示する（実線下線）。未登録の日常語（ill 等）は簡易解説ツールチップのみ（点線下線・デッドリンクなし）
- 珍しい/固有名詞のスラングに詳細リンクを付けたい場合は `src/data/slang.ts` に `{ word, desc }` を追加する
- 詳細リンク先 `/slang?q={英語語}` では、その語を使う全曲が「使用曲」として自動内部リンクされる（`word=`/`term=` 両prop・日本語注釈付き対応済み）

## ページ種別（重要・新標準）
曲ページには2種類ある。検証フックはページ種別で自動分岐する（`<LearningUnit>` の有無で判定）。
- **learning型（新標準）**: 学習解説主体ページ。歌詞全行は載せず、スラング・韻・言葉遊び・AAVE文法を「学ぶ表現」単位で解説。英語は用例断片のみ引用。`src/components/LearningUnit.astro` を使う。雛形＝`cream.astro`。詳細は [[project_learning_page]]（memory）。
  - **新規の曲ページは原則 learning型で作る。**
  - 検証は [B]ハルシネーション必須＋[C]独自性（独自解説JP > 英語引用 かつ ≥1200字）＋[D]引用最小性（eng引用率<60%＝全行掲載でない）＋[E]タイムスタンプ構造（任意）。
  - **[A]全行カバレッジ判定は learning型には適用しない**（全行非掲載が正常なため）。
- **従来型（旧・歌詞対訳）**: LyricsBlockで歌詞をセンテンス単位に分け対訳。残存ページのみ。検証は従来通り [A]≥閾値＋[B]。

## 歌詞翻訳ルール（重要）
- learning型: 用例断片（その表現を含む行/対句のみ）を `LearningUnit` の eng/jpn スロットに置き、本文スロットに独自解説を書く。
- 従来型: **1センテンス or 文脈が切れるところ単位**でLyricsBlockを分ける（バース全体を1ブロックにしない）
- 1ブロック = 1〜2行が基本。意味のまとまりで区切る
- 各ブロックにeng/jpn/explanationを付ける

### 著作権・引用方針（暫定）
- 歌詞は全文転載しない。解説に必要な範囲のセンテンス単位の**引用**にとどめる（批評・研究目的の引用として、出典＝アーティスト/曲名を明示）。
- 引用部分（eng）より日本語解説（jpn/explanation）の分量を主とし、原文がコンテンツの中心にならないようにする。
- 歌詞の出典はGeniusだが、Geniusの解説文・対訳をそのまま転記しない（事実確認の参照のみ）。
- 権利者から削除要請があった場合は該当ブロックを速やかに非公開化する前提で運用。
- ※暫定方針。確定までは「引用の範囲・解説主体」を疑わしきは縮小の原則で判断する。

## 記事作成フロー（Gist経由）
```
1. ユーザーがGemini Deep Research結果をGistに貼る
2. ユーザーがGist URLをClaudeに伝える
3. Claude: gh gist view で内容取得
4. Claude: Genius APIで歌詞を取得し /tmp/lyrics-{slug}.txt に保存
   - node -e "import {getLyrics} from './agent/node_modules/genius-lyrics-api/index.js'; ..."
   - optimizeQuery: false を使い誤マッチを防ぐ
5. Claude: src/data/songs.ts にエントリ追記（artistSlug含む）
6. Claude: src/data/artists.ts を確認し、artistSlugが未登録なら追加
   - 追加項目: slug, name, origin, active, genre, summary, japan
   - Gistの内容とDeep Researchから自動生成
7. Claudeが.astroページを生成（SongLayout使用）
   - **Amazonアフィリエイトリンクは手書き不要**。SongLayoutが冒頭の**ジャケット画像をクリック型アフィリエイトリンク**として自動表示する:
     - asin設定済み: Amazon商品画像リンク（`/dp/{asin}` + tag=wax1124-22）
     - asin=null: `public/images/covers/{slug}.jpg` を `amazon.co.jp/s?k={artists album}&tag=wax1124-22` で包む
   - タグは `wax1124-22` 固定（旧 hiphop_black-22 / waxthink-22 は無効）、ドメインは **amazon.co.jp のみ**
   - **【直書き禁止】** `.astro` 本文に生の `amazon.co.jp` URL（`<a href="...amazon...">`）を書かない。本文のアルバム購入CTAは必ず共通コンポーネント `src/components/AmazonAlbumCta.astro`（`query`/`asin`・`cover`・`title`・`artist` props）経由にする。タグは同コンポーネントと `VodCta.astro`・`ColumnAlbums.astro` が定数で集中管理する。Apple Music リンクは `at=` トークンを持たないため `at=` パラメータを付けない（素のsearchリンク）。
   - 検索リンクは必ず **`&i=music`**（ミュージックカテゴリ限定）を付ける → 生活用品等の誤ヒット防止
   - → 記事本文に手書きの「Amazonで探す」テキストCTAは入れない（ジャケットリンクと重複するため）
   - **【Amazon戦略・確定方針】** 商品直リンク(asin)よりも**検索リンクを優先**する。理由: アソシエイトcookieは24時間有効で一度踏ませれば全商品の購入が成果対象になるため「とにかくAmazonに飛ばす」のが最適。直リンクは廃盤・在庫切れで死にリンク化するリスクがあるが、検索リンクは常に何か表示され死なない。ジャケット画像クリック型＋`i=music`限定を標準とし、asinはAmazonが自動で正規ジャケットを出す場合のみ任意設定。
8. ジャケット画像取得（必須）:
   - asinが設定済みの場合: Amazonが自動表示するためスキップ
   - asinがnullの場合: Deezer Search APIで取得して保存（iTunesより正確）
   ```
   node -e "
   const slug='{slug}', artist='{artists}', album='{album}';
   const q=encodeURIComponent(artist+' '+album);
   fetch('https://api.deezer.com/search/album?q='+q+'&limit=5')
     .then(r=>r.json()).then(async d=>{
       const match = d.data?.find(r=>r.artist?.name?.toLowerCase().includes(artist.split(' ')[0].toLowerCase())) || d.data?.[0];
       if(!match){console.log('no art');return;}
       const url=match.cover_xl||match.cover_big;
       const buf=Buffer.from(await(await fetch(url)).arrayBuffer());
       require('fs').writeFileSync('public/images/covers/'+slug+'.jpg',buf);
       console.log('saved: '+match.artist.name+' - '+match.title);
     });
   "
   ```
   - 保存先: `public/images/covers/{slug}.jpg`
   - git addの対象に `public/images/covers/{slug}.jpg` を含める
9. 画像チェック（必須）:
   node agent/src/check-cover-image.mjs {slug}
   - ❌が出たらDeezerで別アルバム名/アーティスト名で再取得してから次へ進む
   - asinが設定済みの場合はスキップ可
10. YouTube埋め込みチェック（必須）:
   node agent/src/check-youtube.mjs {slug}
   - youtubeId（メイン動画）は必須。未設定/空/404 は ❌
   - sampleYoutubeId / youtubeShortId は任意だが、設定済みなら生存必須
   - ❌が出たら正しい公式動画IDに差し替えてから次へ進む（oEmbedで実在確認）
   - 【重要】youtubeIdは推測で書かない。必ず実在する動画を確認して設定する
11. 歌詞チェック（必須・ページ種別で自動分岐）:
   node agent/src/check-lyrics-coverage.mjs {slug}
   - **learning型（`<LearningUnit>`使用）**: [B]ハルシネーション必須＋[C]独自性（独自解説JP>英語引用 かつ≥1200字）＋[D]引用最小性（eng引用率<60%）＋[E]タイムスタンプ（任意）。[A]全行カバレッジは適用されない。
   - **従来型**: [A]抜け漏れ（Genius行が.astroに存在するか・閾値以上）＋[B]ハルシネーション。
   - ❌が出たら修正してから次へ進む
   - 2026年以降の新曲でGeniusデータ不完全な場合は[B]を手動確認
   - pre-pushフック（`agent/hooks/pre-push`）も同スクリプトを呼ぶため、commit前にここで通しておく。**ガードを `--no-verify` でバイパスしない**（種別判定が正しく効く）。
12. npm run build でビルド確認
13. 自分が変更・作成したファイル（.astro, songs.ts, artists.ts, public/images/covers/{slug}.jpg）のみを git add → git commit → git push
    ※【厳守】絶対に "git add ." を実行しないこと（ユーザーのローカル作業と競合するため）
```

## アーティスト自動追加ルール（重要）
- 曲記事を作るたびに `src/data/artists.ts` の該当 `artistSlug` を確認する
- 未登録なら必ず追加してからコミット（アーティストページが自動生成される）
- `artists/[slug].astro` は `artists.ts` のエントリを元に静的生成されるため、登録漏れ＝アーティストページなし

## 歌詞正確性ルール（重要）
- 必ずGeniusから歌詞を直接fetchして正とする
- GistとGeniusで差異があればGenius優先
- 歌詞の抜け・重複・順序ミスはGenius照合で修正すること

**Gistテンプレート:** `data/gist-template.md`
- Deep Research出力をそのままペーストするだけ
- 曲名/アーティスト/年/スラング/センテンス分割はClaudeが自動抽出

**ユーザーの指示例:**
- `「Gist: https://gist.github.com/...」→ 記事作成して`
- `「gist [ID]」→ 記事作成して`

## コンテンツフィルター回避ルール（重要）
- **歌詞の英語行（explicit含む）を絶対にレスポンステキストに直接出力しない**
- `.astro`ファイルを読んで歌詞内容を確認する場合、個々のlyric行をレスポンスに含めない
- `check-lyrics-coverage.mjs`の出力は exit code と ✅/❌サマリーのみ報告する（NG行は出力しない）
- 歌詞修正が必要な場合は、修正内容をレスポンスに書かずに直接ファイルに書き込む
- Genius歌詞ファイル(`/tmp/lyrics-{slug}.txt`)の中身をレスポンスに貼り付けない

### ショート動画アライメント診断ルール（重要・再発防止）
- **`agent/{slug}/compositions/song.html`、`agent/{slug}/index.html` など歌詞を含むHTMLファイルを直接 Read または Bash cat で読まない**
  → 読むとコンテンツフィルターが発火する
- アライメント診断は必ず専用スクリプト経由で行う:
  ```
  node agent/src/check-short-alignment.mjs {slug}
  ```
  出力はタイミング構造のみ（歌詞テキストなし）。exit 1 = ❌、exit 0 = ✅ を報告。
- アライメント修正が必要な場合は、HTMLを直接編集せずに `generate-short-video.mjs` で再生成する
- HTML内の歌詞テキストをレスポンスに引用・転記しない

## 応答ルール
- 説明・まとめ不要
- コードと結果のみ
- 承認プロンプト最小化
