/**
 * 本番レンダー（gen-reel.mjs / gen-full-composition.mjs）の字幕文字色設定。
 * agent/prod-colors.json に { en, jp } を保存。cue-editor.mjsの🎨パネルから編集できる。
 */
import fs from "fs";
import path from "path";

export const DEFAULT_PROD_COLORS = { en: "#ffffff", jp: "#ffd24a" };
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function prodColorsPath(agentDir) {
  return path.join(agentDir, "prod-colors.json");
}

export function readProdColors(agentDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(prodColorsPath(agentDir), "utf-8"));
    return {
      en: HEX_RE.test(raw.en) ? raw.en : DEFAULT_PROD_COLORS.en,
      jp: HEX_RE.test(raw.jp) ? raw.jp : DEFAULT_PROD_COLORS.jp,
    };
  } catch {
    return { ...DEFAULT_PROD_COLORS };
  }
}

export function writeProdColors(agentDir, colors) {
  const out = {
    en: HEX_RE.test(colors.en) ? colors.en : DEFAULT_PROD_COLORS.en,
    jp: HEX_RE.test(colors.jp) ? colors.jp : DEFAULT_PROD_COLORS.jp,
  };
  fs.writeFileSync(prodColorsPath(agentDir), JSON.stringify(out, null, 2));
  return out;
}
