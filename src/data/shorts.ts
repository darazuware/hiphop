export const shorts = [
  { slug: "nas-is-like",          file: "nas-is-like-minimal", songSlug: "/songs/nas-is-like",          title: "Nas Is Like",          artist: "Nas",            year: 1999, producer: "DJ Premier"   },
  { slug: "ny-state-of-mind",     file: "ny-state-of-mind",    songSlug: "/songs/ny-state-of-mind",     title: "N.Y. State of Mind",   artist: "Nas",            year: 1994, producer: "DJ Premier"   },
  { slug: "i-can",                file: "i-can",               songSlug: "/songs/i-can",                title: "I Can",                artist: "Nas",            year: 2002, producer: "Salaam Remi"  },
  { slug: "if-i-ruled-the-world", file: "if-i-ruled-the-world",songSlug: "/songs/if-i-ruled-the-world", title: "If I Ruled the World",  artist: "Nas",            year: 1996, producer: "Trackmasters" },
  { slug: "cream",                file: "cream",               songSlug: "/songs/cream",                title: "C.R.E.A.M.",           artist: "Wu-Tang Clan",   year: 1994, producer: "RZA"          },
  { slug: "ooh-la-la",            file: "ooh-la-la",           songSlug: "/songs/ooh-la-la",            title: "ooh la la",            artist: "Run The Jewels", year: 2020, producer: "El-P"          },
  { slug: "the-1st-time",         file: "the-1st-time",        songSlug: "/songs/the-1st-time",         title: "The 1st Time",         artist: "Jamo Gang",      year: 2020, producer: "DJ Premier"   },
] as const;

export type Short = (typeof shorts)[number];
