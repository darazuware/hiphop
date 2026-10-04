#!/usr/bin/env node
/**
 * learning型の曲ページを spec(JSON) から生成する。
 * 文章は spec に書き、定型マークアップ・units.json は本スクリプトが出す（手書きしない）。
 *
 * Usage: node agent/src/gen-learning-page.mjs --slug {slug}
 *   入力 : agent/{slug}/page-spec.json
 *   出力 : src/pages/songs/{slug}.astro / agent/{slug}/assets/units.json
 *   続けて gen-fallback-timestamps.mjs --slug {slug} を実行すること。
 *
 * spec: { title, description, duration, youtubeId, sampleYoutubeId?, sampleTitle?, highlights[3],
 *   intro: [{h2, paras[]}], storyLead, story: [html...], unitsLead: [html...],
 *   units: [{id, heading, label?, mc, find?, anchor[], t, eng?, jpn?, note?, body[], usage[]?}],
 *   background: [{kicker, h3, paras[]}], keywords: [[word, desc]], behind: [html...], legacy: [html...], summary: [html...] }
 * unit.t は PV頭出し秒（units.json の fallbackT に入る）。spec.tSource="caption" なら字幕/SRT由来の実測として captionSec にも入れる（≈表示なし）。
 */
import fs from "fs";

const slugArg = process.argv.indexOf("--slug");
const slug = slugArg >= 0 ? process.argv[slugArg + 1] : null;
if (!slug) { console.error("Usage: node agent/src/gen-learning-page.mjs --slug <slug>"); process.exit(2); }

const specPath = `agent/${slug}/page-spec.json`;
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

const attr = (s) => String(s).replace(/"/g, "&quot;");
const jsq = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
// 1〜2文ごとに<p>を割る（docs/article-tone.md 文体ルール5）。「。」で文を切り、2文ずつまとめる。
const splitPara = (p) => {
  const sents = p.split(/(?<=。)(?![」）』）])/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < sents.length; i += 2) out.push(sents.slice(i, i + 2).join(""));
  return out;
};
const P = (items, indent) =>
  items.flatMap(splitPara).map((p) => `${indent}<p>${p}</p>`).join("\n");
const PT = (items, indent) =>
  items.flatMap(splitPara).map((p) => `${indent}<p>\n${indent}  ${p}\n${indent}</p>`).join("\n");

const H2 = (t) => `      <h2 class="text-[var(--c-gold)] text-xs uppercase tracking-widest mb-5 border-b border-[var(--c-border)] pb-2">\n        ${t}\n      </h2>`;

const intro = spec.intro
  .map(
    (s) => `    <section class="mb-6">
      <h2 class="text-base font-semibold mb-2">${s.h2}</h2>
      <div class="space-y-3 text-sm text-[var(--c-muted)] leading-relaxed">
${PT(s.paras, "        ")}
      </div>
    </section>`
  )
  .join("\n\n");

const units = spec.units
  .map((u, i) => {
    const eng = u.eng ? `        <Fragment slot="eng">${u.eng}</Fragment>\n` : "";
    const jpn = u.jpn ? `        <Fragment slot="jpn">${u.jpn}</Fragment>\n` : "";
    const note = u.note ? `        <p class="text-xs text-[var(--c-dim)] mb-1">▶ ${u.note}</p>\n` : "";
    const usage = u.usage && u.usage.length
      ? `        <Fragment slot="usage">\n${P(u.usage, "          ")}\n        </Fragment>\n`
      : "";
    return `      <LearningUnit
        heading="${attr(u.heading)}"${u.label ? `\n        label="${attr(u.label)}"` : ""}
        mc="${attr(u.mc)}"
        t={TS["${u.id}"].t} tApprox={TS["${u.id}"].approx} youtubeId={YT}
        embed=""
      >
${eng}${jpn}${note}${P(u.body, "        ")}
${usage}      </LearningUnit>`;
  })
  .join("\n\n");

const background = spec.background
  .map(
    (b) => `      <div class="mb-6 p-5 bg-[var(--c-surface)] border-2 border-[var(--c-orange)] border-l-4" style="border-radius:0">
        <p class="text-[var(--c-orange)] text-xs uppercase tracking-widest mb-2">${b.kicker}</p>
        <h3 class="font-semibold text-base mb-3">${b.h3}</h3>
        <div class="space-y-3 text-[var(--c-muted)] text-sm leading-relaxed">
${PT(b.paras, "          ")}
        </div>
      </div>`
  )
  .join("\n\n");

const keywords = spec.keywords
  .map(([w, d]) => `            ['${jsq(w)}', '${jsq(d)}'],`)
  .join("\n");

const section = (id, title, items) => `    <section id="${id}" class="mb-12">
${H2(title)}
      <div class="space-y-3 text-sm text-[var(--c-muted)] leading-relaxed">
${PT(items, "        ")}
      </div>
    </section>`;

const sampleProps = spec.sampleYoutubeId
  ? `\n  sampleYoutubeId="${spec.sampleYoutubeId}"\n  sampleTitle="${attr(spec.sampleTitle || "")}"`
  : "";

const out = `---
import LearningUnit from '../../components/LearningUnit.astro';
import QuickSlang from '../../components/QuickSlang.astro';
import SongLayout from '../../layouts/SongLayout.astro';

import tsData from '../../../agent/${slug}/assets/units-timestamps.json';
const YT = "${spec.youtubeId}";
const TS = Object.fromEntries(tsData.map((u) => [u.id, { t: u.t, approx: u.approx }]));
---

<SongLayout
  title="${attr(spec.title)}"
  description="${attr(spec.description)}"
  slug="${slug}"
  learningPage={true}
  songDuration={${spec.duration}}
  highlights={[
${spec.highlights.map((h) => `    '${jsq(h)}',`).join("\n")}
  ]}
  youtubeId="${spec.youtubeId}"${sampleProps}
>

${intro}

    <nav class="mb-10 p-4 bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg">
      <p class="text-[var(--c-gold)] text-xs uppercase tracking-widest mb-3">目次</p>
      <ol class="space-y-1.5 text-sm text-[var(--c-muted)] list-none">
        <li><a href="#story" class="hover:text-[var(--c-gold)] transition-colors">01 ストーリーの流れ（まず曲全体をつかむ）</a></li>
        <li><a href="#units" class="hover:text-[var(--c-gold)] transition-colors">02 学ぶ表現（スラング・韻・言葉遊び・AAVE）</a></li>
        <li><a href="#background" class="hover:text-[var(--c-gold)] transition-colors">03 文化的背景</a></li>
        <li><a href="#behind" class="hover:text-[var(--c-gold)] transition-colors">04 制作の裏側</a></li>
        <li><a href="#legacy" class="hover:text-[var(--c-gold)] transition-colors">05 評価とその後</a></li>
      </ol>
    </nav>

    <section id="story" class="mb-12">
${H2("ストーリーの流れ（まず曲全体をつかむ）")}
      <p class="text-xs text-[var(--c-dim)] mb-5">
        ${spec.storyLead}
      </p>
      <div class="space-y-4 text-sm text-[var(--c-muted)] leading-relaxed">
${PT(spec.story, "        ")}
        <p class="text-xs text-[var(--c-dim)]">
          ※本ページは批評・教育目的で、解説に必要な範囲の断片のみを引用しています。全歌詞の対訳は掲載していません。
        </p>
      </div>
    </section>

    <div id="units"></div>
    <section class="mb-12">
${H2("学ぶ表現（スラング・韻・言葉遊び・AAVE）")}
      <div class="space-y-3 text-xs text-[var(--c-dim)] mb-6">
${P(spec.unitsLead, "        ")}
      </div>

${units}
    </section>

    <section id="background" class="mb-12">
${H2("文化的背景")}

${background}

      <div class="p-5 bg-[var(--c-surface)] border-2 border-[var(--c-orange)] border-l-4" style="border-radius:0">
        <p class="text-[var(--c-orange)] text-xs uppercase tracking-widest mb-2">キーワード早見表</p>
        <h3 class="font-semibold text-base mb-3">この曲で学んだ表現の整理</h3>
        <div class="space-y-3 mt-3">
          {[
${keywords}
          ].map(([w, d]) => (
            <div class="text-sm">
              <span class="font-semibold text-[var(--c-text)]">{w}</span>
              <span class="text-[var(--c-muted)]"> {d}</span>
            </div>
          ))}
        </div>
      </div>
    </section>

${section("behind", "制作の裏側", spec.behind)}

${section("legacy", "評価とその後", spec.legacy)}

    <section class="mb-12">
${H2("まとめ")}
      <ul class="space-y-2 text-sm text-[var(--c-muted)] list-disc list-inside leading-relaxed">
${spec.summary.map((s) => `        <li>${s}</li>`).join("\n")}
      </ul>
    </section>

</SongLayout>
`;

fs.writeFileSync(`src/pages/songs/${slug}.astro`, out);

const prevPath = `agent/${slug}/assets/units.json`;
const prev = fs.existsSync(prevPath) ? Object.fromEntries(JSON.parse(fs.readFileSync(prevPath, "utf8")).map((x) => [x.id, x])) : {};
const unitsJson = spec.units.map((u) => ({
  id: u.id,
  anchor: u.anchor,
  fallbackT: u.t,
  manualSec: null,
  ...(spec.tSource === "caption" ? { captionSec: u.t } : {}),
  ...(prev[u.id]?.manualSec != null ? { manualSec: prev[u.id].manualSec } : {}),
  ...(spec.tSource !== "caption" && prev[u.id]?.captionSec != null ? { captionSec: prev[u.id].captionSec } : {}),
}));
fs.mkdirSync(`agent/${slug}/assets`, { recursive: true });
fs.writeFileSync(`agent/${slug}/assets/units.json`, JSON.stringify(unitsJson, null, 2) + "\n");
console.log(`[gen-learning-page] ${slug}: ${spec.units.length} units → src/pages/songs/${slug}.astro`);
