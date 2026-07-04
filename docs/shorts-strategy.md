# ショート動画戦略（SNS流入・恒久ルール）

目的: 曲記事1本につきショート動画を量産し、YouTube Shorts等からサイトへ流入させる。
既存パイプライン（下記）を標準とし、勝手に別方式を発明しない。

## 著作権方針（最重要・変更はユーザー決裁のみ）
- **公式MV映像の切り抜き流用はしない。** Content IDによる削除・ブロック・アカウントへの累積ペナルティのリスクがあり、
  収益化アカウントを賭けるリターンがない
- 標準は**自前生成ビジュアル（歌詞カード型）＋音源断片＋日本語訳オーバーレイ**（既存 `generate-short.mjs` 方式）
- 音源のContent ID**クレーム**（収益が権利者に行く）は許容する。目的は広告収益ではなく記事への流入。
  **ブロック**（公開不可）になった曲は差し替えるか諦める。異議申し立てはしない
- 引用の考え方はサイト本体と同じ: 断片のみ・翻訳と解説が主体・出典明示（docs/fact-check-rules.md）

## 標準フロー（1曲 = 1コマンドずつ・順番厳守）
```
1. 曲記事が check-article.mjs 全✅ で完成していること（記事なしのショートは作らない）
2. node agent/src/generate-short.mjs --slug {slug}      # 生成（仕様: memory shorts_generation.md）
3. node agent/src/check-short-alignment.mjs {slug}      # アライメント検証。❌なら再生成（HTMLを直接編集しない・Readで開かない）
4. node agent/src/upload-short.mjs --slug {slug}        # YouTubeへ投稿。songs.ts に youtubeShortId が自動で焼かれる
5. サイト側の埋め込みは youtubeShortId から自動描画（手作業なし）
6. 動画説明欄に記事URL（https://waxthink.com/songs/{slug}）が入っていることを確認
```
- 一括生成: `node agent/src/batch-generate-shorts.mjs`（生成済みスキップ・失敗継続）
- 長尺・解説動画のキュー投稿: `publish-next-video.mjs`（launchd自動）

## 台本・字幕ルール
- 翻訳字幕は記事の jpn スロットを正とする（新訳を起こさない＝記事と動画で訳が食い違うのが最悪）
- 切り抜き箇所は units の「その曲で一番強い1〜2表現」。迷ったら記事の highlights 先頭
- 煽りテキスト・キャプションの文体も article-tone.md 準拠（評論家ヅラ禁止・ダッシュ禁止）
- ハッシュタグ: #hiphop #和訳 #{アーティスト名} を基本3点。乱発しない

## 横展開（将来・現状は手動）
- TikTok / Instagram Reels は同一mp4を手動投稿（APIは審査制のため当面ユーザーが実施）
- プロフィール/固定コメントにサイトURL。動画内にも `waxthink.com` を常時表示（generate-short側で焼き込み済みか確認）

## DoD（この任務のDone）
- [ ] check-short-alignment ✅
- [ ] YouTube上で再生確認（限定公開でも可）
- [ ] songs.ts に youtubeShortId が入り `npm run build` が通る
- [ ] review push → notify-review.mjs
