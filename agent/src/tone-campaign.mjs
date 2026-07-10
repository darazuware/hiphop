#!/usr/bin/env node
/**
 * トーン一斉更新キャンペーンの司令塔（docs/mission-tone-campaign.md）。
 * 全曲を nas-is-like 基調＝ check-tone-only の絶対基準✅ へ揃えるバッチを、
 * 既存の「修正依頼」ルーチン（claude.mjs runToneFix・Sonnet三稿制）で1曲ずつ回す。
 *
 * Usage:
 *   node agent/src/tone-campaign.mjs status                # 監査（review worktree基準）→ pending一覧
 *   node agent/src/tone-campaign.mjs next                  # 次に回す1曲を表示
 *   node agent/src/tone-campaign.mjs run [--count N] [--scope full|tone] [--model sonnet|opus] [--dry-run]
 *
 * - 監査・修正の対象は常に review worktree（fixは review ブランチに積まれ /publish で本番反映）
 * - 完了判定は review側 check-tone-only の絶対基準✅（pre-pushのベースライン比較ではない）
 * - nas-is-like のみ reflowOnly（改行整形だけ・文言不変）で回す
 * - 実行履歴は agent/.tone-campaign-state.json（キュー自体は毎回監査から再計算＝自己修復）
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const MAIN_ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const REVIEW_ROOT = '/Users/ktamatzmoto/Desktop/hiphop-review';
const SONGS_DIR = join(REVIEW_ROOT, 'src/pages/songs');
const STATE_FILE = join(MAIN_ROOT, 'agent/.tone-campaign-state.json');
const SHOOK_UNITS = 25; // shook級の下限（learning型の増補目標）

if (!existsSync(SONGS_DIR)) {
  console.error(`❌ review worktree が見つかりません: ${SONGS_DIR}`);
  process.exit(1);
}

// 【中断根本対策・2026-07-10】Claudeサブスクの使用上限（"You've hit your session limit ·
// resets 7:30pm" 等）は環境異常でなく時間で回復する定常イベント。失敗扱いで中断せず、
// リセット時刻まで待機して同じ曲から自動再開する。
const MAX_LIMIT_WAITS = 3;                      // 1回のrunで待機する上限（超えたら本当に異常）
const LIMIT_WAIT_CAP_MS = 6 * 3600 * 1000;      // 待機の上限6時間
const LIMIT_WAIT_DEFAULT_MS = 60 * 60 * 1000;   // リセット時刻が読めない時は60分

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Claude CLIの使用上限エラーなら待機ミリ秒を返す（上限以外のエラーは null） */
function parseLimitWaitMs(error) {
  if (!error) return null;
  const s = String(error);
  if (!/(session|usage|rate)[\s_-]?limit|hit your .{0,20}limit|limit (?:will )?reset|limit reached/i.test(s)) return null;
  // 例: "resets 7:30pm (Asia/Tokyo)" / "will reset at 7pm" — Macのローカル時刻（Asia/Tokyo）で解釈
  const m = s.match(/reset[^0-9]{0,10}(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let waitMs = LIMIT_WAIT_DEFAULT_MS;
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2] || 0);
    const ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    const target = new Date();
    target.setHours(h, min, 0, 0);
    if (target.getTime() <= Date.now()) target.setTime(target.getTime() + 24 * 3600 * 1000);
    waitMs = target.getTime() - Date.now();
  }
  return Math.min(waitMs + 3 * 60 * 1000, LIMIT_WAIT_CAP_MS); // リセット直後の空振り防止に+3分
}

// プロセス間の二重起動ガード（index.mjsのフラグは自プロセス内のみで、対話セッション・
// 手動実行と並走すると同じ曲を掴んで衝突するため、lockファイルで全入口を守る）。
const LOCK_FILE = join(MAIN_ROOT, 'agent/.tone-campaign.lock');
function acquireLock() {
  try {
    const pid = Number(readFileSync(LOCK_FILE, 'utf-8').trim());
    if (pid) {
      try {
        process.kill(pid, 0); // 生存確認のみ
        console.error(`❌ 別のトーン一斉バッチが実行中です (pid ${pid}) — 二重起動を中止します`);
        process.exit(1);
      } catch { /* 死んだpidの残骸lock → 奪ってよい */ }
    }
  } catch { /* lock無し */ }
  writeFileSync(LOCK_FILE, String(process.pid), 'utf-8');
  process.on('exit', () => {
    try {
      if (readFileSync(LOCK_FILE, 'utf-8').trim() === String(process.pid)) unlinkSync(LOCK_FILE);
    } catch {}
  });
}

/** Telegram通知（best-effort。トークン未設定・送信失敗でも本処理を止めない） */
async function notifyTelegram(text) {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      const { default: dotenv } = await import('dotenv');
      dotenv.config({ path: join(MAIN_ROOT, 'agent/.env') });
    }
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
    const { sendMessage } = await import('./telegram.mjs');
    await sendMessage(text, null, { safe: true });
  } catch {}
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { history: [] };
  }
}
function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

/** review側の check-tone-only（絶対基準）を全slugに回し、slug→{pass, detail} を返す */
function auditTone(slugs) {
  const checker = join(REVIEW_ROOT, 'agent/src/check-tone-only.mjs');
  let out = '';
  try {
    out = execSync(`node ${JSON.stringify(checker)} ${slugs.join(' ')}`, {
      encoding: 'utf-8', cwd: REVIEW_ROOT, maxBuffer: 16 * 1024 * 1024,
    });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || ''); // exit1でも出力は全slug分ある
  }
  const map = new Map();
  for (const line of out.split('\n')) {
    const m = line.match(/^(✅|❌) \[TONE\] ([^:]+): (.*)$/);
    if (m) map.set(m[2], { pass: m[1] === '✅', detail: m[3] });
  }
  return map;
}

function audit() {
  const slugs = readdirSync(SONGS_DIR).filter((f) => f.endsWith('.astro')).map((f) => f.replace(/\.astro$/, ''));
  const tone = auditTone(slugs);
  const rows = slugs.map((slug) => {
    const raw = readFileSync(join(SONGS_DIR, `${slug}.astro`), 'utf-8');
    const units = (raw.match(/<LearningUnit/g) || []).length;
    const type = units > 0 ? 'learning' : 'legacy';
    const t = tone.get(slug) || { pass: false, detail: 'check-tone-only出力に見つからず' };
    return { slug, type, units, tonePass: t.pass, detail: t.detail };
  });
  // 実行順: nas-is-like（模範の改行を最初に規約準拠へ）→ learning型unit少ない順 → 従来型アルファベット順
  const pending = rows.filter((r) => !r.tonePass).sort((a, b) => {
    if (a.slug === 'nas-is-like') return -1;
    if (b.slug === 'nas-is-like') return 1;
    if (a.type !== b.type) return a.type === 'learning' ? -1 : 1;
    if (a.type === 'learning' && a.units !== b.units) return a.units - b.units;
    return a.slug.localeCompare(b.slug);
  });
  return { rows, pending };
}

function printStatus({ rows, pending }) {
  const done = rows.filter((r) => r.tonePass);
  console.log(`\n=== トーン一斉更新キャンペーン status（基準: review worktree・check-tone-only絶対✅） ===`);
  console.log(`全${rows.length}曲 / ✅完了 ${done.length} / ❌未更新 ${pending.length}\n`);
  for (const r of pending) {
    const mode = r.slug === 'nas-is-like' ? ' [reflowOnly]' : '';
    const u = r.type === 'learning' ? ` units=${r.units}${r.units < SHOOK_UNITS ? `(<${SHOOK_UNITS}・増補対象)` : ''}` : '';
    console.log(`❌ ${r.slug} (${r.type}${u})${mode}`);
    console.log(`   ${r.detail}`);
  }
  if (done.length) console.log(`\n✅ ${done.map((r) => r.slug).join(', ')}`);
  console.log(`\n次の1曲: ${pending[0]?.slug ?? 'なし（全曲完了）'}`);
  console.log(`実行: node agent/src/tone-campaign.mjs run --count 3`);
}

async function run(args) {
  const count = Number(args.find((a, i) => args[i - 1] === '--count') ?? 3);
  const scope = args.find((a, i) => args[i - 1] === '--scope') ?? 'full';
  const model = args.find((a, i) => args[i - 1] === '--model') ?? 'sonnet';
  const dryRun = args.includes('--dry-run');
  if (!['full', 'tone'].includes(scope) || !['sonnet', 'opus'].includes(model) || !Number.isInteger(count) || count < 1) {
    console.error('Usage: run [--count N] [--scope full|tone] [--model sonnet|opus] [--dry-run]');
    process.exit(1);
  }

  acquireLock();
  const { pending } = audit();
  const batch = pending.slice(0, count);
  if (batch.length === 0) {
    console.log('✅ pending 0曲 — キャンペーン完了です');
    return;
  }
  console.log(`今回のバッチ（${batch.length}曲 / 残り全${pending.length}曲, scope=${scope}, model=${model}）:`);
  for (const r of batch) console.log(`  - ${r.slug}${r.slug === 'nas-is-like' ? ' [reflowOnly]' : ''}`);
  if (dryRun) {
    console.log('\n--dry-run のため実行しません');
    return;
  }

  const { runToneFix } = await import('./claude.mjs');
  const state = loadState();
  let consecFail = 0;
  let totalLimitWaits = 0;
  for (const r of batch) {
    const opts = { model, scope, reflowOnly: r.slug === 'nas-is-like' };
    console.log(`\n━━━ ${r.slug} を runToneFix で実行中（watcher委譲・最長45分） ━━━`);
    const startedAt = new Date().toISOString();
    let res;
    let waits = 0;
    for (;;) {
      try {
        res = await runToneFix(r.slug, null, opts);
      } catch (e) {
        res = { success: false, output: '', error: String(e.message || e) };
      }
      // 使用上限は失敗でなく「待って再開」。consecFail にも数えない。
      const waitMs = res.success ? null : parseLimitWaitMs(res.error);
      if (waitMs === null || totalLimitWaits >= MAX_LIMIT_WAITS) break;
      totalLimitWaits++;
      waits++;
      const resumeAt = new Date(Date.now() + waitMs);
      const hhmm = `${String(resumeAt.getHours()).padStart(2, '0')}:${String(resumeAt.getMinutes()).padStart(2, '0')}`;
      console.log(`⏸ Claude使用上限を検知（${res.error}）`);
      console.log(`⏸ ${hhmm} 頃まで待機し、${r.slug} から自動再開します（待機 ${totalLimitWaits}/${MAX_LIMIT_WAITS} 回目）`);
      await notifyTelegram(`⏸ トーン一斉: Claude使用上限を検知。${hhmm}頃に ${r.slug} から自動再開します（バッチは中断していません）`);
      await sleep(waitMs);
      console.log(`▶ 待機終了 — ${r.slug} を再実行します`);
    }
    // 完了判定は本人申告でなく再監査（絶対基準）で行う
    const after = auditTone([r.slug]).get(r.slug);
    const ok = Boolean(res.success && after?.pass);
    state.history.push({
      slug: r.slug, startedAt, finishedAt: new Date().toISOString(), scope, model,
      reflowOnly: opts.reflowOnly, ok, limitWaits: waits,
      toneAfter: after?.detail ?? 'unknown',
      summary: (res.output || '').slice(0, 500), error: res.error || null,
    });
    saveState(state);
    if (ok) {
      consecFail = 0;
      console.log(`✅ ${r.slug}: 完了（check-tone-only絶対✅）`);
    } else {
      consecFail++;
      console.log(`❌ ${r.slug}: 未達（runToneFix success=${res.success} / tone=${after?.detail ?? '?'} / error=${res.error ?? 'なし'}）`);
      if (consecFail >= 2) {
        console.error('❌ 2曲連続で失敗 — watcher/環境の異常の可能性が高いため中断します');
        process.exit(1);
      }
    }
  }
  printStatus(audit());
}

const [cmd = 'status', ...rest] = process.argv.slice(2);
if (cmd === 'status') {
  printStatus(audit());
} else if (cmd === 'next') {
  const { pending } = audit();
  console.log(pending[0]?.slug ?? '');
} else if (cmd === 'run') {
  await run(rest);
} else {
  console.error('Usage: node agent/src/tone-campaign.mjs <status|next|run> [options]');
  process.exit(1);
}
