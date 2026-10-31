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

# コラム・スラング: AdSense審査通過後に戻すもの

コラムとスラングから、危険な表現を外した（2026-10-31）。元の全文は次の場所にある。すべて変更前の丸ごとのコピー。

| 退避先 | 戻し先 | 内容 |
|---|---|---|
| `agent/post-adsense/columns/*.astro` | `src/pages/columns/` | 書き換えたコラム9本 |
| `agent/post-adsense/slang-pages/*.json` | `src/data/slang-pages/` | 書き換えた語ページ＋一時非公開の3本（crack / fiend / trees） |
| `agent/post-adsense/data/slang.ts` | `src/data/slang.ts` | 外した32語と書き換えた説明文 |
| `agent/post-adsense/data/columns.ts` | `src/data/columns.ts` | クラック・コラムの題と説明（`relatedSongs` は上の `site-data.patch` 側で戻す） |
| `agent/post-adsense/data/slang-tags-overrides.json` | `agent/slang-tags-overrides.json` | joint / raw / rock / herb の隠れ意味タグ |

## 復元手順
1. 上の表のとおり退避先を戻し先へコピーする。退避後に戻し先を別の理由で直している場合は、丸ごと上書きせず `git diff --no-index` で見て手で戻す。
2. `node agent/src/gen-slang-meta.mjs` で `src/data/slang-meta.json` を作り直す（`agent/post-adsense/data/slang-meta.json` は確認用）。
3. `node agent/src/check-slang-all.mjs` を全✅にしてから、`npm run build` と `node agent/src/check-internal-links.mjs` を通す。
4. `check-adsense-safe.mjs` は審査通過後は使わない。
