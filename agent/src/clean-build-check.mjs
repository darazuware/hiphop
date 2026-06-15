#!/usr/bin/env node
/**
 * 作業ツリー非依存のクリーンビルド検証（commit漏れの早期検知＝werdz型の再発防止）。
 *
 * watcher の `npm run build` は作業ツリー上で走るため、生成済みだが git未コミットの
 * 参照ファイル（learning型が import する agent/{slug}/assets/units-timestamps.json 等）が
 * 在ってもビルドが通ってしまい、本番(クリーンclone)で初めて落ちる。
 *
 * そこで commit 後・push 前に、直近コミット(HEAD)だけを git worktree で別ディレクトリに
 * 展開し（作業ツリーの未コミット変更は一切含まれない）、node_modules を symlink して
 * `npm run build` を実行する。これが通って初めて「コミット漏れ無し」を保証できる。
 * 落ちたら exit 1 → 呼び出し側は push を止める。
 *
 * 歌詞テキストは出力しない（astro build のルート一覧のみ）。
 */
import { execSync } from "node:child_process";
import { mkdtempSync, symlinkSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), "hiphop-cleanbuild-"));
const work = join(tmp, "repo");
const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts });

let ok = false;
try {
  // HEAD（コミット済みのみ）を別worktreeへ展開。.git共有なのでオブジェクトコピー無し。
  run(`git worktree add --detach --quiet "${work}" HEAD`, { cwd: ROOT });
  // 依存はメインのものを共有（build成立に必要）。
  if (existsSync(join(ROOT, "node_modules"))) {
    symlinkSync(join(ROOT, "node_modules"), join(work, "node_modules"));
  }
  run("npm run build", { cwd: work });
  console.log("✅ clean build OK（commit漏れなし）");
  ok = true;
} catch (e) {
  console.error("❌ clean build 失敗 — 参照ファイルのcommit漏れの可能性。pushを中止。");
} finally {
  try { run(`git worktree remove --force "${work}"`, { cwd: ROOT }); } catch {}
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
}
process.exit(ok ? 0 : 1);
