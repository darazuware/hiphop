# サイト共通データ: AdSense審査通過後に戻すもの

曲ページに自動で出る共通データから、危険な表現を外した（2026-10-31）。曲ごとの全文版は `agent/{slug}/post-adsense/`。

## 外したもの（`site-data.patch` が差分そのもの）
- `src/data/artists.ts`: 死因の記述（銃撃・薬物）、Migos のミックステープ名、殺人件数、暴力・マリファナへの言及
- `src/data/columns.ts`: `/columns/crack-epidemic-hiphop` の `relatedSongs` を空に（曲ページの関連コラムカードに出さない）
- `src/data/songs.ts`: Work the Angles のサンプル曲名の一部（The Killing Fight）

## 復元手順
1. `git apply -R agent/post-adsense/site-data.patch`（当たらない場合はパッチを見て手で戻す）。
2. 曲ページは各 `agent/{slug}/post-adsense/README.md` の手順で戻す。
3. `node agent/src/check-adsense-safe.mjs` は審査通過後は使わない。
