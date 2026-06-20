/**
 * 既存曲（songs.ts 登録済み）の判定ロジック。
 * index.mjs（リサーチ前のスキップ判定）と processor.mjs（変換モード判定）の
 * 両方から呼ぶ共通関数。重複させない。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * タイトルから slug を導出する（processor.mjs と同一ルール）
 * @param {string} title
 * @returns {string}
 */
export function deriveSlug(title) {
  return title.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * songs.ts と .astro を読み、既存曲かどうか・learning型かどうかを判定する
 * @param {string} slug
 * @param {string} cwd - hiphop プロジェクトルート
 * @returns {{ registered: boolean, isLearning: boolean, astroPath: string, astroSrc: string|null, entryLine: string|null }}
 */
export function inspectExistingSong(slug, cwd) {
  const songsSrc = readFileSync(join(cwd, 'src/data/songs.ts'), 'utf-8');
  const registered = songsSrc.includes(`slug: '/songs/${slug}'`);
  const astroPath = join(cwd, `src/pages/songs/${slug}.astro`);

  let isLearning = false;
  let astroSrc = null;
  if (registered) {
    try {
      astroSrc = readFileSync(astroPath, 'utf-8');
      isLearning = astroSrc.includes('LearningUnit');
    } catch {
      // .astro が無い場合は従来型扱い（変換続行）
    }
  }

  const entryLine =
    songsSrc.split('\n').find((l) => l.includes(`slug: '/songs/${slug}'`)) || null;

  return { registered, isLearning, astroPath, astroSrc, entryLine };
}

/**
 * 既存の従来型曲を learning 型へ変換するための「リサーチ相当データ」を
 * Gemini を経由せず songs.ts のフィールド＋既存 .astro 本文から組み立てる。
 * @param {string} slug
 * @param {{ astroSrc: string|null, entryLine: string|null }} info - inspectExistingSong の戻り値
 * @returns {{ research: string, meta: { artist: string, title: string, year: number|null } }}
 */
export function buildConversionData(slug, info) {
  const line = info.entryLine || '';
  const field = (name) => {
    // title: "..." / producer: '...' どちらのクォートにも対応
    const m = line.match(new RegExp(`${name}:\\s*(["'])((?:\\\\.|(?!\\1).)*)\\1`));
    return m ? m[2].replace(/\\(["'])/g, '$1') : null;
  };

  const title = field('title') || slug.replace(/-/g, ' ');
  const artist = field('artists') || '';
  const producer = field('producer') || '';
  const album = field('album') || '';
  const sample = field('sample') || '';
  const subtitle = field('subtitle') || '';
  const era = field('era') || '';
  const yearMatch = (subtitle + ' ' + sample).match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null;

  const research = `# ${title} — 既存記事からの learning型変換用データ（Gemini非経由）

アーティスト: ${artist}
プロデューサー: ${producer}
収録アルバム: ${album}
サンプリング元: ${sample}
時代: ${era}
リリース年: ${year ?? '不明'}

## 既存記事本文（従来型 .astro・変換元）

以下は src/pages/songs/${slug}.astro の現行本文。事実はこの本文と上記フィールドを正とし、
learning型（LearningUnit主体）へ書き直す。新たな事実の追加は最小限にし、ハルシネーション禁止。

${info.astroSrc || '（.astro 本文を取得できませんでした）'}
`;

  return { research, meta: { artist, title, year } };
}
