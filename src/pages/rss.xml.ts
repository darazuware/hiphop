import rss from '@astrojs/rss';
import { songs } from '../data/songs';

export async function GET() {
  return rss({
    title: 'WAX&THINK — ヒップホップ英語・スラング解説',
    description: 'ヒップホップの名曲に出てくるスラング・韻・言葉遊び・AAVE文法を日本語で読み解く学習解説。',
    site: 'https://waxthink.com',
    items: songs.filter(song => song.tier === 'core').map(song => ({
      title: `${song.title} 英語・スラング解説 | ${song.artists}`,
      pubDate: new Date(song.pubDate),
      description: `${song.artists}「${song.title}」のスラング・英語解説。${song.subtitle}`,
      link: song.slug,
    })),
    customData: `<language>ja</language>`,
  });
}
