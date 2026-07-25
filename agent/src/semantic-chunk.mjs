#!/usr/bin/env node
/**
 * semantic-chunk.mjs
 * 歌詞行を「意味のまとまり」で断片化し、断片ごとに読んで意味が通る日本語（訳し下し）を付ける。
 *
 * 従来 align-and-chunk.mjs は英語をカンマ近傍で機械的に2〜3等分し、日本語を「文字数比」で
 * 切っていたため、英語断片と日本語断片の対応が崩れていた。ここでは
 *   ・切れ目 = 意味 + 実発声の「間」(fa_words_lines.json)
 *   ・日本語 = 比率分割ではなく、断片順に読める訳へモデルが組み替える
 * とし、機械ガード（英語断片の連結が原文と完全一致＝ハルシネーション0）で品質を担保する。
 * 時刻は補間せず強制アライメントの語秒からそのまま確定する。
 *
 * Usage:
 *   node agent/src/semantic-chunk.mjs prepare --slug <slug>   # seg-job.json / seg-prompt.txt を作る
 *   node agent/src/semantic-chunk.mjs apply   --slug <slug>   # seg-out.jsonl を検証して full-cues.json 化
 *   node agent/src/semantic-chunk.mjs run     --slug <slug>   # prepare → claude CLI → apply（自動）
 *     [--batch 20] [--model opus] [--apply] [--min-words 2] [--max-segs 3]
 *
 * 前提: agent/{slug}/assets/full-lines.json と fa_words_lines.json
 *       （fa_words_lines は node agent/src/fa-align.mjs --slug <slug> --source lines）
 * 歌詞テキストはstdoutに出さない。
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { assetsOf, readJson, faTokens, dispWords, backupCues, scoreWords } from "./fa-lib.mjs";

const argv = process.argv.slice(2);
const cmd = ["prepare", "apply", "run"].includes(argv[0]) ? argv[0] : "run";
const getArg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);
const slug = getArg("slug");
if (!slug) { console.error("Usage: node agent/src/semantic-chunk.mjs [prepare|apply|run] --slug <slug>"); process.exit(1); }

const BATCH = parseInt(getArg("batch", "20"), 10);
const MODEL = getArg("model", "opus");
const MIN_WORDS = parseInt(getArg("min-words", "2"), 10);
const MAX_SEGS = parseInt(getArg("max-segs", "3"), 10);
const GAP_TH = parseFloat(getArg("gap", "0.28"));
const LEAD = parseFloat(getArg("lead", "0.06"));
const HOLD = parseFloat(getArg("hold", "1.2"));
const MIN_SHOW = parseFloat(getArg("min-show", "0.5"));   // これ未満しか表示されない断片は割り戻す

const A = assetsOf(slug);
const p = (n) => path.join(A, n);
const need = (n) => { if (!fs.existsSync(p(n))) { console.error(`[semantic-chunk] agent/${slug}/assets/${n} が無い`); process.exit(2); } };

/* ---------------- prepare ---------------- */
function prepare() {
  need("full-lines.json");
  const lines = readJson(p("full-lines.json"));
  const hasFa = fs.existsSync(p("fa_words_lines.json"));
  const FW = hasFa ? readJson(p("fa_words_lines.json")) : null;
  if (FW && FW.length !== lines.length) { console.error(`[semantic-chunk] fa_words_lines(${FW.length}) と lines(${lines.length}) の件数不一致 → fa-align --source lines を再実行`); process.exit(3); }

  const job = lines.map((L, i) => {
    const toks = faTokens(L.eng);
    const wl = FW ? FW[i] : null;
    const gaps = [];
    if (wl && wl.length === toks.length) {
      for (let k = 1; k < wl.length; k++) {
        const g = wl[k].s - wl[k - 1].e;
        if (g > GAP_TH) gaps.push({ after: k - 1, sec: Math.round(g * 100) / 100 });
      }
    }
    return { i, section: L.section || "", en: L.eng, ja: L.jpn || "", words: toks.length, gaps };
  });
  fs.writeFileSync(p("seg-job.json"), JSON.stringify(job, null, 2));

  // 重複行（コーラス等）は1回だけモデルに投げる
  const seen = new Map();
  const uniq = [];
  for (const j of job) {
    const key = faTokens(j.en).join(" ");
    if (seen.has(key)) continue;
    seen.set(key, j.i); uniq.push(j);
  }
  fs.writeFileSync(p("seg-prompt.txt"), buildPrompt(uniq));
  console.log(`[semantic-chunk] prepare: lines ${lines.length} / ユニーク ${uniq.length} / FA語秒 ${hasFa ? "あり" : "なし(間のヒント無し)"}`);
  console.log(`  → agent/${slug}/assets/seg-job.json, seg-prompt.txt`);
  return uniq;
}

function buildPrompt(items) {
  const rules = `あなたは歌詞字幕の「表示単位」を設計する編集者です。
1行ずつ、英語を意味のまとまりで断片に切り、断片ごとに読んで意味が通る日本語を付けてください。

## 絶対規則（違反すると機械チェックで却下されます）
1. 英語断片を順に連結すると、元のenと**単語列が完全一致**すること。語の追加・削除・変更・並べ替え・綴り直しは一切禁止。切る位置を決めるだけ。
2. 断片数は 1〜${MAX_SEGS}。**割らない方が自然な行は1断片のまま**にする（無理に割らない）。
3. 各断片は原則${MIN_WORDS}語以上。1語だけの断片は呼びかけ・感嘆（Yo, Look 等）のときのみ許す。
4. 各断片に必ず空でない ja を付ける。

## 切る位置の判断
- 節・句の切れ目で切る。前置詞句・動詞句・関係詞節を途中で切らない。
- gaps は歌手が実際に「間」を空けた語位置（after=その語indexの直後・sec=無音秒）。意味が壊れないなら**優先的にそこで切る**。
- 短い行（目安7語以下）は基本1断片。

## 日本語（ここが最重要）
- **訳し下し**にする。元の ja は行全体の完成訳なので、それを文字数で切るのではなく、**英語断片の出る順に情報が出る日本語へ組み替える**（同時通訳の要領）。
- 断片1だけを読んでも日本語として成立し、断片1→2→3と続けて読むと自然につながること。体言止め・言い切り・「…」の余韻を使ってよい。
- 全断片を通して読んだときの意味は元の ja と等価に保つ（情報を落とさない・足さない）。
- 文体は元の ja に合わせる。スラングのニュアンス・粗さも保つ。
- 1断片の ja は目安6〜24文字。長すぎる訳は削る。

## 出力形式
JSONL（1行1オブジェクト・前後に説明文を書かない）:
{"i":<行番号>,"segs":[{"en":"...","ja":"..."},...],"c":<0|1>}
c は自信度。切り方や訳に迷いがある行は 0（人が確認する目印になる）。

## 入力`;
  const body = items.map((j) => JSON.stringify({ i: j.i, en: j.en, ja: j.ja, gaps: j.gaps.map((g) => `${g.after}:${g.sec}`) })).join("\n");
  return `${rules}\n${body}\n`;
}

/* ---------------- model ---------------- */
function callModel(promptText) {
  const r = spawnSync("claude", ["-p", "--model", MODEL, "--output-format", "text"], {
    input: promptText, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) {
    const msg = r.error ? r.error.code || r.error.message : `exit ${r.status}`;
    return { ok: false, err: String(msg).slice(0, 120), out: "" };
  }
  return { ok: true, out: r.stdout || "" };
}

function runModel() {
  const uniq = prepare();
  const batches = [];
  for (let i = 0; i < uniq.length; i += BATCH) batches.push(uniq.slice(i, i + BATCH));
  const outLines = [];
  for (let b = 0; b < batches.length; b++) {
    process.stdout.write(`[semantic-chunk] batch ${b + 1}/${batches.length} (${batches[b].length}行) ... `);
    const r = callModel(buildPrompt(batches[b]));
    if (!r.ok) {
      console.log(`失敗(${r.err})`);
      console.error(`[semantic-chunk] claude CLI を起動できませんでした。`);
      console.error(`  ※Claude Codeセッション内から実行するとsandboxでEPERMになります。ユーザー自身のターミナルで実行するか、`);
      console.error(`    2段階ルートを使ってください: seg-prompt.txt をモデルに渡し、結果を seg-out.jsonl に保存 → apply`);
      process.exit(4);
    }
    const got = (r.out.match(/^\s*\{.*\}\s*$/gm) || []);
    console.log(`${got.length}行`);
    outLines.push(...got);
  }
  fs.writeFileSync(p("seg-out.jsonl"), outLines.join("\n") + "\n");
  console.log(`  → agent/${slug}/assets/seg-out.jsonl (${outLines.length}行)`);
}

/* ---------------- apply ---------------- */
function apply() {
  need("full-lines.json"); need("seg-out.jsonl");
  const lines = readJson(p("full-lines.json"));
  const FW = fs.existsSync(p("fa_words_lines.json")) ? readJson(p("fa_words_lines.json")) : null;

  // モデル出力を i でひく（同一原文行は最初の採用分を使い回す＝コーラスの表示ゆれ防止）
  const raw = fs.readFileSync(p("seg-out.jsonl"), "utf8").split("\n").filter((l) => l.trim().startsWith("{"));
  const byKey = new Map();
  let parseErr = 0;
  for (const l of raw) {
    let o; try { o = JSON.parse(l); } catch { parseErr++; continue; }
    if (typeof o.i !== "number" || !Array.isArray(o.segs)) { parseErr++; continue; }
    const src = lines[o.i]; if (!src) { parseErr++; continue; }
    byKey.set(faTokens(src.eng).join(" "), o);
  }

  const stats = { lines: lines.length, split: 0, kept: 0, fallback: 0, reasons: {} };
  const fail = (r) => { stats.fallback++; stats.reasons[r] = (stats.reasons[r] || 0) + 1; };

  const cues = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const lineToks = faTokens(L.eng);
    const wl = FW && FW[i] && FW[i].length === lineToks.length ? FW[i] : null;
    const o = byKey.get(lineToks.join(" "));
    let segs = null;

    if (o && o.segs.length) {
      const s = o.segs.map((x) => ({ en: String(x.en || "").trim(), ja: String(x.ja || "").trim() }));
      const joined = s.map((x) => faTokens(x.en).join(" ")).join(" ").trim();
      if (joined !== lineToks.join(" ")) fail("en不一致");                       // G1 ハルシネーション/欠落
      else if (s.length > MAX_SEGS) fail("断片数過多");                          // G2
      else if (s.some((x) => !x.ja)) fail("ja空");                               // G4
      else if (s.length > 1 && s.some((x) => faTokens(x.en).length < 1)) fail("空断片");
      else {
        const jaLen = s.reduce((a, x) => a + x.ja.length, 0);
        const base = (L.jpn || "").length || jaLen;
        if (jaLen < base * 0.5 || jaLen > base * 2.2) fail("ja分量逸脱");        // G3 要約/膨張
        else segs = s;
      }
    } else if (o) fail("segs空");

    if (!segs) {
      if (o) { /* 上でカウント済み */ } else stats.kept++;
      segs = [{ en: L.eng, ja: L.jpn || "" }];
    } else if (segs.length > 1) stats.split++; else stats.kept++;

    // --- 時刻: FA語秒からそのまま（補間なし） ---
    let off = 0;
    for (let k = 0; k < segs.length; k++) {
      const n = faTokens(segs[k].en).length;
      const w = wl ? wl.slice(off, off + n) : null;
      off += n;
      const cue = { eng: segs[k].en, jpn: segs[k].ja, start: 0, end: 0 };
      cue._w = w && w.length ? w : [];
      cue._li = i;
      if (w && w.length) {
        cue._fa = true;
        cue.start = Math.max(0, w[0].s - LEAD);
        cue._we = w[w.length - 1].e;
        const sc = scoreWords(w);
        cue.conf = o && o.c === 0 ? Math.min(sc.conf, 0.5) : sc.conf;
        if (sc.flags.length) cue.flags = sc.flags;
        if (o && o.c === 0) cue.flags = [...(cue.flags || []), "model-unsure"];
      } else {
        cue.conf = 0; cue.flags = ["no-fa"];
      }
      cues.push(cue);
    }
  }

  // FAが無い行は前後から線形補間（最後の手段）
  const known = cues.map((c, k) => (c._fa ? k : -1)).filter((k) => k >= 0);
  if (!known.length) { console.error("[semantic-chunk] FA語秒が全く取れていない → fa-align --source lines を先に"); process.exit(5); }
  for (let k = 0; k < cues.length; k++) {
    if (cues[k]._fa) continue;
    const prev = known.filter((x) => x < k).pop(), next = known.find((x) => x > k);
    if (prev == null && next != null) cues[k].start = Math.max(0, cues[next].start - 2);
    else if (next == null) cues[k].start = cues[prev].start + 2;
    else cues[k].start = cues[prev].start + (cues[next].start - cues[prev].start) * (k - prev) / (next - prev);
  }

  cues.sort((a, b) => a.start - b.start);
  for (let k = 1; k < cues.length; k++) if (cues[k].start < cues[k - 1].start + 0.1) cues[k].start = cues[k - 1].start + 0.1;

  // MIN_SHOW 未満しか出ない断片＝読めない → 隣と併合する（同一行から割ったものを戻すのが主。
  // 別の行どうしでも、短い行が一瞬しか出ないケースは合わせて1枚にする）
  let remerged = 0;
  const wc = (c) => (c.eng || "").split(/\s+/).filter(Boolean).length;
  for (let k = cues.length - 1; k >= 1; k--) {
    const a = cues[k - 1], b = cues[k];
    if (b.start - a.start >= MIN_SHOW) continue;
    if (a._li !== b._li && wc(a) + wc(b) > 14) continue;   // 別行どうしの併合は短い組み合わせだけ
    a.eng = (a.eng + " " + b.eng).replace(/\s+/g, " ").trim();
    a.jpn = (a._li === b._li ? a.jpn + b.jpn : a.jpn + " " + b.jpn).trim();
    a._w = [...a._w, ...b._w];
    a._we = b._we ?? a._we;
    a._fa = a._fa || b._fa;
    a.conf = Math.min(a.conf ?? 1, b.conf ?? 1);
    const fl = [...(a.flags || []), ...(b.flags || []), "remerged"];
    a.flags = [...new Set(fl)];
    cues.splice(k, 1); remerged++;
  }

  for (let k = 0; k < cues.length; k++) {
    const c = cues[k];
    const hard = k + 1 < cues.length ? cues[k + 1].start - 0.03 : (c._we ?? c.start + 2) + HOLD;
    const soft = (c._we ?? c.start + 1.6) + HOLD;
    // 最低表示尺0.4秒は「次のキューに食い込まない範囲で」だけ効かせる（重なり厳禁）
    c.end = Math.round(Math.max(c.start + 0.05, Math.min(hard, Math.max(soft, c.start + 0.4))) * 100) / 100;
    c.start = Math.round(c.start * 100) / 100;
    delete c._we; delete c._fa; delete c._li;
  }
  // 新しいキュー区切りに合わせた fa_words.json（語間ギャップ表示・[FA]検証が使う）。
  // 語秒は行アライメントの切り出しなので、fa-align.mjs を回し直す必要はない。
  const faPerCue = cues.map((c) => c._w);
  for (const c of cues) delete c._w;

  const low = cues.filter((c) => (c.conf ?? 1) < 0.6).length;
  console.log(`[semantic-chunk] apply: lines ${stats.lines} → cues ${cues.length}`);
  console.log(`  分割された行 ${stats.split} / そのまま ${stats.kept} / ガード却下→行のまま ${stats.fallback}` +
    (Object.keys(stats.reasons).length ? ` (${Object.entries(stats.reasons).map(([k, v]) => `${k}:${v}`).join(", ")})` : ""));
  if (parseErr) console.log(`  JSON行スキップ ${parseErr}`);
  console.log(`  短すぎて割り戻した断片 ${remerged}`);
  console.log(`  要確認(conf<0.6) ${low} キュー`);

  if (has("apply")) {
    const bak = backupCues(slug);
    fs.writeFileSync(p("full-cues.json"), JSON.stringify(cues, null, 2));
    fs.writeFileSync(p("fa_words.json"), JSON.stringify(faPerCue));
    console.log(`  → full-cues.json を書き換え（履歴: cue-history/${bak}）＋ fa_words.json を新区切りで再生成`);
  } else {
    fs.writeFileSync(p("full-cues.new.json"), JSON.stringify(cues, null, 2));
    console.log(`  → full-cues.new.json（--apply で本体に反映）`);
  }
}

if (cmd === "prepare") prepare();
else if (cmd === "apply") apply();
else { runModel(); apply(); }
