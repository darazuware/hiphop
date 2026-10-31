/**
 * ▶頭出し秒数の「同じ秒が2つ並ぶ」問題の共通処理。
 * 生成側（gen-fallback-timestamps）は重複を前へ送って解消し、
 * 検査側（check-article [SEQ]・pre-push-check）は残った重複をブロックする。
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const projectRoot = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const SECONDS_PER_LINE = 3;

export function domOrderIds(slug) {
  const astroPath = join(projectRoot, "src/pages/songs", `${slug}.astro`);
  if (!existsSync(astroPath)) return [];
  const ids = [...readFileSync(astroPath, "utf8").matchAll(/TS\["([^"]+)"\]\.t\b/g)].map((m) => m[1]);
  return [...new Set(ids)];
}

// 実測（manual）は動かさない。次の秒までに空きが無い場合は動かさず、検査側で止める。
export function spreadDuplicates(results, orderIds) {
  const byId = new Map(results.map((r) => [r.id, r]));
  const listed = orderIds.filter((id) => byId.has(id));
  const order = (listed.length ? listed : results.map((r) => r.id))
    .map((id) => byId.get(id))
    .filter((r) => r.t != null);
  const moved = [];
  for (let i = 0; i < order.length; ) {
    let end = i + 1;
    while (end < order.length && order[end].t === order[i].t) end++;
    const run = order.slice(i, end);
    const followers = run.slice(1);
    if (followers.length && followers.every((r) => r.source !== "manual")) {
      const base = run[0].t;
      const nextT = order[end]?.t ?? Infinity;
      const step = Math.min(SECONDS_PER_LINE, (nextT - base) / run.length);
      if (step >= 1) {
        followers.forEach((r, k) => {
          r.t = base + Math.round(step * (k + 1));
          r.source = `${r.source}+spread`;
          r.approx = true;
          moved.push(r.id);
        });
      }
    }
    i = end;
  }
  return moved;
}

export function findDuplicateTimestamps(slug) {
  const tsPath = join(projectRoot, "agent", slug, "assets", "units-timestamps.json");
  if (!existsSync(tsPath)) return [];
  const tmap = new Map(JSON.parse(readFileSync(tsPath, "utf8")).map((r) => [r.id, r.t]));
  const groups = new Map();
  for (const id of domOrderIds(slug)) {
    const t = tmap.get(id);
    if (t == null) continue;
    groups.set(t, [...(groups.get(t) || []), id]);
  }
  return [...groups].filter(([, ids]) => ids.length > 1).map(([t, ids]) => ({ t, ids }));
}
