// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { songs } from './src/data/songs.ts';

// thin（noindex）曲のURLはsitemapから除外し、core曲のみをsitemapに掲載する
const thinUrls = new Set(
  songs.filter(s => s.tier === 'thin').map(s => `https://waxthink.com${s.slug}/`)
);

const noindexColumnUrls = new Set(
  ['juice', 'how-high', 'do-the-right-thing'].map(s => `https://waxthink.com/columns/${s}/`)
);

// アーティストページは審査中ノーインデックスのためsitemapから全除外（[slug].astroのnoindexと一致）
export default defineConfig({
  site: 'https://waxthink.com',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      filter: (page) => {
        if (thinUrls.has(page)) return false;
        if (noindexColumnUrls.has(page)) return false;
        const artistMatch = page.match(/\/artists\/([^/]+)\/?$/);
        if (artistMatch) return false;
        return true;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});
