import type { APIRoute } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const prerender = true;

const songs = [
  { slug: 'fuck-compton',       title: 'Fuck Compton',                         artists: 'Tim Dog',                           credit: 'THE 45 KING PRODUCED · 1991' },
  { slug: 'protect-ya-neck',    title: 'Protect Ya Neck',                      artists: 'Wu-Tang Clan',                       credit: 'RZA PRODUCED · 1993' },
  { slug: 'come-clean',         title: 'Come Clean',                           artists: 'Jeru the Damaja',                    credit: 'DJ PREMIER PRODUCED · 1993' },
  { slug: 'cream',              title: 'C.R.E.A.M.',                           artists: 'Wu-Tang Clan',                       credit: 'RZA PRODUCED · 1994' },
  { slug: 'party-and-bullshit', title: 'Party and Bullshit',                   artists: 'The Notorious B.I.G.',              credit: 'EASY MO BEE PRODUCED · 1993' },
  { slug: 'ready-to-die',       title: 'Ready to Die',                         artists: 'The Notorious B.I.G.',              credit: 'EASY MO BEE PRODUCED · 1994' },
  { slug: 'what-they-do',       title: 'What They Do',                         artists: 'The Roots feat. Raphael Saadiq',     credit: 'THE ROOTS PRODUCED · 1996' },
  { slug: 'triumph',            title: 'Triumph',                              artists: 'Wu-Tang Clan',                       credit: 'RZA PRODUCED · 1997' },
  { slug: 'the-city-is-mine',   title: 'The City Is Mine',                     artists: 'Jay-Z feat. Blackstreet',            credit: 'TEDDY RILEY PRODUCED · 1997' },
  { slug: 'nas-is-like',        title: 'Nas Is Like',                          artists: 'Nas',                                credit: 'DJ PREMIER PRODUCED · 1999' },
  { slug: 'doomsday',           title: 'Doomsday',                             artists: 'MF DOOM',                            credit: 'MF DOOM PRODUCED · 1999' },
  { slug: 'hiphop-is-dead',     title: 'Hip Hop Is Dead',                      artists: 'Nas feat. will.i.am',                credit: 'WILL.I.AM PRODUCED · 2006' },
  { slug: 'classic',            title: 'Classic',                              artists: 'Rakim · Kanye West · Nas · KRS-One', credit: 'DJ PREMIER REMIX · 2007' },
  { slug: 'you',                title: 'You',                                  artists: 'Evidence feat. DJ Premier',          credit: 'DJ PREMIER PRODUCED · 2011' },
  { slug: 'cash-rules',         title: 'Cash Rules',                           artists: 'iyla feat. Method Man',              credit: '2020' },
];

const fontData: ArrayBuffer = (() => {
  const fontPath = fileURLToPath(
    new URL('../../../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff', import.meta.url)
  );
  return readFileSync(fontPath).buffer as ArrayBuffer;
})();

export function getStaticPaths() {
  return songs.map(s => ({ params: { slug: s.slug } }));
}

export const GET: APIRoute = async ({ params }) => {
  const song = songs.find(s => s.slug === params.slug);
  if (!song) return new Response('Not found', { status: 404 });

  const fontSize = song.title.length > 22 ? 52 : song.title.length > 14 ? 64 : 80;

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
          justifyContent: 'flex-end',
          padding: '64px',
          fontFamily: 'Inter',
          position: 'relative',
        },
        children: [
          // site name — top right
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 60,
                right: 64,
                color: '#d4af37',
                fontSize: 15,
                letterSpacing: 5,
              },
              children: 'HIPHOP LYRICS',
            },
          },
          // gold credit label
          {
            type: 'div',
            props: {
              style: {
                color: '#d4af37',
                fontSize: 17,
                letterSpacing: 4,
                marginBottom: 22,
              },
              children: song.credit,
            },
          },
          // song title
          {
            type: 'div',
            props: {
              style: {
                color: '#ffffff',
                fontSize,
                fontWeight: 700,
                lineHeight: 1.1,
                marginBottom: 22,
              },
              children: song.title,
            },
          },
          // artist
          {
            type: 'div',
            props: {
              style: { color: '#888888', fontSize: 26 },
              children: song.artists,
            },
          },
          // gold bottom bar
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
