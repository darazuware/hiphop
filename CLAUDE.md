# hiphop — プロジェクト設定

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

## 歌詞翻訳ルール（重要）
- **1センテンス or 文脈が切れるところ単位**でLyricsBlockを分ける（バース全体を1ブロックにしない）
- 1ブロック = 1〜2行が基本。意味のまとまりで区切る
- 各ブロックにeng/jpn/explanationを付ける

## 記事作成フロー（Gist経由）
```
1. ユーザーがGemini Deep Research結果をGistに貼る
2. ユーザーがGist URLをClaudeに伝える
3. Claude: gh gist view で内容取得
4. Claude: WebFetchでgenius.comから歌詞を直接取得・照合・修正
5. Claude: src/data/songs.ts にエントリ追記（artistSlug含む）
6. Claude: src/data/artists.ts を確認し、artistSlugが未登録なら追加
   - 追加項目: slug, name, origin, active, genre, summary, japan
   - Gistの内容とDeep Researchから自動生成
7. Claudeが.astroページを生成（SongLayout使用） → git commit
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

## 応答ルール
- 説明・まとめ不要
- コードと結果のみ
- 承認プロンプト最小化
