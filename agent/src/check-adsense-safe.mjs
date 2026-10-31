#!/usr/bin/env node
/**
 * AdSense審査中の危険表現ガード（銃・殺害・血・薬物・差別語・露骨な暴力）。
 * 出力は slug・カテゴリ・件数のみ（語そのものや歌詞は出さない）。全0で exit 0。
 *
 * Usage:
 *   node agent/src/check-adsense-safe.mjs            # 全曲ページの一覧
 *   node agent/src/check-adsense-safe.mjs {slug}     # 1曲（unit別の内訳つき）
 */
import fs from "node:fs";

const SKIP = new Set(["slam-harder", "dead-presidents"]); // 退避済み。dead-presidents の narc は密告の意味で残す
// 人名・曲名など、語の形だけ一致して意味が違うものは先に消してから数える
const MASK = [
  /Ghostface Killah|Ghostface|Killah Priest|Killer Mike|Pete Rock|Masta Killa|Inspectah Deck|Kurupt/g,
  /one shot|my shot|nine-to-|like Nine|whole nines|out of nine|on (the )?rocks|crack a beer|血縁|血の繋が|血のつなが|血はつなが|頭に血が|鎌状赤血球|Soul Assassins|nine to |Skull Snaps|triumph-nine-mcs|Method Man|Meth\b|殺到|殺虫|血肉|Nine、|whole nine|音（crack）|非暴力|押し殺|釘を刺|ビートジャンキーズ|Beat Junkies|body slam|reading-body|TS\["[^"]*"\]/g,
];
export const CATS = {
  gun: /\b(guns?|gats?|glocks?|nines?|9mm|pistols?|rifles?|uzis?|tec-?9s?|tecs?|mac-?1[01]s?|shotguns?|triggers?|bullets?|shoots?|shootin'?g?|shots?|ammo|ak-?47s?|aks?|revolvers?|gunshots?|gunfire|firearms?)\b|銃|拳銃|ピストル|ライフル|弾丸|発砲|射殺|撃つ|撃た|撃ち|撃っ|撃て|マシンガン|グロック|引き金/gi,
  kill: /\b(kill\w*|murder\w*|murda|slay\w*|homicides?|assassin\w*|bod(y|ies)|bodied|stab\w*|corpses?|massacre\w*|slaughter\w*)\b|殺|暗殺|死体|刺す|刺し|処刑|虐殺/gi,
  blood: /\b(blood\w*|bleed\w*|bled)\b|血/gi,
  drug: /\b(crack|cocaine|coke|heroin|weed|blunts?|marijuana|fiends?|kilos?|pushers?|dealers?|narcs?|rocks|slangin'?g?|trappin'?g?|ganja|meth|sherm)\b|コカイン|クラック|ヘロイン|マリファナ|大麻|薬物|麻薬|ドラッグ|売人|ドープ|密売|依存症|ジャンキー|ハッパ|覚醒剤|ガンジャ/gi,
  slur: /\b(nigg\w*|n-word|b-word|bitch\w*|hoe?s?|pussy|pussies|faggots?|sluts?|whores?)\b|ニガ|Nワード|ビッチ|差別語|蔑称/gi,
  viol: /\b(rape\w*|tortur\w*|skulls?|knife|knives)\b|暴力|殴|強盗|拷問|レイプ|銃撃|暴行|ナイフ/gi,
};

export function count(text) {
  let t = text;
  for (const re of MASK) t = t.replace(re, "");
  const out = { total: 0 };
  for (const [k, re] of Object.entries(CATS)) {
    out[k] = (t.match(re) || []).length;
    out.total += out[k];
  }
  return out;
}

const fmt = (c) => Object.keys(CATS).filter((k) => c[k]).map((k) => `${k}:${c[k]}`).join(" ") || "-";
const arg = process.argv[2];
const dir = "src/pages/songs";
const slugs = arg ? [arg] : fs.readdirSync(dir).filter((f) => f.endsWith(".astro") && !f.startsWith("[")).map((f) => f.replace(".astro", "")).filter((s) => !SKIP.has(s));
let bad = 0;
for (const slug of slugs) {
  const src = fs.readFileSync(`${dir}/${slug}.astro`, "utf8");
  const body = src.replace(/^---[\s\S]*?\n---/, "");
  const c = count(body);
  if (c.total) bad++;
  if (!arg) {
    if (c.total) console.log(`❌ ${slug}\t${c.total}\t${fmt(c)}`);
    continue;
  }
  console.log(`${c.total ? "❌" : "✅"} ${slug}\t${c.total}\t${fmt(c)}`);
  const units = [...body.matchAll(/<LearningUnit[\s\S]*?<\/LearningUnit>/g)];
  let outside = body;
  for (const u of units) {
    outside = outside.replace(u[0], "");
    const uc = count(u[0]);
    const id = (u[0].match(/TS\["([^"]+)"\]/) || [])[1] || "(no-id)";
    if (uc.total) console.log(`  ${id}\t${fmt(uc)}`);
  }
  const oc = count(outside);
  if (oc.total) console.log(`  (unit外)\t${fmt(oc)}`);
}
if (!arg) console.log(`\n対象 ${bad} / ${slugs.length} 本`);
process.exit(bad ? 1 : 0);
