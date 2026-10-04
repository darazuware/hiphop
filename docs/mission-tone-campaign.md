# 任務: トーン一斉更新キャンペーン（全曲を nas-is-like 基調へ）

全81曲の曲記事を、nas-is-like のトーン・1〜2文/p改行ルール・内部リンク規約（`docs/article-tone.md`）へ機械検証つきで揃える常設バッチ。監査時点（2026-07-10）で **78曲が check-tone-only の絶対基準❌**（模範の nas-is-like 自体も、後から恒久化された改行ルール未対応で❌）。

## 3点セット（docs/mission-protocol.md 準拠）

### ① 入口1コマンド
```
node agent/src/tone-campaign.mjs status          # 監査・残数確認（review worktree基準）
node agent/src/tone-campaign.mjs run --count 3   # 未更新の先頭3曲を順次修正（既定 Sonnet・full）
```
Telegramからは（bot `index.mjs` が新コードで稼働していること）:
- `トーン一斉` → 先頭3曲・opus・unit増強／legacy曲はconvert込み（＝`run --count 3`）
- `トーン一斉 5 tone` → 5曲・軽量パス（unit増強・convert変換なし） ／ `トーン一斉 5 sonnet` → sonnetで5曲
- `トーン一斉 状況` → 残数と次の1曲
バッチ実行中の二重起動は拒否される。終了時に🏁サマリーが届き、`トーン一斉 <N>` を再送すれば続きから回る。
`run` は既存の「修正依頼」ルーチン（`claude.mjs runToneFix`・Opus 1回+post-check・watcher委譲）で1曲ずつ回す。オプション:
- `--count N` 1回に回す曲数（既定3。convert対象曲が混ざる回は1曲2時間かかるため少なめ推奨）
- `--scope full|tone` full=実施内容1〜4・learning型はunit増強／**legacy型はconvertへ自動昇格**（既定）／tone=文体・改行・内部リンクのみ（unit増強・convert変換とも スキップ）
- `--model sonnet|opus` 既定opus（文体を書く/書き直す精度優先。nas-is-like等のreflowOnly曲だけ指定に関わらず自動でsonnetへ降格）
- `--dry-run` 対象曲の表示のみ

### ② 機械検証のDoD
- **曲単位**: review側 `check-tone-only.mjs {slug}` が**絶対基準✅**（pre-pushのベースライン比較ではない）かつ `check-article.mjs {slug}` 全✅。convert対象曲はさらに `check-lyrics-coverage.mjs {slug}` の[B][C][D]（<LearningUnit>導入で自動的にlearning型判定へ切り替わる）も必須。完了判定は runToneFix の自己申告でなく `tone-campaign.mjs` が**再監査**（check-tone-onlyの再実行）で行う。
- **キャンペーン全体**: `node agent/src/tone-campaign.mjs status` で `❌未更新 0`。

### ③ 出口（review push）
各曲とも runToneFix 内の固定手順で `git push origin review` → `notify-review.mjs {slug}`（Telegram通知）まで自動実行。mainへの本番反映は従来どおり運営者の `/publish` のみ。

## 実行順と特例
1. **nas-is-like（先頭・reflowOnlyモード）**: 完全模範ページ自体が改行ルール未対応のため、**改行整形（<p>分割）だけ**を行い文言・unit・リンクは一切変えない。以降の曲が参照する模範を先に規約準拠にする。
2. learning型で units が少ない順（増補キャンペーンと合流。shook級25unit未満が優先）
3. 従来型（LyricsBlock）はアルファベット順（**scope=fullなら自動的にconvertへ昇格**＝learning型への全面書き直し。`--scope tone`明示時のみ変換せず文体/改行/リンクだけ）

## legacy→learning 全面変換（convertスコープ・2026-08-04追加）
**背景**: AdSenseから「低品質・内容が薄いコンテンツ」で却下。従来型（LyricsBlockの歌詞対訳ページ）は文体を整えるだけでは独自性・情報量が不足するため、学習解説主体（learning型）へ書き直す方針に転換（運営者確定）。
- `run --scope full`（既定）で legacy 判定の曲は自動的に `runToneFix(..., { scope: 'convert' })` が呼ばれる。プロンプトは歌詞再取得→nas-is-like文体/shook-ones-pt-ii分量（25〜30unit）で本文を丸ごと書き直し→units.json/gen-fallback-timestamps.mjs→check-lyrics-coverage([B][C][D])→check-tone-only→check-article、の順で全部通す。
- **タイムアウトは2時間**（`claude.mjs` の `CONVERT_TIMEOUT_MS`）。新規記事執筆に近い作業量のため通常の45分では足りない。
- `--scope tone` を明示指定した回だけ変換をスキップし、従来どおり文体/改行/リンクのみの軽量パスで回る（急ぎで表面だけ揃えたい時用）。

## 運用メモ
- 前提: watcher（launchd `com.hiphop.watcher`）。停止していれば runToneFix が launchctl 経由で自動起動する。
- **Claude使用上限（session/usage limit）は中断しない（2026-07-10）**: エラーメッセージからリセット時刻（例: `resets 7:30pm`）を読み取り、+3分バッファで待機して**同じ曲から自動再開**する（Telegramに⏸通知）。読めなければ60分待機。1回のrunで最大3回まで待機し、それでも上限なら通常の失敗として扱う。consecFail には数えない。
- 2曲連続で失敗（上限以外の実失敗）したら環境異常とみなし自動中断（`agent/.tone-campaign-state.json` に履歴が残る）。
- キューは毎回 review worktree の再監査から計算するので、Telegram の個別「修正依頼」や手動修正と並走しても二重修正にならない（✅になった曲は自動でキューから消える）。
- 1曲あたり最長45分（convert対象は2時間）。`--count` は convert混在時は1〜2など小さめを推奨（1曲が長いため）。
- 状態ファイル `agent/.tone-campaign-state.json` は生成物（コミット不要・削除しても監査から復元可能）。
