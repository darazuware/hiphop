# AI Collaboration Board

## North Star

AIを活用し、WAX&THINKの検索・動画流入を継続収益へ変える。

## Safety

- Claude Code、Codex、ユーザーは同じ曲・動画・ページを同時に変更しない。
- 着手時に担当、対象ファイル、終了条件を書く。
- 終了時に変更、検証、未解決事項、人間にしかできない作業を書く。
- 歌詞本文、secrets、トークンをこのファイルへ記録しない。
- 本番公開は既存のreview運用と `/publish` を守る。

## Current snapshot — 2026-09-13

- 本体には曲ページ81本、コラム13本がある。
- Amazonアソシエイトタグは実装済み。Mercari CTAも実装済み。
- AdSenseコードとポリシー表記は存在するが、過去にLow value contentで却下された記録がある。
- SEO順位履歴ファイルは存在するが、現在レコード0件。
- `main` と `review` は大きく分岐しているため、安易にmergeしない。
- 本体作業ツリーには動画関連を中心に多数の未コミット・未追跡ファイルがある。

## Active work

| Owner | Task | Files / worktree | Status |
|---|---|---|---|
| Claude Code | 記事品質・動画制作・review更新 | `hiphop-review` と宣言済み曲フォルダ | 既存運用を継続 |
| Codex | 公開ゲート・CSP・収益計測 | `hiphop-review`: 共通CTA・Layout・検証スクリプト、`main`: 本ボード | 実装・単体検証完了。公開ゲートは記事側30検出で停止中 |

### Codex task contract — 2026-09-13

- 入口: `npm run check:publish-safety`
- 対象: 未確認マーカー・空CTAの公開ブロック、GA4用CSP、共通アフィリエイトCTAのクリック計測。
- DoD: 公開安全チェック、Astro build、内部リンク、SEO検査がexit 0。既知の映画4記事は本文を触らず、公開安全チェックが意図どおりexit 1になることも回帰確認する。
- 非対象: 曲・コラム本文の修正、review→main統合、commit、push、AdSense管理画面操作。

## Claude Code — 2026-09-13 現状確認（読み取りのみ・変更なし）

1. **進行中の作業/担当worktree**: メイン(`hiphop`)には動画パイプライン（`agent/shook-ones-pt-ii-doc` 461M、`agent/lose-yourself` 207M、`agent/can-i-kick-it` 43M 等）の未commit変更・未追跡ファイルが大量にある。`hiphop-review`（reviewブランチ）はタイムスタンプ編集UI(`feat(review-editor)`)が最新。`git worktree list`上のアクティブworktreeは`hiphop`と`hiphop-review`の2つのみ。`branch -vv`に残る`worktree-agent-*`はいずれも紐づくworktreeが存在しない孤立ブランチ（過去のエージェント実行の残骸、実体なし）。
2. **main ahead/behind**: 現状は `origin/main` に対し **ahead 1 / behind 0**（直近commit d573847のみ未push）。ユーザー言及の「ahead 2 / behind 17」とは一致せず、既に解消済みか別時点の情報と思われる。`main`と`review`は83/47コミットで大きく分岐（想定通り、安易にmerge不可）。
3. **backups/pre_renewal**: このリポジトリの作業ツリー・git履歴（`git log --all`）・ホームディレクトリ配下のいずれにも該当パス無し。削除の事実自体が確認できない（別プロジェクト or 既に無関係化した情報の可能性）。
4. **収益化を止めている要因**（既存記録の再確認）:
   - AdSenseは過去に「低品質・内容が薄いコンテンツ」で却下（`docs/mission-tone-campaign.md`）。対策として従来型記事をlearning型へ移行中だが、mainとreviewの大幅分岐＝**未公開の改善が本番に反映されていない**状態が長期化している。
   - `data/seo/rank-history.json` はレコード0件。`seo-rank-watch`スキル自体は導入済み（直近commit）だが未運用＝検索順位の実測・改善ループが未開始。
   - review→main反映は`/publish`（`agent/src/publish-main.mjs`）を通す運用だが、分岐量から見て直近で`/publish`が実行された形跡が薄い。
5. **Codexに任せると効率が良い仕事**: rank-history運用開始後の機械的な順位ログ集計・レポート化、`docs/`配下のドキュメント整合性チェック、mainブランチ側インフラ/ドキュメントのみの変更（ガード・チェックスクリプトの棚卸し等、Astroビルド出力に影響しない範囲）。
6. **人間にしかできない仕事**（既存Human-only queueに集約済み、変更なし）: Claude Codeログイン、AdSense審査状況の確認、Amazon/Mercariの成果確認、YouTube Studio確認、および**review→mainの`/publish`実行判断**（分岐が大きいため実行前に内容確認が必要）。

## Human-only queue

- Claude Codeのログイン。
- AdSense管理画面の審査状況と理由の確認。
- Amazon・Mercari等の管理画面でクリック数、成約数、報酬を確認。
- YouTube Studioの収益化・Content ID状況を確認。
- review→mainの`/publish`実行判断（現在83/47コミット分岐、要内容確認）。

## Agreed division — 2026-09-13

- Claude Code: 曲記事の事実確認・文体・動画生成・reviewブランチへの成果追加。
- Codex: main/review差分の公開安全監査、SEO順位とアフィリエイトクリックの計測、収益レポート。
- 最初の収益タスク: `/publish`を実行せず、reviewの未公開記事改善と動画ツール変更を分離し、安全に公開できる単位を特定する。

## Codex publish audit — 2026-09-13

- 正しい分岐数は `origin/main` 固有82、`origin/review` 固有47。
- review固有47件には記事品質改善と編集ツール変更が混在している。
- dry-run相当のmerge-tree確認では、両ブランチ変更2箇所・競合マーカー3件を検出した。現状のまま`/publish`しない。
- review単体はAstro build成功（174ページ）。内部デッドリンク0。title、description存在、h1、canonicalの必須検査は全件合格。
- 警告: 内部リンク8本未満の曲ページ16件、description推奨長外39件。
- review固有47コミットのうち、cherry-pick同等分を除く43件を分類: コンテンツ34、ツール5、インフラ4。
- 公開候補のサイト差分は40ファイル、約9,907行追加・1,465行削除。曲ページ31本を含む。
- 直接競合するファイルは `.gitignore` と `CLAUDE.md`。記事ページそのものにはmerge-tree上の直接競合なし。
- 次工程: Claude Codeに `.gitignore` / `CLAUDE.md` の統合だけを専用worktreeで解決させ、全検査後に公開可否を人間レビューへ回す。動画WIPのあるmain作業ツリーでは実行しない。

## Codex safety / revenue implementation — 2026-09-13

- 変更先: `hiphop-review` のみ。commit・push・publishなし。
- 追加: `npm run check:publish-safety`。未確認マーカー、空CTA、既知のチャート取り違え、アフィリエイト属性/タグ、計測スクリプト、CSP、ads.txtを検査する。
- 追加: Amazon、Mercari、VOD共通CTAへ `affiliate_click` 計測属性を付与。merchant、content_type、slug、item、position、destination_hostをGA4へ送る。
- 修正: Vercel/public CSPへGoogle Tag ManagerとGoogle Analytics通信先を追加。モバイルメニューの`aria-expanded`反転を修正。`public/ads.txt`を追加。
- 検証: safety self-test exit 0、Astro build 174ページ exit 0、内部デッドリンク0、SEO必須項目全件合格、`git diff --check` exit 0。
- 公開ブロッカー: 未確認マーカー/コメント10件、既知のBillboardチャート取り違え4箇所、空VOD CTA 8箇所（生成HTMLでも8件検出）。厳格ゲートは合計30検出で意図どおりexit 1。
- Claude Code待ち: `do-the-right-thing`、`how-high`、`juice`、`time-is-illmatic`、`triumph-nine-mcs`、`shook-ones-making-of`、`shook-ones-pt-ii`と`columns.ts`の事実確認・CTA実URL確定。修正後に同じ入口コマンドを再実行する。
- 人間待ち: AdSense管理画面でCMPを有効化し、VOD提携先の承認済み実URLを取得する。

## Claude Code — 公開安全ゲート記事側ブロッカー対応完了 — 2026-09-13

- 対象: `hiphop-review`（reviewブランチ）の `do-the-right-thing.astro` / `how-high.astro` / `juice.astro` / `time-is-illmatic.astro` / `triumph-nine-mcs.astro` / `shook-ones-making-of.astro` / `shook-ones-pt-ii.astro` / `src/data/columns.ts`。commit・pushは実施済み（review限定、main直pushなし）。
- **[要確認]/FACTCHECKマーカー10件**: WikipediaおよびTribeca公式発表を一次ソースに全件裏取りして解消。
  - Do the Right Thing: エンディング（Radio Raheem窒息死→Sal's焼き討ち）、National Film Registry選定年（1999）とアカデミー賞ノミネート内容（脚本賞・Aiello助演男優賞）を確定。
  - How High: 共演キャラクター対応（Mike Epps=Baby Powder、Obba Babatunde）、サウンドトラック配給元（Def Jam・2001年12月）を確定。
  - Juice: 主要キャスト対応（Q=Omar Epps、Raheem=Khalil Kain、Steel=Jermaine Hopkins）、結末（Bishop転落死）を確定。受賞ノミネートは一次ソースで確認できず、該当の未確定文言を断定なしの記述に修正（捏造なし）。
  - Time Is Illmatic: 公開日・配給（2014-04-16 Tribeca開幕上映／Tribeca Filmが北米配給）、証言者（Large Professor, Pete Rock, Q-Tip, DJ Premier）を確定。
  - triumph-nine-mcs: `/songs/triumph`未作成に関するFACTCHECKコメントは、既にリンクを外して解決済みの記録だったため削除のみ（対応不要事項の残存マーカー）。
- **チャート取り違え4箇所**: `shook-ones-making-of.astro` × 2、`shook-ones-pt-ii.astro`、`src/data/columns.ts` の「Billboard 200最高3位」を、Wikipedia「The_Infamous」記事の一次ソース確認どおり **Billboard 200＝18位 / Top R&B/Hip-Hop Albums＝3位** へ修正。
- **空CTA（url="#"）8箇所**: VOD（u-next等）は承認済みアフィリエイトURLが無いため、対象4記事の「配信で観る」セクション（見出し・案内文・CTA）を丸ごと削除してCTA自体を非表示化。Amazon側のurl="#"は、サイト標準の承認済み検索リンク方式（`ColumnAlbums`コンポーネント、tag=wax1124-22・i=music・amazon.co.jp限定）に置き換えて実URL化（`VodCta`直書きの生Amazon CTAは撤去）。
- 歌詞量: 変更なし（本文の日本語解説・事実記述のみ調整、eng/jpn引用ブロックは未変更）。
- 検証: `npm run check:publish-safety` → exit 0（`astro build` 174ページ／`check-publish-safety.mjs`未検出0件／内部デッドリンク0／SEO必須項目全件OK）。`check:publish-safety:self-test` も exit 0 で回帰確認済み。diffは上記8ファイルのみ（他ファイルへの影響なし）。
- 未解決事項: なし（依頼範囲は全項目解消）。人間待ち事項（AdSense CMP・VOD提携先の実URL取得）は変更なし、継続。
