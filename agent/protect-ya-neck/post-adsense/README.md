# protect-ya-neck: AdSense審査通過後に戻すもの

審査が終わるまで、銃・殺害・血・薬物・差別語・露骨な暴力の表現は載せない方針（2026-10-19運営者指示／2026-10-31適用）。
全文版は `protect-ya-neck.full.astro.txt`（.astro全文・25unit）と `units.full.json`。今は18unit。

## 外したもの（2026-10-31）
### unit
- `rae-schwarzenegger`: Rhymes rugged and built like Schwarzenegger — 固有名詞を使った直喩
- `rae-clip`: clip — 弾倉から来た銃のスラング
- `meth-gat`: gat — 拳銃を指す古いスラング
- `meth-pcp`: PCP / dustin' — angel dust の隠語
- `odb-nurse-pins`: stickin' pins ... like a nurse — 看護師を引く直喩
- `ghost-escobar`: who I are is livin' the life of Pablo Escobar — AAVEの語順と引用
- `gza-labels`: too slammin' for these cold killer labels — 音楽業界を斬る

### 本文
- 上記以外の解説・導入・キーワード早見表・description/highlights から、該当語への言及を削除または言い換え（正確な差分は full 版との diff で確認）。
- DiveCards の /columns/crack-epidemic-hiphop への誘導を削除

## 残してよいもの（今回の別ルール対応）
- 和訳を字幕ショートに揃えた箇所がある場合は、full 版へ戻した後も揃え直す（`check-article` の [SYN]）。
- 元ネタ動画を #behind 内へ移動した（`<SampleYoutube>`・`sampleInContent`）。full 版に戻すと元に戻るので再適用する（[SMP]）。

## 復元手順
1. `protect-ya-neck.full.astro.txt` を `src/pages/songs/protect-ya-neck.astro` へ戻す（その後の文体修正・上記の別ルール対応があれば差分マージ）。
2. `units.full.json` を `agent/protect-ya-neck/assets/units.json` へ戻し、`node agent/src/gen-fallback-timestamps.mjs --slug protect-ya-neck`。
3. `node agent/src/check-article.mjs protect-ya-neck` 全✅を確認。
