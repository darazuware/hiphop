/**
 * 評論家口調ガード（Item 7）の共有定義。
 * pre-push-check.mjs（実行時チェック）と sync-tone-dict.mjs（Obsidian辞書→JSON同期）の両方から使う。
 * リスト・正規表現は docs/article-tone.md の「評論家ヅラ禁止」と同期。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// HARD＝中立用法がほぼ無い評論家確定語。検出＝ブロック。
// 「見事」は marvelous 等の語義注釈・和訳でも出る多義語のため、ガード対象から外しプロンプト側で抑制する。
export const CRITIC_HARD = [
  '圧巻',
  '秀逸',
  '通奏低音',
  '言語の経済性',
  'リリシズムの核',
  'にほかならない',
  'に他ならない',
  '先駆けとして',
  'として位置づけ',
  'として位置付け',
  'スタイルを確立',
  '多層的に読める',
  'と言えるだろう',
  'と言えよう',
  'ではないだろうか',
  'なのである',
  'と言っても過言ではない',
  'たらしめ',
  '諦観',
  '省察',
];

// SOFT＝AI臭いが中立用法もある語（既存記事に多い）。検出＝警告のみ・ブロックしない。
// 「格付け」は article-tone.md 承認の一人称言い換え（「格付けを下しにいく」）と衝突するため非対象。
export const CRITIC_SOFT = [
  '唯一無二',
  '色褪せ',
  '金字塔',
  '不朽の',
  '真骨頂',
  'を体現',
  'に昇華',
  '極北',
  'いわば',
  '凝縮されて',
  '奥行きを与え',
  '証左',
  '大仰',
];

// 読者に手順を命じる命令形（「声に出して」「〜てください」）＝イラッとくる語りかけ。警告。
export const READER_CMD_RE = /て(?:ください|下さい)|声に出して/g;

// AI/評論家臭の最大tell＝ダッシュ強調（— em / – en / ― horizontal bar）。解説散文ではブロック。
export const DASH_RE = /[—–―]/g;

// 評論家の体言止め断定「〜だ。／である。」。会話調「なんだ。」等は lookbehind で除外。
export const ASSERT_RE = /(?<![んな])だ。|である。/g;
export const ASSERT_LIMIT = 5;

// 日本語文字数（ひらがな・カタカナ・漢字・々ー）
export function jpCharCount(s) {
  return (s.match(/[぀-ゟ゠-ヿ一-鿿々ー]/g) || []).length;
}

// .astro から運営者の日本語解説だけを取り出す（eng＝英語引用 / jpn＝和訳 スロット・タグ除去）。
// トーン規約は解説散文のみ対象（和訳の語をトーン違反に数えない）。
export function jpBody(raw) {
  let body = raw.replace(/^---[\s\S]*?\n---/, '');
  body = body.replace(/<Fragment\b[^>]*slot="(?:eng|jpn)"[^>]*>[\s\S]*?<\/Fragment>/g, ' ');
  // 見出し(h1-6)・目次(nav)は設計上の区切りで解説散文ではないため除外する。
  body = body.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/g, ' ');
  body = body.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/g, ' ');
  body = body.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
  return body;
}

export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ハードコード済み・既存正規表現ガードで既にカバー済みの語か（辞書由来の重複登録を弾く）
export function coveredByBuiltins(word) {
  if (CRITIC_HARD.includes(word) || CRITIC_SOFT.includes(word)) return true;
  if (new RegExp(READER_CMD_RE.source).test(word)) return true;
  if (new RegExp(DASH_RE.source).test(word)) return true;
  return false;
}

// Obsidian辞書から同期生成された agent/.tone-ng-words.json を読む。
// 辞書が無い環境（review worktree・bot等）でも落ちないよう、無ければ空リストにフォールバック。
export function loadDictWords(projectRoot) {
  try {
    const j = JSON.parse(readFileSync(join(projectRoot, 'agent/.tone-ng-words.json'), 'utf-8'));
    return {
      block: [...new Set(j.block || [])].filter((w) => !coveredByBuiltins(w)),
      warn: [...new Set(j.warn || [])].filter((w) => !coveredByBuiltins(w)),
    };
  } catch {
    return { block: [], warn: [] };
  }
}
