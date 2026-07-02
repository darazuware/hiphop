# 学習ユニット秒数の実測上書き（manualSec）運用

## 【最重要・2026-07-03確定】新規曲は whisper を実行しない

新規記事の生成時は**音源DL・whisper解析・extract-unit-timestamps.mjs / gen-unit-timestamps.mjs を実行しない**
（AI・計算資源の無駄。精度も実測に劣る）。手順は次の通り:

1. 生成時: `units.json` を曲順に作り、各unitに `fallbackT`（**Verse頭の位置から1行≈2.5〜3秒の線形補間**による概算秒・整数）を付ける。
2. `node agent/src/gen-fallback-timestamps.mjs --slug {slug}` で `units-timestamps.json` を決定的に生成
   （watcher の bot フローは自動実行する。対話セッションでは手で実行）。
3. 公開後、**運営者がプレビューの▶リンクを実測してズレたunitの秒数を指示**する。
   受け取ったら `set-manual-timestamp.mjs` で焼く（下記「運営者が秒数を渡す手順」）。

whisper 関連スクリプトは過去曲の資産・再解析用として残すのみで、新規フローでは呼ばない。

---

learning型ページの各学習ユニットには、公式PVへの頭出しリンク（▶ X:XX から再生）が付く。
この秒数は2層で持つ。**whisperは外す**ことを前提にした設計。

| レイヤ | 由来 | offset補正 | 優先度 |
|---|---|---|---|
| `whisperSec` | whisper単語アライメント（album相対・自動） | 受ける（`--offset`） | 低（概算・参考値） |
| `fallbackT` | 手動推定（whisperが取り違えた時の保険） | 受けない | 中 |
| `manualSec` | **運営者が実機(PV)で測った実測秒（PV絶対秒）** | 受けない | **最優先** |

最終表示値 `t` は `manualSec ?? (whisperSec - offset) ?? fallbackT`。
つまり **manualSec が入っていれば常にそれが勝つ**。記事には `units-timestamps.json` の `t` が出る。

## なぜ一律オフセット補正をやめたか

cream で album→PV を `+5s` 一律補正したが破綻した。ズレ幅が場所によって違い
（曲頭と曲中で遅延量が変わる・PVの編集点でもズレる）、一律加算では直らない。
そこで **ユニット単位で実測値を直接焼ける** manualSec 層を追加した。
whisperSec は「当たりをつける初期値」に格下げし、最終的な正解は実測で上書きする。

## whisperの精度感（曲タイプ別の目安）

- ソロ/少人数・明瞭な発声: そこそこ当たる（score≥0.75 のユニットは±数秒）
- 大人数で口数が多い曲（例: protect-ya-neck）: **当てにならない**。話者が次々入れ替わり、
  アンカー語の取り違えが多発する。score<0.75 は基本ハズレと思って実測前提で扱う。

`extract-unit-timestamps.mjs` の出力末尾に `score<0.75` のユニット数を warn で出す。
そこに出たユニットは実機確認の最優先候補。

## 運営者が秒数を渡す手順

1. 記事の各ユニットの ▶ リンクを実際に踏み、PVで**その表現が始まる秒**を測る
   （ズレているユニットだけでよい。当たっているものは触らなくていい）。
2. 「曲slug ＋ ユニットID ＝ 実測秒」のリストを Claude に渡す。
   ユニットIDは `agent/{slug}/assets/units.json` の `id`、または記事生成時の報告に載る。
   例: `ny-state-of-mind: rappers-i-monkey-flip=29, vocab-don=78, sleep-cousin-death=132`
3. Claude（または運営者本人）が次を実行:
   ```
   node agent/src/set-manual-timestamp.mjs --slug ny-state-of-mind \
     rappers-i-monkey-flip=29 vocab-don=78 sleep-cousin-death=132
   ```
   → `units.json`（永続）と `units-timestamps.json`（即時）の両方に manualSec を焼く。
4. `npm run build` で記事に反映 → 確認 → commit/push。

whisperを再実行する必要はない（manualSec は whisper値と独立した最優先レイヤ）。

## ファイル構成

```
agent/{slug}/assets/
  audio.mp3                 # whisper入力（album音源）
  units.json                # 入力: [{id, anchor, fallbackT?, manualSec?}]
  units-timestamps.json     # 出力: [{id, whisperSec, manualSec, fallbackT, t, source, approx, score}]
```

記事(.astro)は `units-timestamps.json` を import し、`t` と `approx`(=source!=="manual")を
各 `<LearningUnit t={...} tApprox={...}>` に渡す。manualSec を焼いて build すれば即反映される。
