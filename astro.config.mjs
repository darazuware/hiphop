// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { songs } from './src/data/songs.ts';

// thin（noindex）曲のURLはsitemapから除外し、core曲のみをsitemapに掲載する
const thinUrls = new Set(
  songs.filter(s => s.tier === 'thin').map(s => `https://waxthink.com${s.slug}/`)
);

// core曲を1曲も持たないアーティストページはnoindex（[slug].astroのnoindex判定と一致）。
// sitemapからも除外する。core曲を持つアーティストのみsitemap掲載。
const coreArtistSlugs = new Set(
  songs.filter(s => s.tier === 'core').map(s => s.artistSlug)
);

export default defineConfig({
  site: 'https://waxthink.com',
  integrations: [
    sitemap({
      filter: (page) => {
        if (thinUrls.has(page)) return false;
        const artistMatch = page.match(/\/artists\/([^/]+)\/?$/);
        if (artistMatch) return coreArtistSlugs.has(artistMatch[1]);
        return true;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});
