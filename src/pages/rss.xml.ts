import rss from '@astrojs/rss';
import { songs } from '../data/songs';

export async function GET() {
  return rss({
    title: 'WAX&INK — ヒップホップ歌詞和訳・スラング解説',
    description: 'ヒップホップの名曲を歌詞和訳とスラング解説で深掘り。',
    site: 'https://waxthink.com',
    items: songs.filter(song => song.tier === 'core').map(song => ({
      title: `${song.title} 和訳・意味解説 — ${song.artists}`,
      pubDate: new Date(song.pubDate),
      description: `${song.artists}「${song.title}」の歌詞和訳・スラング解説。${song.subtitle}`,
      link: song.slug,
    })),
    customData: `<language>ja</language>`,
  });
}
