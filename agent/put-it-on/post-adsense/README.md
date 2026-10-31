# put-it-on: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `put-it-on.full.astro.txt`（.astro全文・26unit）と `units.full.json`。今は13unit。

## 外したもの（2026-10-31）
### unit
- `head-flown`: you better flee — 曲の口火を切る脅し文句
- `crack-virgins`: if crack never came out — クラック時代を映すブラックジョーク
- `boom-pow`: boom-boom / pow-pow — 銃声を写すオノマトペ
- `hottie-open`: have a hottie open — 「open」が表す骨抜き状態
- `toni-braxton`: Toni Braxton look like Whoopi — 実名で殴る対比パンチライン
- `thirty-five-bodies`: thirty-five bodies — 「bodies」がカウントするもの
- `gas-shotty`: gas a hottie / blast a shotty — 内部韻で畳みかけるVerse 2
- `major-chubby`: gwan dead / fi joke — ジャマイカ・パトワ語の乱入
- `gat-arm-reach`: keep a gat in my arm reach — 「gat」という古い拳銃スラング
- `charm-geeks`: charm freaks and bomb geeks — freaks / geeks の韻と対比
- `born-dead`: smash mics like cornbread / born dead — オキシモロンのパンチライン
- `peel-wigs`: ill kids and real nigs who peel wigs — Verse 3の凄み
- `sheriff-reggie`: new sheriff in town, and it ain't Reggie Hammond — 映画で刺す一行

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `put-it-on.full.astro.txt` を `src/pages/songs/put-it-on.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/put-it-on/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug put-it-on`。
3. `node agent/src/check-article.mjs put-it-on` 全✅を確認。
