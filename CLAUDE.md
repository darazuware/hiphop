# hiphop — プロジェクト設定

## 任務遂行プロトコル（最重要・常駐・全モデル共通）
- **どの任務も着手前に [`docs/mission-protocol.md`](docs/mission-protocol.md) に従う。** 要点: ①任務は「入口1コマンド＋機械検証のDoD＋review push出口」の3点セットを持つ（無ければ先に作る） ②文章は三稿制（初稿→check-tone-only＋他人の目で再読→仕上げ） ③内部リンクは手書きせず生成に任せる ④同種の失敗2回目は必ずルール追記かガード化までやる ⑤❌残しの完了報告禁止。
- ショート動画関連は [`docs/shorts-strategy.md`](docs/shorts-strategy.md)（MV切り抜き禁止・既存パイプライン厳守）。

## 事実チェック（最重要・常駐）
- **サンプル系記事（曲ページ・コラム）を追加／編集するときは、作業前に必ず [`docs/fact-check-rules.md`](docs/fact-check-rules.md) を読み、本ルールに従う。**
- サンプル・年・アルバム・客演・チャート順位・曲の実在性に関する事実主張は、生成時のハルシネーションを前提に一次ソース（WhoSampled / Wikipedia / Discogs / Genius）で必ず裏取りする。

## 記事トーン（常駐・文体ルール）
- **記事・コラムの日本語文章を書く／書き直すときは、作業前に必ず [`docs/article-tone.md`](docs/article-tone.md)（チェックリスト版・これだけ読めばよい）を読み、運営者本人の声で書く。** 外注ライター調のガチガチな説明文を避ける。経緯・実例は `docs/article-tone-archive.md`（生成時に読まない）。
- 核心: **敬体（です・ます）基調**に常体を柔らかい着地のスパイスで混ぜ、**常体敬体のゆらぎを許容**して固さを消す（※旧「常体基調」は撤回済み）。作品への熱と敬意、軽い口語の抜け、一文の長短の緩急、専門語の直後の噛み砕き。
- **トーン模範は `src/pages/songs/nas-is-like.astro` の1本のみ**（完全模範。踏襲対象は文体・改行構造で、見出し文言は曲ごとに固有で書く）。
- **トーンはラフでも事実は厳密。** トーン調整は日本語解説部分のみで行い、英語引用（eng）・和訳（jpn）の分量は増やさない。事実主張は上記「事実チェック」に従う。

## review運用（本番push制限・重要・2026-07-02〜）
- AdSense審査対策として、**mainへの本番pushは1日1回程度に抑える**運用にした。記事（.astro・songs.ts・artists.ts・画像等サイトコンテンツ）の編集は、常設worktree **`/Users/ktamatzmoto/Desktop/hiphop-review`（`review`ブランチ）** で行い、`git push origin review` する。**mainへの直pushはしない**（対話セッション・Telegram bot共通）。
- **デプロイ実体はVercel**（GitHub連携。Cloudflareはドメイン前段のDNS/プロキシのみで、ビルド・プレビューはCloudflareではない）。Vercelが`review`ブランチのプレビューを自動デプロイする。固定プレビューURL: `https://hiphop-git-review-darazuwares-projects.vercel.app`（プッシュのたびに内容が更新される。個別デプロイのハッシュ付きURLはpushごとに変わるので使わない）。ユーザーはスマホでこのURLを確認し、Telegramでフィードバックを出す。Vercelのデプロイ保護が有効なため初回はVercelログインを求められることがある。
- 承認後の本番反映（`review`→`main`のマージ・build確認・push）は決定的スクリプト [`agent/src/publish-main.mjs`](agent/src/publish-main.mjs)（Telegramの`/publish`コマンド）でのみ行う。対話セッションが自然文の指示で代わりにmainへマージ・pushしない。
- **例外**: `agent/`配下のbotスクリプトや`docs/`のドキュメント、`CLAUDE.md`自体など、Astroビルド出力（`src/`・`public/`）に影響しないインフラ/ドキュメント変更は、この制限の対象外（サイトの表示内容が変わらないため）。これらはmainへ直接commit・pushしてよい。

## 絵文字禁止（サイト全体）
- サイトのソースコード（.astro / .ts / .tsx / コンポーネント）に絵文字（Unicode Emoji）を使わない。DiveCardsの `icon` propなどもテキストラベル（例: "RZA", "94", "WU"）で代替する。
- ★ や ▶ などの記号文字（Dingbats / Geometric Shapes）はUIパーツとして許容。

## スタック
- Astro + Tailwind CSS v4 + TypeScript
- デプロイ: Vercel（GitHub連携 → git pushで自動デプロイ。Cloudflareはドメイン前段のDNS/プロキシのみ、ホスティング本体ではない）
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
- デプロイ: `git push` (Vercel自動。Cloudflareはドメイン前段のプロキシのみ)

## ルール
- 新曲追加は `src/data/songs.ts` にデータ追記 → `src/pages/songs/[slug].astro` 作成
- OGP画像は `src/pages/og/[slug].png.ts` で自動生成済み
- CSPはpublic/_headersで管理（YouTube埋め込み・Adsense対応済み）
- コメント不要、型安全を維持
- **songs.tsの文字列はダブルクォートを使う**（アポストロフィを含む曲名・タイトルでシングルクォートを使うとシンタックスエラーになる）
- **git push前に必ず `npm run build` でビルド確認**してからpushすること
- **記事コンテンツの変更は `review` ブランチへpushする**（上記「review運用」参照）。mainへの直pushは禁止（インフラ/ドキュメント変更は例外）

## スラング詳細リンクのルール
- `QuickSlang` は中央辞書 `src/data/slang.ts` に登録がある語のみ「もう一度タップで詳細 →」リンクを表示する（実線下線）。未登録の日常語（ill 等）は簡易解説ツールチップのみ（点線下線・デッドリンクなし）
- 珍しい/固有名詞のスラングに詳細リンクを付けたい場合は `src/data/slang.ts` に `{ word, desc }` を追加する
- **頻出スラングのdesc集約（2026-07-03確定）**: 複数曲に出る語の「素の意味・語源」は `slang.ts` に1回だけ書き、ページ側の `desc` は「この曲での使われ方・ニュアンス」中心に書く。同一descの曲間コピペは定型句ガード（Item4）に当たるため禁止、毎回のゼロから書き直しも不要
- 詳細リンク先 `/slang?q={英語語}` では、その語を使う全曲が「使用曲」として自動内部リンクされる（`word=`/`term=` 両prop・日本語注釈付き対応済み）

## 既存曲の自動修正ルーティン（Telegram: `修正依頼 <曲名>`・2026-07-06確定）
- 入口は Telegram の **`修正依頼 <曲名>`**（例: `修正依頼 put it on`）。`index.mjs` → `claude.mjs` の `runToneFix` が固定手順を流す。実装を変える時は両者と本節を同期する。
- **モデルは Sonnet 固定**（`trigger.meta.model='sonnet'`。watcherが受けて `--model sonnet` で実行）。**毎回Opusで文体修正するのはトークンの浪費**なので、品質はモデルでなく下記の三稿制＋機械検証に持たせる。
- **必ず三稿制で回す（`docs/mission-protocol.md` §3）**: ①第1稿=作る ②第2稿=「外注ライターがAIで書いた文に見えないか」の一点で他人として疑い直す ③第3稿=`check-tone-only` を通して仕上げる。1パスで終わらせない。
- **1回の修正依頼で必ず4点すべてやる**:
  1. 文体を **nas-is-like基調**へ（`docs/article-tone.md`。評論家ヅラ・AI臭・ダッシュ・読者命令形ゼロ、敬体率ガードに触れない）
  2. **1〜2文ごとの改行**（`<p>`に3文以上詰めない。全パート適用）
  3. **内部リンク修正**（重要スラングを `slang.ts` に登録／文中リンク先の実在確認。関連記事カードは手書き禁止＝SongLayout自動生成）
  4. **unitを上限ギリギリまで増強**（learning型のみ）: shook級25〜30unit・量MAXへ。硬い上限は [D] eng引用率<60% と [C] 独自解説JP>英語引用(≥1200字)の2ガードのみ、その内で最大化。unit追加時は `units.json` 追記＋`gen-fallback-timestamps.mjs` 再生成を必ずやる（怠るとimport不在でビルド落ち）。従来型はunit増強を飛ばし1〜3のみ。
- 出口は共通: `check-article.mjs` 全✅ → `git push origin review` → `notify-review.mjs`（mainへは直pushしない）。

## ページ種別（重要・新標準）
曲ページには2種類ある。検証フックはページ種別で自動分岐する（`<LearningUnit>` の有無で判定）。
- **learning型（新標準）**: 学習解説主体ページ。歌詞全行は載せず、スラング・韻・言葉遊び・AAVE文法を「学ぶ表現」単位で解説。英語は用例断片のみ引用。`src/components/LearningUnit.astro` を使う。**完全模範＝`nas-is-like.astro`**（2026-07-03一本化。shook級への増補完了までの分量参照のみ `shook-ones-pt-ii.astro`）。詳細は [[project_learning_page]]（memory）。
  - **新規の曲ページは原則 learning型・shook級分量（25〜30unit・量MAX）で作る。** [D]<60%・[C]の2ガード内で歌詞量を最大化（60%は緊急上限でなく攻めてよい確定方針）。
  - **背景/制作/評価の深掘りは [`docs/column-split-rules.md`](docs/column-split-rules.md) の閾値で「曲ページ内包」か「別コラム化」を判定する。** 別コラム化したら曲ページからは [`src/components/DiveCards.astro`](src/components/DiveCards.astro)（記事末＝動線）＋units前の予告ブロックの2箇所で誘導。リンク先は実在コラムのみ（デッドリンク厳禁）。**薄い内容を無理に別コラム化しない**（AdSense Low value content 回避）。
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

## 記事作成フロー（WebSearchリサーチ・2026-07-03改定）
```
1. ユーザーが曲名（アーティスト/slug）を指定する
2. Claude: WebSearchで一次ソース（WhoSampled/Wikipedia/Discogs/Genius）を裏取りし、
   docs/fact-check-rules.md に従って事実（年・アルバム・客演・サンプル・チャート）を確定
   ※Gemini Deep Research→Gist経由の旧フローは廃止（Gemini不使用）
3. Claude: 曲のtierを確認（原則shook級25〜30unit。docs/article-tone.md「模範」参照）
4. Claude: Genius APIで歌詞を取得し /tmp/lyrics-{slug}.txt に保存
   - node -e "import {getLyrics} from './agent/node_modules/genius-lyrics-api/index.js'; ..."
   - optimizeQuery: false を使い誤マッチを防ぐ
5. Claude: src/data/songs.ts にエントリ追記（artistSlug含む）
6. Claude: src/data/artists.ts を確認し、artistSlugが未登録なら追加
   - 追加項目: slug, name, origin, active, genre, summary, japan
   - step2のリサーチ結果から自動生成
7. Claudeが.astroページを生成（SongLayout使用）
   - **【三稿制・必須】** 初稿を書き切る → `node agent/src/check-tone-only.mjs {slug}` を通す → 「外注ライターがAIで書いた文に見えないか」の一点で自分の文を他人として再読し直す → 仕上げて再チェック（[`docs/mission-protocol.md`](docs/mission-protocol.md) §3）
   - **【関連記事カード手書き禁止】** 記事末の関連記事リンクはSongLayoutが songs.ts から自動生成する（同アーティスト→同プロデューサー→同じ元ネタ→同時代×同地域）。`.astro` 本文に手書きの関連記事セクションを新設しない（腐ってデッドリンク化した前例あり）
   - **【文体】生成する日本語文章は [`docs/article-tone.md`](docs/article-tone.md)（チェックリスト）に従い、模範＝nas-is-like.astroの文体・改行構造を踏襲する**（見出し文言は曲固有）。敬体基調＋常体スパイス・作品への熱・軽い口語の抜け・専門語の噛み砕き。ガチガチのライター調にしない。ただし事実は [`docs/fact-check-rules.md`](docs/fact-check-rules.md) で厳密に裏取りし、英語引用（eng）量は増やさない。
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
   - **【[D]予算運用（2026-07-03確定）】** unitを数個書くごとに本チェックを回し、[D]が57%を超えたら以降のunitは「引用不要スラング方式」（eng/jpnスロット無し・語と背景の解説＋▶頭出しで完結）に切り替える。コーラス等3回以上反復行は[D]母数外＝引用自由。usageスロットの英語も[D]算入。詳細は [`docs/fact-check-rules.md`](docs/fact-check-rules.md)「引用予算の運用」。
   - **従来型**: [A]抜け漏れ（Genius行が.astroに存在するか・閾値以上）＋[B]ハルシネーション。
   - ❌が出たら修正してから次へ進む
   - 2026年以降の新曲でGeniusデータ不完全な場合は[B]を手動確認
   - pre-pushフック（`agent/hooks/pre-push`）は `agent/src/pre-push-check.mjs` を呼ぶ。commit前にここで通しておく。**ガードを `--no-verify` でバイパスしない**（種別判定が正しく効く）。
   - **定型句ガード（pre-push-check.mjs / Item4）**: 全曲.astroを横断し、25文字以上の同一日本語解説文が複数曲で使い回されていないか検出する（eng歌詞断片は除外。出力は該当slugと重複箇所数のみ＝歌詞英語行を出さない）。許容済みの既存重複は `agent/.dup-baseline.json` にハッシュで記録（平文非保存）。baselineに無いnet-newの曲間重複はブロックする。意図的に許容する場合のみ `node agent/src/pre-push-check.mjs --update-dup-baseline` で焼き直す。**同一/酷似の解説文を曲間でコピペ再利用しない**（[`docs/article-tone.md`](docs/article-tone.md)）。
   - **Genius短尺フェッチ対策（pre-push-check.mjs / Item6）**: キャッシュ2h超過時の再フェッチは、(a)取得歌詞が既存キャッシュより行数が少なければ不完全とみなしキャッシュを上書きしない（行数が同等以上の時のみ更新）、(b)不完全フェッチ時は[B]を失敗ブロックでなくスキップ＋警告（`SKIP_B=1`／要手動確認）にして誤検出で正しい記事を改変しない、(c)短尺が返ったら最大3回リトライし最長版を採用する。出力は行数・カウントのみ。
12. 頭出しタイムスタンプ生成（learning型・**whisper/AI音源解析は使わない**・2026-07-03確定）:
   - `agent/{slug}/assets/units.json` を曲順に作成し、各unitに `fallbackT`（Verse頭から1行≈2.5〜3秒の線形補間による概算秒）と `manualSec: null` を付ける
   - `node agent/src/gen-fallback-timestamps.mjs --slug {slug}` で `units-timestamps.json` を決定的に生成（音源DL・whisper・extract-unit-timestamps.mjsは実行しない）
   - 正確な秒数は**運営者がプレビューを見て実測指示**する。受け取ったら `node agent/src/set-manual-timestamp.mjs --slug {slug} id=秒 ...` で焼く（[`docs/timestamp-override.md`](docs/timestamp-override.md)）
13. 総合チェック（必須・1コマンド）:
   node agent/src/check-article.mjs {slug}
   - IMG/YT/歌詞・トーン・定型句/ビルド/内部リンク/SEOを一括実行し✅❌サマリーを出す（歌詞テキストは出力しない）
   - **❌が1つでもあれば修正して再実行。全✅になるまでcommitしない**（step 9〜11を個別に回した場合でも最後にこれを必ず通す）
   - 内部リンク検査[LNK]はサイト全体を走査する。自分の変更と無関係な既存デッドリンクが出た場合はそれも直す（デッドリンク厳禁）
14. 自分が変更・作成したファイル（.astro, songs.ts, artists.ts, public/images/covers/{slug}.jpg, agent/{slug}/assets/*.json）のみを、**`hiphop-review` worktree（reviewブランチ）で** git add → git commit → git push origin review
    ※【厳守】絶対に "git add ." を実行しないこと（ユーザーのローカル作業と競合するため）
    ※【厳守】mainへ直接pushしない。本番反映はユーザーが `/publish` コマンドで行う
15. レビュー依頼通知（必須）: push成功後に `node agent/src/notify-review.mjs {slug}` を実行し、Telegramへ固定プレビューURL（`https://hiphop-git-review-darazuwares-projects.vercel.app/songs/{slug}`）を送る。運営者がスマホでレビューし、承認なら `/publish`、修正指示はTelegramで返ってくる（Telegram bot経由の生成ではwatcherが自動送信するので手動実行は対話セッションのみ）
```

## アーティスト自動追加ルール（重要）
- 曲記事を作るたびに `src/data/artists.ts` の該当 `artistSlug` を確認する
- 未登録なら必ず追加してからコミット（アーティストページが自動生成される）
- `artists/[slug].astro` は `artists.ts` のエントリを元に静的生成されるため、登録漏れ＝アーティストページなし

## 歌詞正確性ルール（重要）
- 必ずGeniusから歌詞を直接fetchして正とする
- リサーチ結果とGeniusで差異があればGenius優先
- 歌詞の抜け・重複・順序ミスはGenius照合で修正すること

**ユーザーの指示例:**
- `「{アーティスト} {曲名} の記事作成して」`（WebSearch裏取りから開始）

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
