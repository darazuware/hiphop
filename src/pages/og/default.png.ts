import type { APIRoute } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const prerender = true;

const fontData: ArrayBuffer = (() => {
  const fontPath = fileURLToPath(
    new URL('../../../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff', import.meta.url)
  );
  return readFileSync(fontPath).buffer as ArrayBuffer;
})();

export const GET: APIRoute = async () => {

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          backgroundColor: '#111111',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '64px',
          fontFamily: 'Inter',
          position: 'relative',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { color: '#d4af37', fontSize: 17, letterSpacing: 5, marginBottom: 28 },
              children: 'HIP HOP LYRICS',
            },
          },
          {
            type: 'div',
            props: {
              style: { color: '#ffffff', fontSize: 72, fontWeight: 700, lineHeight: 1.1, marginBottom: 28 },
              children: 'Lyrics · Slang · Culture',
            },
          },
          {
            type: 'div',
            props: {
              style: { color: '#666666', fontSize: 24 },
              children: '1990s Hip Hop  ·  15 Songs  ·  100+ Slang Terms',
            },
          },
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 5,
                backgroundColor: '#d4af37',
              },
              children: '',
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [{ name: 'Inter', data: fontData, weight: 700, style: 'normal' }],
    }
  );

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
