# トップ曲一覧の30秒試聴ボタン（Deezerプレビュー）

トップページの曲カード（全曲グリッド・まずはこの6曲・ランキング・最新追加）に再生ボタンを出し、
記事を開かずに曲の雰囲気を確認できるようにする仕組み。2026-07-13導入。

## 任務の3点セット
- **入口**: `node agent/src/gen-previews.mjs --slug {slug}`（新曲1曲の解決。`check-article.mjs` が[PRV]ステップで自動実行するため、通常は手動実行不要）
- **DoD**: `node agent/src/check-article.mjs {slug}` の `[PRV]` が ✅
- **出口**: 通常の記事フローと同じ（review push → notify-review）

## 仕組み
- `src/data/previews.json` に slugごとの **Deezer track ID** を保存する（`{ id, artist, title, album } | null`）。
  null = Deezer未収録（ボタン非表示。キーは残す＝解決試行済みの印）。
- **プレビューURLは保存しない**。Deezerのプレビュー音源URLは有効期限付きトークン（`hdnea=exp=`）のため、
  再生時にクライアントが JSONP（`api.deezer.com/track/{id}?output=jsonp`）で新鮮なURLを取得して `<audio>` で再生する。
  音源はDeezer公式の30秒プレビュー（自前ホスティングなし＝権利面も安全）。
- UI部品:
  - `src/components/PreviewButton.astro` — ボタン1個。previews.json に id がある曲だけ描画（null曲はボタン自体が出ない）
  - `src/components/PreviewPlayer.astro` — 共有プレーヤー（ページに1回配置）。同時再生1曲・進捗リング・iOSジェスチャー解錠対応
- CSP（`public/_headers`）: `script-src` に `https://api.deezer.com`（JSONP）、`media-src 'self' data: https://*.dzcdn.net`（音源とiOS解錠用無音WAV）を許可済み。

## 新曲作成時の自動化
`check-article.mjs {slug}` の `[PRV]` ステップが previews.json に slug が無ければ
`gen-previews.mjs --slug` を自動実行して解決する。**記事作成フローに追加作業は無い。**

## gen-previews.mjs の使い方
```
node agent/src/gen-previews.mjs --slug {slug}          # 1曲解決（解決済みならスキップ）
node agent/src/gen-previews.mjs --all                  # 未解決の全曲をバックフィル
node agent/src/gen-previews.mjs --all --force          # 再解決（manual設定は保護される）
node agent/src/gen-previews.mjs --set {slug}={trackId} # 手動設定（自動マッチ不能・誤マッチ時）
```

## マッチング精度の設計（誤マッチ防止）
- タイトルは括弧書き（feat./Remaster等）除去後の**完全一致のみ**（"Pt. II" 等の別曲を弾く）
- live / remix / mix / instrumental / karaoke / tribute / demo 等はタイトルで除外
- ASCIIアーティスト名は正規化一致必須（Common に対する Common Kings 等の別人を弾く）。
  カバー楽団系（quartet / orchestra / カラオケ等）はアーティスト名で除外
- Deezerがタイトルを日本語ローカライズする曲（ハンブル等）は、`artist:`+`track:` フィルタ付き検索の
  結果に限りライヴ/リミックス表記を除いて許容
- フォールバック検索（フィルタ無し）ではローカライズ名候補にアルバム一致を必須化
- それでも誤る/見つからない場合は `--set` で手動設定（`manual: true` が付き `--force` でも上書きされない）

## 注意
- previews.json はサイトコンテンツ（`src/data/`）なので **reviewブランチで編集・push** する
- `gen-previews.mjs` / `check-article.mjs` を main で更新したら review ワークツリーの `agent/` にも同期する（ガード二枝同期ルール）
- Deezer未収録で null の曲: classic-better-than-ive-ever-been---dj-premier-remix / hold-you-down / road-to-the-riches / the-1st-time（2026-07-13時点）
