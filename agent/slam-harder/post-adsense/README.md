# Slam Harder: AdSense審査通過後に戻すもの

審査が終わるまで、銃・暴力・薬物・差別語などの危険な表現は載せない方針（2026-10-19、運営者指示）。
審査通過後に、次を復元する。

1. gully-hungriest unit（page-spec.json の id）を `gully-hungriest-full.json` の内容に差し替える。
   - 2行（grimiest/Gullyest と bloodiest/hungriest）を eng に全部載せ、jpn も2行ぶん。
   - 差し替え後は `gen-learning-page.mjs` → `gen-fallback-timestamps.mjs` → `set-manual-timestamp.mjs`（152系の既存manualは units.json に残る）→ `check-article.mjs`。
2. 取り除いたもの: なし（他の項目は審査前の方針と矛盾しない範囲で残してある）。

頭出しの確定値は units.json の manualSec を参照（unit id: gully-hungriest は概算 142秒）。

## 2026-10-19 追加で外したもの（審査中のみ）
- unit `pop-bottles-of-bub`（pop shots と pop bottles の言葉遊び）
- unit `do-a-bid`（刑期をつとめる）
- unit `voice-of-the-ghetto` の fiend（薬物依存の人）の段落
- 上記の全文は `removed-units.json`。復元するときは page-spec.json の units に、元の位置（hustle-settle の前／voice-of-the-ghetto の前）へ戻し、keywords（bub'、do a bid）・description・highlights・summary の言及も戻す。

## 2026-10-19 Amazonリンクを7件から3件に絞った（審査中のみ）
- 残した: Welcome Back（原曲）/ Bacdafucup / Bacdafucup: Part II
- 外した4件は `amazon-links-removed.txt`。審査通過後に page-spec.json の extraFrontmatter（slamAlbums）へ戻す。
