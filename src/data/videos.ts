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
    slug: "eminem-proof-stereo-car-freestyle",
    title: "Eminem & Proof 車内フリースタイル 和訳・解説 | Stereo Car Freestyle",
    artists: "Eminem & Proof",
    artistSlug: "eminem",
    youtubeId: "Bu7a_lQu_vM",
    type: "freestyle",
    year: 2002,
    tag: "Proofが生きていた頃の二人——デトロイトの車内で紡いだ即興の記録",
    pubDate: "2026-06-01",
  },
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
