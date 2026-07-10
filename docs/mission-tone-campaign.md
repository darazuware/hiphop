# 任務: トーン一斉更新キャンペーン（全曲を nas-is-like 基調へ）

全81曲の曲記事を、nas-is-like のトーン・1〜2文/p改行ルール・内部リンク規約（`docs/article-tone.md`）へ機械検証つきで揃える常設バッチ。監査時点（2026-07-10）で **78曲が check-tone-only の絶対基準❌**（模範の nas-is-like 自体も、後から恒久化された改行ルール未対応で❌）。

## 3点セット（docs/mission-protocol.md 準拠）

### ① 入口1コマンド
```
node agent/src/tone-campaign.mjs status          # 監査・残数確認（review worktree基準）
node agent/src/tone-campaign.mjs run --count 3   # 未更新の先頭3曲を順次修正（既定 Sonnet・full）
```
Telegramからは（bot `index.mjs` が新コードで稼働していること）:
- `トーン一斉` → 先頭3曲・sonnet・unit増強込み（＝`run --count 3`）
- `トーン一斉 5 tone` → 5曲・unit増強なし ／ `トーン一斉 5 opus` → opusで5曲
- `トーン一斉 状況` → 残数と次の1曲
バッチ実行中の二重起動は拒否される。終了時に🏁サマリーが届き、`トーン一斉 <N>` を再送すれば続きから回る。
`run` は既存の「修正依頼」ルーチン（`claude.mjs runToneFix`・三稿制・watcher委譲）で1曲ずつ回す。オプション:
- `--count N` 1回に回す曲数（既定3。Telegramレビューの消化に合わせ3〜5推奨）
- `--scope full|tone` full=実施内容1〜4（unit増強込み・既定）／tone=文体・改行・内部リンクのみ（unit増強スキップ）
- `--model sonnet|opus` 既定sonnet（品質は三稿制＋機械検証で担保。opusは難物の再挑戦用）
- `--dry-run` 対象曲の表示のみ

### ② 機械検証のDoD
- **曲単位**: review側 `check-tone-only.mjs {slug}` が**絶対基準✅**（pre-pushのベースライン比較ではない）かつ `check-article.mjs {slug}` 全✅。完了判定は runToneFix の自己申告でなく `tone-campaign.mjs` が**再監査**で行う。
- **キャンペーン全体**: `node agent/src/tone-campaign.mjs status` で `❌未更新 0`。

### ③ 出口（review push）
各曲とも runToneFix 内の固定手順で `git push origin review` → `notify-review.mjs {slug}`（Telegram通知）まで自動実行。mainへの本番反映は従来どおり運営者の `/publish` のみ。

## 実行順と特例
1. **nas-is-like（先頭・reflowOnlyモード）**: 完全模範ページ自体が改行ルール未対応のため、**改行整形（<p>分割）だけ**を行い文言・unit・リンクは一切変えない。以降の曲が参照する模範を先に規約準拠にする。
2. learning型で units が少ない順（増補キャンペーンと合流。shook級25unit未満が優先）
3. 従来型（LyricsBlock）はアルファベット順（unit増強なし・文体/改行/リンクのみ）

## 運用メモ
- 前提: watcher（launchd `com.hiphop.watcher`）。停止していれば runToneFix が launchctl 経由で自動起動する。
- **Claude使用上限（session/usage limit）は中断しない（2026-07-10）**: エラーメッセージからリセット時刻（例: `resets 7:30pm`）を読み取り、+3分バッファで待機して**同じ曲から自動再開**する（Telegramに⏸通知）。読めなければ60分待機。1回のrunで最大3回まで待機し、それでも上限なら通常の失敗として扱う。consecFail には数えない。
- 2曲連続で失敗（上限以外の実失敗）したら環境異常とみなし自動中断（`agent/.tone-campaign-state.json` に履歴が残る）。
- キューは毎回 review worktree の再監査から計算するので、Telegram の個別「修正依頼」や手動修正と並走しても二重修正にならない（✅になった曲は自動でキューから消える）。
- 1曲あたり最長45分（claude.mjs のタイムアウト）。`--count 3` で最長2時間強を見込む。
- 状態ファイル `agent/.tone-campaign-state.json` は生成物（コミット不要・削除しても監査から復元可能）。
