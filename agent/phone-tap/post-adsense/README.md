# phone-tap: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `phone-tap.full.astro.txt`（.astro全文・21unit）と `units.full.json`。今は13unit。

## 外したもの（2026-10-31）
### unit
- `them-those`: them thoughts, them hoes — AAVEの指示詞 them（＝those）
- `trees-wet`: Trees got me wet — 「木」が「大麻」になる隠語の論理
- `lit-dutchie`: lit a Dutchie — ブランド名がそのままスラングになる転用の典型
- `foul-cats`: same foul cats who tried to bust me — foul（卑劣な）と bust（撃つ）
- `alone-with-gats`: Alone with gats, left with a vest — 武装と孤立を語る語彙
- `dynasty-cold-war`: dynasty / cold war — 帝国の語彙でストリートを語る
- `decoy-pictures`: two decoy bitches with pictures — decoy（おとり）で情報を探る
- `fuck-with-police`: them hoes fuck with police — 「つるむ・関わる」の fuck with

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。
- DiveCards の /columns/crack-epidemic-hiphop への誘導を削除

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。

## 復元手順
1. `phone-tap.full.astro.txt` を `src/pages/songs/phone-tap.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/phone-tap/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug phone-tap`。
3. `node agent/src/check-article.mjs phone-tap` 全✅を確認。
