export type VideoType = "freestyle" | "interview" | "cypher" | "live" | "documentary";

export interface Video {
  slug: string;
  title: string;
  artists: string;
  artistSlug: string;
  youtubeId: string;
  type: VideoType;
  year: number;
  tag: string;
  pubDate: string;
}

export const videos: Video[] = [
  {
    slug: "shady-20-cypher",
    title: "Shady 2.0 Cypher 和訳・解説 | Eminem, Slaughterhouse, Yelawolf",
    artists: "Eminem, Slaughterhouse & Yelawolf",
    artistSlug: "eminem",
    youtubeId: "xLzHVd9UIWQ",
    type: "cypher",
    year: 2011,
    tag: "2011 BET Hip Hop Awards — Shady Recordsが叩き出した伝説のサイファー",
    pubDate: "2026-06-01",
  },
];
