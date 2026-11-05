# 動いているリマインド・定期タスク（2026-10-22時点）

忘れたら Claude に「リマインド、何が残ってる？」と聞けば最新の一覧が出る。通知は Telegram に届く（`node agent/src/notify-telegram.mjs "文"`）。タスクはアプリが開いているときに実行され、閉じていれば次回起動時に実行される。

## 1回限り
| 日時 | 内容 |
|---|---|
| 2026-10-27 09:00 | waxthink SEOの確認（順位・宿題の提示）。Telegram通知つき |
| 2026-11-02 10:00 | AdSense再申請の判断（GSC登録数とGA4流入を見る） |
| 2026-11-16 10:00 | AdSense審査結果の確認と、危険表現（Slam Harder 等）の復元 |

## 毎週
| 曜日・時刻 | 内容 |
|---|---|
| 月曜 09:30 | waxthink 検索順位レポート（Search Console実測・前回比・Telegram通知） |

## 毎日
| 時刻 | 内容 |
|---|---|
| 06:08 | トップのランキング更新（GSCのクリック数ベース） |
| 09:05 | waxthink 訪問数レポート |
| 09:10 | rugbypick 404監視 |
| 09:12 | 第63回全国大学選手権の記事反映 |

## 宿題（作業の続き）
- 現代スラング第2弾（finna, スラングの woke, no cap, drip）: 現代ラッパー（Travis Scott・Cardi B・Megan Thee Stallion）の歌詞をコーパスに足してから。Drake は除外。
- 順位の実測（Search Console）。
- 語ページの追加・編集は `node agent/src/check-slang-all.mjs` を全✅にしてから。詳細は docs/slang-fact-guard.md。
