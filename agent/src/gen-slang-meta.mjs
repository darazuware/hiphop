import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const corpusDir = arg('--corpus', 'agent/corpus');
const out = 'src/data/slang-meta.json';
const overridesPath = 'agent/slang-tags-overrides.json';

const slangTs = fs.readFileSync('src/data/slang.ts', 'utf8');
const entries = [...slangTs.matchAll(/\{ word: "((?:[^"\\]|\\.)*)",(?: aliases: \[[^\]]*\],)?\s*desc: "((?:[^"\\]|\\.)*)"/g)].map(m => ({ key: m[1].toLowerCase(), word: m[1], text: m[2] }));
const pageDir = 'src/data/slang-pages';
const pages = fs.readdirSync(pageDir).filter(f => f.endsWith('.json')).map(f => {
  const e = JSON.parse(fs.readFileSync(path.join(pageDir, f), 'utf8'));
  return { key: e.slug, word: e.word, text: [e.category, ...e.summary].join(' ') };
});
const all = new Map();
for (const e of [...entries, ...pages]) if (!all.has(e.key)) all.set(e.key, e);

const overrides = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, 'utf8')) : {};
const previous = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};

const corpus = [];
if (fs.existsSync(corpusDir)) {
  for (const a of fs.readdirSync(corpusDir)) {
    const d = path.join(corpusDir, a);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d)) corpus.push(fs.readFileSync(path.join(d, f), 'utf8').toLowerCase());
  }
}
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const songCount = word => {
  if (!corpus.length) return null;
  const v = word.toLowerCase().split(/\s*\/\s*/)[0].replace(/^'/, '');
  if (v.length < 2) return null;
  const re = new RegExp('(^|[^a-z])' + escape(v) + '(s|es)?([^a-z]|$)');
  return corpus.filter(t => re.test(t)).length;
};

const POS = /褒め|最高|すごい|ヤバい|かっこ|イケ|称賛|敬意|愛してる|味方|支え|成功|ステータス|象徴的|豊か|尊敬|極上|誇り|輝|最強|賞賛|いいね|クール|名曲|伝説|レジェンド|パイオニア/;
const NEG = /ダサい|けな|裏切|密告|チクる|攻撃|偽物|うんざり|批判|ケチ|嫌|貧|死|殺|撃|暴力|ならず者|悪党|虚勢|見栄|詐欺|だます|危険|破壊|皮肉|揶揄|無価値|ゴミ|野蛮/;
const THEMES = [
  ['お金', /金|現金|札|稼|ドル|お金|収入/],
  ['仕事・稼ぎ', /仕事|働|副業|商売|ハスラー|労働/],
  ['地元・場所', /地元|街|地区|ブロック|ニューヨーク|ブロンクス|西海岸|縄張り|近所|スタテンアイランド|ブルックリン/],
  ['仲間・人', /仲間|友|クルー|相棒|呼びかけ|人の呼び方|一派|集団|グループ|先輩|古参/],
  ['家族', /父|母|親父|いとこ|家族/],
  ['評価・ほめ言葉', /褒め|最高|すごい|ヤバ|かっこ|イケ|称賛|ダサい|けな|評価|クール/],
  ['音楽・ラップ', /ラップ|リリック|ビート|MC|フロー|曲|歌詞|サンプル|レーベル|音楽|バース|サイファー/],
  ['ファッション・車', /服|ブーツ|ジャケット|帽子|髪|車|ジュエリー|ブランド|ホイール|ダイヤ|SUV|ファッション/],
  ['感情・態度', /態度|感情|気分|うんざり|怒|見栄|虚勢|雰囲気|ノリ|空気|驚き/],
  ['社会・文化', /社会|差別|人種|思想|宗教|Five|歴史|文化|教義|意識/]
];
const HIDDEN = [
  ['大麻', /マリファナ|大麻|ジョイント|葉巻|reefer|sensi|trees|ブラント/],
  ['ドラッグ', /コカイン|クラック|ドラッグ|密売|麻薬|ディーラー|ジャンキー/],
  ['犯罪', /銃|撃|殺|暴力|警察|刑|拳銃|襲|ギャング|密告|強盗|弾|逮捕|ムショ|ガサ/]
];
const PROPER_EXC = new Set(['dimes', 'dutch', 'def', 'beez', 'gods', 'jake', 'teflon', 'shorties', 'jheri curl', 'superfly-ness', 'golden arms', 'old earth', 'math', 'pharaoh', 'c.r.e.a.m.', 'ice me', 'g off', 'thugs', 'raw', 'gospel', 'platinum', 'a&r', 'labels', 'o', 'og\'s']);
const isProper = (word, key) => /^[A-Z]/.test(word) && !PROPER_EXC.has(key);

const meta = {};
for (const [key, e] of all) {
  const ov = overrides[key] || {};
  const text = e.text;
  const hidden = HIDDEN.filter(([, re]) => re.test(text) || re.test(e.word)).map(([n]) => n);
  const pos = POS.test(text), neg = NEG.test(text) || hidden.includes('犯罪');
  const kind0 = isProper(e.word, key);
  const tone = ov.tone || (kind0 ? '中立' : pos && !neg ? 'ポジティブ' : neg && !pos ? 'ネガティブ' : '中立');
  const kind = ov.kind || (isProper(e.word, key) ? '固有名詞' : '一般語');
  let themes = ov.themes || THEMES.filter(([, re]) => re.test(text)).map(([n]) => n).slice(0, 3);
  if (kind === '固有名詞' && !ov.themes) themes = ['人物・作品・地名'];
  if (!themes.length) themes = ['その他'];
  const n = songCount(e.word);
  const prev = previous[key]?.songs;
  const songs = n ?? prev ?? 0;
  const freq = ov.freq || (songs >= 20 ? '頻出' : songs >= 5 ? 'ふつう' : 'レア');
  meta[key] = { tone, freq, kind, themes, hidden: ov.hidden || hidden, songs };
}
fs.writeFileSync(out, JSON.stringify(meta, null, 1));
const cnt = (f) => Object.values(meta).reduce((m, v) => ((m[f(v)] = (m[f(v)] || 0) + 1), m), {});
console.log('keys', Object.keys(meta).length);
console.log('tone', cnt(v => v.tone));
console.log('freq', cnt(v => v.freq));
console.log('kind', cnt(v => v.kind));
console.log('hidden', cnt(v => v.hidden.join('+') || '-'));
