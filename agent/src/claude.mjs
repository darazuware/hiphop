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

const HIPHOP_CWD = '/Users/ktamatzmoto/Desktop/hiphop';
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
1. 着手前に必ず CLAUDE.md と docs/fact-check-rules.md を Read tool で読む。
2. **リサーチは Gemini を使わない方針。WebSearch tool を使って自分で一次ソースから事実を集める。** producer / sample / year / album / 客演（feat.）/ チャート順位 / 曲の実在性に関する事実主張は、すべて一次ソースで裏取りすること。
   - 優先順位: サンプルは **WhoSampled** を最優先、次いで Wikipedia / Discogs / Genius。年・アルバム・客演は **Wikipedia + Discogs** で確認。
   - JSONの research フィールドに値が入っている場合（Gist経由など）も**無検証で信じず**、必ず上記一次ソースで裏取りしてから採用する。空なら全項目を WebSearch で集める。
3. research と一次資料が食い違う場合は**必ず一次資料を優先**する。確証が取れない事実は**断定せず、記載しない**（推測で書かない）。
   - 過去に bodega / road / poison 等の捏造サンプルが「fact-check欠如」で生まれた。同じ轍を踏まないこと。
4. docs/article-tone.md を Read し、運営者本人の声で書く。要点: ですます基調＋常体スパイスの中間トーン／評論家ヅラ厳禁（特に「〜の核だ」「通奏低音」「言語の経済性」等の価値づけ断定を散文で使わない）／結論先出しの三段論法を段落の型にしない／情報に粗密をつけ事務的事実は1文で流す／感想は前のめりで対象に寄せる／話題転換や引用前後で改行／定型句の使い回し禁止・導入見出しの個別化・時系列順・専門用語ツールチップ・地元固有名詞化（詳細は article-tone.md 末尾）。
   - **【ストーリー導入・書き出し禁止パターン】**: ストーリー導入部や各セクション冒頭の一文目は、**必ずその曲固有の事実（アーティスト名・曲の具体的な情景・地名・年・事件・サンプル元など）から書き起こす**こと。曲に依存しない汎用フレーズ（「個々のスラングに入る前に、まず曲が何を語っているかを」「まず曲全体の空気感をつかんでおきましょう」「聴き込む前に背景を整理しておくと」等）を書き出しに使わない。導入の切り口は曲ごとに毎回変える（同じ型の一文を別の曲で再利用しない）。
   - **【評論家口調・禁止語（厳守）】** 次の語・言い回しを散文で使わない: 「圧巻」「秀逸」「見事（〜としか言いようがない 等）」「通奏低音」「言語の経済性」「リリシズムの核」「〜にほかならない／に他ならない」「〜の先駆けとして」「〜として位置づけられる／位置付けられる」「〜スタイルを確立」「〜の核だ／〜の核心だ」「多層的に読める」。作品を審査員的に上から裁定せず、〈発見を読者と共有する〉〈一人称の感想〉に置き換える（例:「これを知ってから聴くと、また聞こえ方が変わる」「初めて元ネタを聴いたとき妙に納得した」「何度聴いても唸る」）。**pre-push の評論家口調ガード（pre-push-check.mjs Item7）が「見事」以外を検出してブロックする**ので混入させないこと（「見事」は語義注釈・和訳では可だが、自分の散文で作品を褒める用法では使わない）。

## 実行手順
1. 上記JSONファイルを読み込む（researchは上記ステップ0で裏取りした事実のみを根拠とする）
2. ファイル名は必ず src/pages/songs/${slug}.astro（上記slugをそのまま使うこと・変更禁止）
   - **雛形は cream.astro。必ず src/pages/songs/cream.astro を Read して構造を踏襲する。**
   - **learning型で作る。歌詞全行は載せない。** src/components/LearningUnit.astro を使い、「学ぶ表現」単位（スラング・韻・言葉遊び・AAVE文法）で解説する。
   - 各 LearningUnit: 見出し（学ぶ表現）＋ MC担当 ＋ 秒数頭出しリンク ＋ 日本語の位置案内 ＋ **2行程度の英語引用断片（eng）** ＋ 和訳（jpn）＋ 語法・文化背景の独自解説。
   - 引用は**用例の断片のみ**（その表現を含む行/対句だけ）。**eng引用率 < 60%**（全行掲載にしない）。
   - **歌詞引用の要否・分量は docs/fact-check-rules.md の引用ルールに必ず従う。** スラングの種別によって引用の要否を判断し（引用が要る語／簡易解説で足りる語を切り分ける）、同ルールに定める引用量の上限を厳守する。疑わしきは引用を縮小する。
   - **LearningUnit は曲の冒頭から終盤まで満遍なく配置する。** 序盤・中盤に偏らせず、各バース／セクションから最低1つ拾い、**曲尺の最後の4分の1（終盤）に必ず1つ以上**ユニットを置く（fallbackT の秒数分布で終盤が空かないこと）。
   - **独自解説の日本語（jpn/explanation/本文）は英語引用より分量を多くし、合計 ≥ 1200字。**
   - QuickSlangで重要スラングに注釈、文化背景・レガシーは独自解説として記述。
   - **頭出しリンク基準動画**: .astro冒頭に \`const YT = "<11桁youtubeId>";\` を必ず置く（songs.tsのyoutubeIdが無くてもこの YT を使う）。全 LearningUnit の頭出しは同じ YT を参照する。
   - **秒数の表示は固定で書かない**: 各 LearningUnit の \`t=\` は \`TS["<id>"].t\` 形式で units-timestamps.json から取る（cream.astro と同形）。冒頭に \`import tsData from '../../../agent/${slug}/assets/units-timestamps.json';\` と \`const TS = Object.fromEntries(tsData.map((u) => [u.id, { t: u.t, approx: u.approx }]));\` を置く。
2b. **agent/${slug}/assets/units.json を必ず作成する**（whisper秒数生成の入力。これが無いと頭出し秒数が出ず、import先のjson不在でビルドが落ちる）。
   - 形式: \`[{ "id": "<英数ハイフンの一意id>", "anchor": ["lowercase","words","from","the","quoted","line"], "fallbackT": <概算秒・整数>, "manualSec": null }]\`
   - id は各 LearningUnit と1対1（.astro の \`TS["<id>"]\` と一致させる）。
   - anchor: そのユニットが扱う引用行の連続する数語を小文字・記号無しで（whisperが拾える固有性の高い語を選ぶ）。
   - fallbackT: その箇所のおおよその秒数（whisperが外した時の保険）。manualSec は必ず null（運営者が後で実測上書き）。
   - 秒数自体（whisperSec/t）は書かない。秒数は後段の whisper パイプラインが units-timestamps.json に自動生成する。
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
export async function runFreeform(instruction) {
  const ts = Date.now();
  const promptFile = `/tmp/hiphop-prompt-${ts}.txt`;
  const triggerFile = `/tmp/hiphop-trigger-${ts}.txt`;
  const doneFile = `/tmp/hiphop-done-${ts}.txt`;

  const prompt = `あなたは WAX&THINK（Astro製のhiphop解説サイト。リポジトリ直下 ${HIPHOP_CWD} で作業）の運営補助です。次の依頼を、承認を求めず全自動で最後までやり切ってください。

## 依頼
${instruction}

## ルール
- 着手前に必要に応じて CLAUDE.md と docs/ のルールを Read する。新規の曲ページを作る依頼なら learning型（雛形 src/pages/songs/cream.astro）で作る。
- **【評論家口調・禁止語（厳守）】** 記事・コラムの日本語散文を書く／書き直す場合、次の語・言い回しを使わない: 「圧巻」「秀逸」「見事」「通奏低音」「言語の経済性」「リリシズムの核」「〜にほかならない／に他ならない」「〜の先駆けとして」「〜として位置づけられる／位置付けられる」「〜スタイルを確立」「〜の核だ／〜の核心だ」「多層的に読める」。審査員的に上から裁定せず、発見の共有・一人称の感想に置き換える。pre-push の評論家口調ガードがブロックする。
- 変更を加えたら必ず \`npm run build\` を実行し、ビルドが通ることを確認する。
- 自分が変更・作成したファイルだけを \`git add <ファイルパス>\`（複数可・明示列挙）→ \`git commit\` → \`git push origin main\` する。**\`git add .\` および \`git add -A\` は絶対に使わない**（ユーザーのローカル作業と競合するため）。
- 調査だけ／変更が無い依頼なら commit・push はしない。
- 歌詞の英語行などセンシティブな本文はレスポンスに出力しない。
- 最後に必ず、実施結果を日本語1行で要約して \`SUMMARY: <要約>\` の形式で出力する（この1行だけが Telegram に通知される。歌詞は含めない）。`;

  await writeFile(promptFile, prompt, 'utf-8');

  // watcherが動いていなければTerminalで自動起動
  await ensureWatcher();

  // triggerにfreeformモードを指定（watcherが記事後処理をスキップする）
  await writeFile(triggerFile, JSON.stringify({ promptFile, mode: 'freeform' }), 'utf-8');
  console.log('  [Claude] 自由指示を watcher に委譲...');

  const result = await waitForDone(doneFile);
  return {
    success: result.exitCode === 0,
    output: result.summary || '',
    error: result.error || (result.exitCode === 0 ? null : `exit ${result.exitCode}`),
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
