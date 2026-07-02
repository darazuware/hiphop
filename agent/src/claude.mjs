/**
 * Claude Code CLI 連携モジュール
 *
 * LaunchAgentからはClaude CLIのOAuth認証に届かないため、
 * trigger/doneファイル方式でTerminalのwatcherに処理を委譲する。
 *
 * フロー:
 *   claude.mjs → /tmp/hiphop-trigger-{ts}.txt 書く
 *   watcher.mjs(Terminal) → 検知 → claude CLI実行 → /tmp/hiphop-done-{ts}.txt 書く
 *   claude.mjs → done読んで結果返す
 */

import { readFile, writeFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { execSync, spawn } from 'node:child_process';

// review運用（2026-07-02〜）: 実作業は常設worktree hiphop-review（reviewブランチ）で行う。
const HIPHOP_CWD = '/Users/ktamatzmoto/Desktop/hiphop-review';
const WATCHER_SCRIPT = '/Users/ktamatzmoto/Desktop/hiphop/agent/src/watcher.mjs';
const TIMEOUT_MS = 45 * 60 * 1000; // 45分（3曲並列でもwatcher処理が終わるまで待てる）

function isWatcherRunning() {
  try {
    const result = execSync('pgrep -f "watcher.mjs"', { encoding: 'utf-8' });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

async function ensureWatcher() {
  if (isWatcherRunning()) return;
  console.log('  [Claude] watcherが停止中 → 直接起動中...');
  const child = spawn('node', [WATCHER_SCRIPT], {
    cwd: HIPHOP_CWD,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  // 起動確認（最大10秒ポーリング）
  for (let i = 0; i < 10; i++) {
    await sleep(1000);
    if (isWatcherRunning()) {
      console.log('  [Claude] watcher起動完了');
      return;
    }
  }
  console.warn('  [Claude] watcher起動確認できず（続行）');
}

/**
 * @param {string} jsonPath
 * @returns {Promise<{ success: boolean, output: string, error: string|null }>}
 */
export async function runClaude(jsonPath) {
  const ts = Date.now();
  const promptFile = `/tmp/hiphop-prompt-${ts}.txt`;
  const triggerFile = `/tmp/hiphop-trigger-${ts}.txt`;
  const doneFile = `/tmp/hiphop-done-${ts}.txt`;

  // JSON を読んでプロンプト生成
  let slug = '';
  let songMeta = '';
  try {
    const d = JSON.parse(await readFile(jsonPath, 'utf-8'));
    slug = d.slug || d.title.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');
    songMeta = `曲: ${d.artist} - ${d.title} (${d.year || '年不明'})
slug（必ずこの値を使うこと）: ${slug}
ASIN（songs.tsに設定すること）: ${d.asin || 'null'}
ジャケット画像: ${d.imagePath || ''}
GeniusURL: ${d.geniusUrl || ''}`;
  } catch (e) {}

  const prompt = `以下の楽曲データをもとに、**learning型（学習解説主体）**の記事を作成してください。承認を求めずに全自動で完遂すること。

## 楽曲情報
${songMeta}

## データファイル
${jsonPath}
（このファイルにGenius歌詞・メタデータが入っています。最初にRead toolで必ず読み込んでください。**research フィールドは原則 空** ＝ リサーチは下記ステップ0で自分で WebSearch して集めること）

## 【ステップ0・最重要】事実チェック（着手前に必ず実行）
1. 着手前に必ず CLAUDE.md と docs/fact-check-rules.md と docs/column-split-rules.md を Read tool で読む（column-split-rules は後述ステップ2cの振り分け判定の根拠）。
2. **リサーチは Gemini を使わない方針。WebSearch tool を使って自分で一次ソースから事実を集める。** producer / sample / year / album / 客演（feat.）/ チャート順位 / 曲の実在性に関する事実主張は、すべて一次ソースで裏取りすること。
   - 優先順位: サンプルは **WhoSampled** を最優先、次いで Wikipedia / Discogs / Genius。年・アルバム・客演は **Wikipedia + Discogs** で確認。
   - JSONの research フィールドに値が入っている場合（Gist経由など）も**無検証で信じず**、必ず上記一次ソースで裏取りしてから採用する。空なら全項目を WebSearch で集める。
3. research と一次資料が食い違う場合は**必ず一次資料を優先**する。確証が取れない事実は**断定せず、記載しない**（推測で書かない）。
   - 過去に bodega / road / poison 等の捏造サンプルが「fact-check欠如」で生まれた。同じ轍を踏まないこと。
4. docs/article-tone.md を Read し、運営者本人の声で書く。要点: ですます基調＋常体スパイスの中間トーン／評論家ヅラ厳禁（特に「〜の核だ」「通奏低音」「言語の経済性」等の価値づけ断定を散文で使わない）／結論先出しの三段論法を段落の型にしない／情報に粗密をつけ事務的事実は1文で流す／感想は前のめりで対象に寄せる／話題転換や引用前後で改行／定型句の使い回し禁止・導入見出しの個別化・時系列順・専門用語ツールチップ・地元固有名詞化（詳細は article-tone.md 末尾）。
   - **【ストーリー導入・書き出し禁止パターン】**: ストーリー導入部や各セクション冒頭の一文目は、**必ずその曲固有の事実（アーティスト名・曲の具体的な情景・地名・年・事件・サンプル元など）から書き起こす**こと。曲に依存しない汎用フレーズ（「個々のスラングに入る前に、まず曲が何を語っているかを」「まず曲全体の空気感をつかんでおきましょう」「聴き込む前に背景を整理しておくと」等）を書き出しに使わない。導入の切り口は曲ごとに毎回変える（同じ型の一文を別の曲で再利用しない）。
   - **【評論家口調・禁止語（厳守）】** 次の語・言い回しを散文で使わない: 「圧巻」「秀逸」「見事（〜としか言いようがない 等）」「通奏低音」「言語の経済性」「リリシズムの核」「〜にほかならない／に他ならない」「〜の先駆けとして」「〜として位置づけられる／位置付けられる」「〜スタイルを確立」「〜の核だ／〜の核心だ」「多層的に読める」。作品を審査員的に上から裁定せず、〈発見を読者と共有する〉〈一人称の感想〉に置き換える（例:「これを知ってから聴くと、また聞こえ方が変わる」「初めて元ネタを聴いたとき妙に納得した」「何度聴いても唸る」）。**pre-push の評論家口調ガード（pre-push-check.mjs Item7）が「見事」以外を検出してブロックする**ので混入させないこと（「見事」は語義注釈・和訳では可だが、自分の散文で作品を褒める用法では使わない）。
   - **【AI臭の禁止（厳守・ガードがブロック）】** ①ダッシュ（em \`—\`／en \`–\`）で語句を挟む・補足する型を**日本語解説で一切使わない**（AI臭の最大tell）。言い換え・補足は読点「、」か丸括弧（）か改行で書く。②次のAI常套句を使わない:「まさに」「いわば」「〜と言えるだろう／と言えよう」「〜ではないだろうか」「〜なのである」「〜と言っても過言ではない」「唯一無二」「色褪せない」「金字塔」「不朽の名作」「真骨頂」「〜を体現」「〜に昇華」「〜の極北」。③**体言止めの断定（「〜だ。」で作品を上から品評する型）を多用しない**。基調はですます、断定は「〜なんです／と思います／なんですよね」で受ける（体言止めは短い余韻として時々だけ）。

## 実行手順
1. 上記JSONファイルを読み込む（researchは上記ステップ0で裏取りした事実のみを根拠とする）
2. ファイル名は必ず src/pages/songs/${slug}.astro（上記slugをそのまま使うこと・変更禁止）
   - **雛形（完全模範）は nas-is-like.astro。必ず src/pages/songs/nas-is-like.astro を Read して構造・文体・改行構造を踏襲する**（2026-07-03一本化。見出し文言は曲ごとに固有で書く。cream.astroは模範外）。
   - **learning型で作る。歌詞全行は載せない。** src/components/LearningUnit.astro を使い、「学ぶ表現」単位（スラング・韻・言葉遊び・AAVE文法）で解説する。
   - 各 LearningUnit: 見出し（学ぶ表現）＋ MC担当 ＋ 秒数頭出しリンク ＋ 日本語の位置案内 ＋ **2行程度の英語引用断片（eng）** ＋ 和訳（jpn）＋ 語法・文化背景の独自解説。
   - 引用は**用例の断片のみ**（その表現を含む行/対句だけ）。**eng引用率 < 60%**（全行掲載にしない）。
   - **歌詞引用の要否・分量は docs/fact-check-rules.md の引用ルールに必ず従う。** スラングの種別によって引用の要否を判断し（引用が要る語／簡易解説で足りる語を切り分ける）、同ルールに定める引用量の上限を厳守する。疑わしきは引用を縮小する。
   - **【[D]予算運用】** unitを数個書くごとに \`node agent/src/check-lyrics-coverage.mjs ${slug}\` を回し、[D]が57%を超えたら以降のunitは「引用不要スラング方式」（eng/jpnスロット無し・見出しに表現＋本文で位置と語解説＋▶頭出しで完結）に切り替える。コーラス等3回以上反復する行は[D]母数外なので引用自由。usage（語法）スロット内の英語も[D]に算入される。詳細は docs/fact-check-rules.md「引用予算の運用」。
   - **LearningUnit は曲の冒頭から終盤まで満遍なく配置する。** 序盤・中盤に偏らせず、各バース／セクションから最低1つ拾い、**曲尺の最後の4分の1（終盤）に必ず1つ以上**ユニットを置く（fallbackT の秒数分布で終盤が空かないこと）。
   - **独自解説の日本語（jpn/explanation/本文）は英語引用より分量を多くし、合計 ≥ 1200字。**
   - QuickSlangで重要スラングに注釈、文化背景・レガシーは独自解説として記述。
   - **頭出しリンク基準動画**: .astro冒頭に \`const YT = "<11桁youtubeId>";\` を必ず置く（songs.tsのyoutubeIdが無くてもこの YT を使う）。全 LearningUnit の頭出しは同じ YT を参照する。
   - **秒数の表示は固定で書かない**: 各 LearningUnit の \`t=\` は \`TS["<id>"].t\` 形式で units-timestamps.json から取る（nas-is-like.astro と同形）。冒頭に \`import tsData from '../../../agent/${slug}/assets/units-timestamps.json';\` と \`const TS = Object.fromEntries(tsData.map((u) => [u.id, { t: u.t, approx: u.approx }]));\` を置く。
2b. **agent/${slug}/assets/units.json を必ず作成する**（頭出し秒数生成の入力。これが無いと頭出し秒数が出ず、import先のjson不在でビルドが落ちる）。
   - 形式: \`[{ "id": "<英数ハイフンの一意id>", "anchor": ["lowercase","words","from","the","quoted","line"], "fallbackT": <概算秒・整数>, "manualSec": null }]\`
   - **曲の時系列順に並べる**（.astroのユニット順とも一致させる。フック説明を先頭に置く場合を除く）。
   - id は各 LearningUnit と1対1（.astro の \`TS["<id>"]\` と一致させる）。
   - anchor: そのユニットが扱う行の連続する数語を小文字・記号無しで（将来の音声アライメント用に残す）。
   - fallbackT: その箇所のおおよその秒数。**Verse頭の位置から「1行≈2.5〜3秒」の線形補間で概算**すればよい。manualSec は必ず null（運営者が後で実測上書き）。
   - **whisper・音源DL等のAI音源解析は使わない（2026-07-03確定）。** 秒数は後段の \`gen-fallback-timestamps.mjs\` が fallbackT から units-timestamps.json に決定的に生成する。正確な秒数は運営者がプレビュー実測で指示し \`set-manual-timestamp.mjs\` で焼く。
2c. **【深掘りセクション（背景／制作／評価）のコラム自動振り分け — docs/column-split-rules.md の閾値で機械的に判定】**
   - 判定対象は3セクションのみ: **背景**（時代・文化）／**制作**（サンプル元・機材・プロデューサーの手法）／**評価**（チャート・受賞・後世への影響）。曲まるごとではなく**各セクションを個別に**判定する。
   - 次の3条件を **すべて満たすセクションだけ別コラム化** する: ①そのセクションの日本語解説を **600字以上** 書ける、②裏取り済みの**固有エピソードが2件以上**（固有＝その曲/アーティスト固有で一般論でない事実。例: 制作なら「消えたtouch＝機材ミス」「The Charmelsを執拗にループ」で2件）、③その固有事実がステップ0の一次ソース照合を通過済み（裏が取れない話は分量に数えない）。
   - **1つでも欠けるセクションは曲ページ内にインライン内包し、コラムを作らない。** 薄い内容を無理に別記事化しない（AdSense "Low value content" 回避）。3条件を満たすセクションが0個なら、コラムは1本も作らずすべて曲ページ内包でよい。
   - **切り出す前に必ず src/data/columns.ts を Read** し、**同テーマのコラムが既にあれば新規作成しない**（例: 背景=crack-epidemic-hiphop、時代=ny-golden-era-1994、サンプリング=dj-premier-sampling／rza-sampling-philosophy、AAVE=aave-hiphop-language）。既存でカバー済みなら、曲ページのインラインを薄くして既存コラムへ DiveCards で飛ばすだけにする（新規 .astro は作らない）。
   - 既存に無く新規に別コラム化する場合のみ:
     a) src/data/columns.ts に \`{ slug: '/columns/<新slug>', title, description, tag, relatedSongs: ['/songs/${slug}', ...] }\` を追加（未登録＝ページ生成されず内部リンク切れ）。
     b) src/pages/columns/<新slug>.astro を作成（既存の src/pages/columns/*.astro の構造を踏襲。散文は article-tone.md のトーン・上記の評論家口調禁止語を厳守。事実は一次ソース裏取り済みのみ）。
   - 別コラム化したセクション（既存流用も新規も）への**曲ページからの誘導は2箇所**: ①記事末に DiveCards.astro（\`import DiveCards from '../../components/DiveCards.astro';\` + cards に該当コラム。nas-is-like.astro 参照）、②LearningUnit群の**前**に「深掘りはコラムへ」の短い予告ブロック。
   - **DiveCards / 予告のリンク先は実在するコラムのみ**（作っていないコラムのカードは出さない＝デッドリンク厳禁）。
   - **同一/酷似の解説文を曲ページとコラムに二重掲載しない。** 別コラム化＝その散文は曲ページ側から消し、DiveCards／予告の短い誘導文に置き換える（pre-push の定型句ガードが25字以上の重複をブロックする）。

3. src/data/songs.ts にエントリ反映
   - **【既存エントリの上書き変換に注意】** slug '/songs/${slug}' が songs.ts に既にある場合は、**新しい行を追加せず、その既存行をその場で更新**する（行の重複を絶対に作らない）。era/region/producer/bpm/sample 等の事実はステップ0で裏取りした値で上書き修正する。
   - 既存行が無い場合のみ新規追記する。
   - slug: '/songs/${slug}' （固定・変更禁止）
   - **tier: "core" を必ず付ける**（未設定だとトップ/sitemap/RSSから除外され不可視になる。既存行更新時も維持）
   - asin: 上記ASINの値をそのまま設定（nullの場合はnull）
   - era/region/producer/bpmは**ステップ0で裏取りした事実**から正確に埋める
   - 文字列はダブルクォートを使う
4. src/data/artists.ts を確認し、artistSlugが未登録なら追加

※ git操作・ビルド・歌詞チェックはシステムが自動実行するため不要`;

  await writeFile(promptFile, prompt, 'utf-8');

  // watcherが動いていなければTerminalで自動起動
  await ensureWatcher();

  // triggerファイルにJSON形式でメタ情報を渡す
  await writeFile(triggerFile, JSON.stringify({ promptFile, slug, jsonPath }), 'utf-8');

  console.log(`  [Claude] watcher待機中... (slug: ${slug})`);

  // doneファイルが現れるまでポーリング
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    await sleep(5000);
    try {
      await access(doneFile);
      const raw = (await readFile(doneFile, 'utf-8')).trim();
      let result;
      try { result = JSON.parse(raw); } catch { result = { exitCode: parseInt(raw) || 1, error: null }; }
      console.log(`  [Claude] watcher完了 (exit: ${result.exitCode})`);
      return {
        success: result.exitCode === 0,
        output: '',
        error: result.error || (result.exitCode === 0 ? null : `exit ${result.exitCode}`),
      };
    } catch {
      // まだ存在しない
    }
  }

  return { success: false, output: '', error: 'タイムアウト（45分）' };
}

/**
 * doneファイルが現れるまで待ち、結果オブジェクトを返す。
 * @param {string} doneFile
 * @returns {Promise<{ exitCode: number, error: string|null, summary?: string }>}
 */
async function waitForDone(doneFile) {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    await sleep(5000);
    try {
      await access(doneFile);
      const raw = (await readFile(doneFile, 'utf-8')).trim();
      try { return JSON.parse(raw); } catch { return { exitCode: parseInt(raw) || 1, error: null }; }
    } catch {
      // まだ存在しない
    }
  }
  return { exitCode: 1, error: 'タイムアウト（45分）' };
}

/**
 * 自由指示（任意の依頼）を watcher 経由で Claude CLI に実行させる。
 * 記事生成と違い slug 後処理は行わず、Claude 自身に build/git まで行わせる。
 * （launchd からは Claude の OAuth に届かないため、Terminal の watcher に委譲する）
 * @param {string} instruction
 * @returns {Promise<{ success: boolean, output: string, error: string|null }>}
 */
export async function runFreeform(instruction, resumeId = null) {
  const ts = Date.now();
  const promptFile = `/tmp/hiphop-prompt-${ts}.txt`;
  const triggerFile = `/tmp/hiphop-trigger-${ts}.txt`;
  const doneFile = `/tmp/hiphop-done-${ts}.txt`;

  const prompt = `あなたは WAX&THINK（Astro製のhiphop解説サイト。リポジトリ直下 ${HIPHOP_CWD} で作業）の運営補助です。次の依頼を、承認を求めず全自動で最後までやり切ってください。

## 依頼
${instruction}

## ルール
- 着手前に必要に応じて CLAUDE.md と docs/ のルールを Read する。新規の曲ページを作る依頼なら learning型（完全模範＝src/pages/songs/nas-is-like.astro）で作る。
- **背景／制作／評価の深掘りを書く場合は docs/column-split-rules.md の閾値で振り分ける**: 1セクションにつき「日本語600字以上＋裏取り済みの固有エピソード2件以上＋一次ソース照合済み」の3条件をすべて満たす時のみ別コラム化（src/data/columns.ts 登録＋src/pages/columns/<slug>.astro 作成＋曲ページから DiveCards と units前予告の2箇所で誘導）。欠ければ曲ページ内包でコラムを作らない（Low value content回避）。切り出す前に必ず columns.ts を読み、同テーマの既存コラムがあれば新規作成せず既存へ誘導。曲ページとコラムで同一/酷似の解説文を二重掲載しない（切り出し＝片方から消す）。
- **【評論家口調・禁止語（厳守）】** 記事・コラムの日本語散文を書く／書き直す場合、次の語・言い回しを使わない: 「圧巻」「秀逸」「見事」「通奏低音」「言語の経済性」「リリシズムの核」「〜にほかならない／に他ならない」「〜の先駆けとして」「〜として位置づけられる／位置付けられる」「〜スタイルを確立」「〜の核だ／〜の核心だ」「多層的に読める」。審査員的に上から裁定せず、発見の共有・一人称の感想に置き換える。pre-push の評論家口調ガードがブロックする。
- **【AI臭の禁止（厳守・ガードがブロック）】** ①ダッシュ（em \`—\`／en \`–\`）で語句を挟む/補足する型を日本語解説で一切使わない（読点・丸括弧・改行で書く）。②「まさに／いわば／〜と言えるだろう／〜ではないだろうか／〜なのである／〜と言っても過言ではない／唯一無二／色褪せない／金字塔／不朽の名作／真骨頂／〜を体現／〜に昇華／〜の極北」を使わない。③体言止めで作品を上から品評する型を多用しない（ですます基調、断定は「〜なんです／と思います」で受ける）。**pre-push ガードは体言止め断定の多用と常套句をブロック**する（ダッシュは警告のみ）。
- 変更を加えたら必ず \`npm run build\` を実行し、ビルドが通ることを確認する。
- 自分が変更・作成したファイルだけを \`git add <ファイルパス>\`（複数可・明示列挙）→ \`git commit\` → \`git push origin review\` する。**\`git add .\` および \`git add -A\` は絶対に使わない**（ユーザーのローカル作業と競合するため）。
- **【厳守】\`main\` ブランチへは絶対にチェックアウト・マージ・pushしない。** あなたは常に \`review\` ブランチで作業する（作業ディレクトリ自体が review 用worktreeなので、通常は何もしなくてもreview上にいる）。本番（main）への反映はユーザーが \`/publish\` コマンドで別途行う専用フローであり、あなたはそれを代行しない。
- 調査だけ／変更が無い依頼なら commit・push はしない。
- 歌詞の英語行などセンシティブな本文はレスポンスに出力しない。
- 最後に必ず \`SUMMARY: <要約>\` の形式で実施結果を日本語で出力する（この行が Telegram に通知される。歌詞は含めない）。**「完了」「対応しました」等の中身の無い一言は禁止**。次を具体的に書く: ①何をしたか（作成/修正したページ・ファイル名や対象曲名）②結果（ビルド可否・commit/pushの有無）③あればプレビューURL（**まだ本番ではない**ことが分かる書き方で。デプロイ先はVercel、固定プレビューURLは \`https://hiphop-git-review-darazuwares-projects.vercel.app\` + パス。例: \`https://hiphop-git-review-darazuwares-projects.vercel.app/songs/dead-presidents\`）。例: \`SUMMARY: dead-presidents の記事を新規作成しビルド通過、reviewブランチへpush済み（未公開）。プレビュー: https://hiphop-git-review-darazuwares-projects.vercel.app/songs/dead-presidents\`。調査だけの依頼なら結論を1〜2文で要約する。`;

  await writeFile(promptFile, prompt, 'utf-8');

  // watcherが動いていなければTerminalで自動起動
  await ensureWatcher();

  // triggerにfreeformモードを指定（watcherが記事後処理をスキップする）
  // resumeId があれば watcher が --resume で前回の会話を継続する
  await writeFile(triggerFile, JSON.stringify({ promptFile, mode: 'freeform', resumeId }), 'utf-8');
  console.log(`  [Claude] 自由指示を watcher に委譲...${resumeId ? '（継続）' : ''}`);

  const result = await waitForDone(doneFile);
  return {
    success: result.exitCode === 0,
    output: result.summary || '',
    sessionId: result.sessionId || null,
    error: result.error || (result.exitCode === 0 ? null : `exit ${result.exitCode}`),
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
