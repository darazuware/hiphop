# Task 2 — スラング内部リンク カバレッジ監査

生成日: 2026-06-11

## 仕組み（既存・改修不要）
- `QuickSlang` は `src/data/slang.ts` に登録済みの語を `findSlangEntry()` で照合し、ヒットすれば `/slang?q={語}` への詳細リンク（実線下線）を自動生成。
- 未登録語はリンクなし（点線下線・ツールチップのみ）= リンク切れを作らない。
- `/slang` 側は各語の「使用曲」を全曲スキャンで逆リンク。

## 集計

| 指標 | 値 |
|---|---|
| スキャン曲数 | 78 |
| QuickSlang使用曲数 | 29 |
| QuickSlang注釈総数 | 239 |
| → 辞書ヒット=リンク生成 | 51 |
| → 未登録=リンクなし | 188 |
| 注釈の異なり語数 | 231 |
| 未収録の異なり語数 | 185 |
| 辞書総収録語 | 103 |

## 辞書に未収録だった注釈用語（出現回数降順）

> 方針: これらはリンクなしのまま（リンク切れ防止）。固有名詞・頻出語で詳細リンクを付けたい語のみ `src/data/slang.ts` に `{ word, desc }` を追加すれば自動でリンク化される。

- `props` ×2
- `wack` ×2
- `Slick` ×2
- `'til infinity`
- `maxin'`
- `stoge`
- `40`
- `dip`
- `phat / fat`
- `indo`
- `mack`
- `loot`
- `Mid-City Fiesta`
- `slanging`
- `acid raindrops`
- `Mary Jane`
- `bangin'`
- `Mr. Cooper`
- `quarter inch cables`
- `lampin'`
- `buggin' over time`
- `do-rag`
- `thinkin' cap`
- `Bodega`
- `Hustle`
- `Fiend`
- `Dope`
- `Burner`
- `Stack`
- `bow down`
- `guppies`
- `the gauge`
- `D's`
- `Locs`
- `Chucks`
- `Sho Nuff`
- `on wax`
- `pistola`
- `Brothers can't see me（ブラザーズ・キャント・シー・ミー）`
- `airwaves（エアウェーブ）`
- `crate digger（クレートディガー）`
- `frontin'（フロンティン）`
- `whack（ワック）`
- `Astro Black（アストロ・ブラック）`
- `beat conductor（ビートコンダクター）`
- `static（スタティック）`
- `OG`
- `cosign`
- `platinum`
- `hustler`
- `Criminal Minded`
- `throwin' shots from afar`
- `shit`
- `Gucci frames`
- `cool beans`
- `reefer`
- `pre-roll`
- `Jakes`
- `Julio Iglesias`
- `C.R.E.A.M.`
- `track`
- `cypher`
- `9th chamber`
- `Cash rules`
- `god degree`
- `steez`
- `'Lo`
- `Tommy Hil'`
- `lye`
- `penal`
- `bid`
- `chain was truck`
- `Dead Presidents`
- `Conglomerate`
- `Cream`
- `NARC'in`
- `RICO`
- `Presidential`
- `Tecs / Tec-9`
- `O-Dog / Menace`
- `Box`
- `Beef`
- `Dun / Son`
- `Finna`
- `Fullies`
- `Telly`
- `Paper`
- `Wilding`
- `ifth`
- `money grip`
- `Frank Nitty`
- `hammer`
- `dome`
- `heavy metal`
- `herbs`
- `homicidal`
- `porch monkeys`
- `Kush`
- `Timbuktu`
- `5 on it`
- `keyed`
- `Indo`
- `sack`
- `tore back`
- `dank`
- `skeezers`
- `doja`
- `PO`
- `hampa`
- `politic`
- `Land`
- `black Trump`
- `Timbs`
- `sons who`
- `Wallabees`
- `knots`
- `yard`
- `'Pac`
- `rooty-toot`
- `in full effect`
- `fly girl`
- `lay low`
- `low pro ho`
- `cut like an afro`
- `played the wall`
- `clockin'`
- `dope`
- `Word to the Mutha`
- `mountain climber`
- `Fat like Joe`
- `Pac Man`
- `Lou Piniella`
- `Metallica`
- `Smokey`
- `Dangerfield like Rodney`
- `Howie`
- `Carl Lewis`
- `sewers`
- `Webster`
- `Jabber-Jibber`
- `Sharon from Sliver`
- `Eggo`
- `Waco`
- `Maaco`
- `RuPaul`
- `Jack Dempsey`
- `Novus Ordo Seclorum`
- `storm`
- `drug`
- `nick of time`
- `flossin'`
- `crib`
- `diss`
- `step to`
- `chrome`
- `hoopdy`
- `Vigilante shots`
- `pack steel`
- `loc-ness`
- `8'`
- `stencil`
- `forty`
- `dub`
- `Callin' Earl`
- `187`
- `wop`
- `blow they spot`
- `snub tre-eight`
- `Boricua`
- `riddled`
- `cave dwellers`
- `crack backers`
- `New World Order`
- `AIDS creators`
- `all eye seeing`
- `crackatalism`
- `Ten Percenters`
- `Colin Ferguson`
- `Ra East`
- `O.G.`
- `blammed`
- `cream`
- `gangsta lean`
- `n***as`
- `fiendin'`
