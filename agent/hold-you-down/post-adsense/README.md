# hold-you-down: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `hold-you-down.full.astro.txt`（.astro全文・28unit）と `units.full.json`。今は15unit。

## 外したもの（2026-10-31）
### unit
- `menace-o-dog`: similar to a Menace / O-Dog sniffing 'caine — 映画キャラでストリートを語る
- `sentenced-to-box`: sentenced to life, stressed in the box — 刑務所スラング「box」
- `nobody-but-me`: Nobody but me, I got a whole gang of niggas — 逆説的な孤立宣言
- `cooks-the-pot`: how we cooks the pot up — ドラッグ調理の隠語が制作論に転じる瞬間
- `war-for-4-4`: For all my niggas I war for / Blow the 4-4 for — Illa Gheeの絶対忠誠
- `lay-a-nigga-down`: For you, I'll lay a nigga down — 「lay down」の物騒な転用
- `cock-my-shit`: I cock my shit and hold you down — 動詞としての「cock」
- `mobb-thugs-paper`: Mobb Thugs, drops and trucks / enough paper to front — 富と武装の誇示
- `finna-get-wigged`: finna get wigged — 「もうすぐ」を表すAAVEの時制マーカー
- `quarter-mill-chain`: chain cost a quarter mill / gun shopping — braggadocioの算術
- `wilding-double-neg`: won't never stop / they say that we wilding — 二重否定とwilding
- `fullies-in-the-coupe`: front street / fullies in the coupe — 「隠れない宣言」と武装語彙
- `take-bullets-die`: I take bullets and die to hold you down — Verse 4の締め

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。
- DiveCards の /columns/crack-epidemic-hiphop への誘導を削除

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `hold-you-down.full.astro.txt` を `src/pages/songs/hold-you-down.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/hold-you-down/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug hold-you-down`。
3. `node agent/src/check-article.mjs hold-you-down` 全✅を確認。
