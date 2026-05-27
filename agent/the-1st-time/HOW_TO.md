# ショート動画 制作フロー

## 必要なもの
- YouTube URL（音源取得用）
- 歌詞（EN原文 + JP翻訳）
- VTTキャプション（ライン単位の開始秒取得用）

---

## 手順

### 1. 音源取得
```bash
cd agent/audio
yt-dlp -x --audio-format mp3 "YOUTUBE_URL"
```

### 2. VTT取得（タイミング用）
```bash
cd agent/temp
yt-dlp --write-auto-subs --skip-download --sub-lang en "YOUTUBE_URL"
```
VTTを開いてバースが始まる秒数（VERSE_START）を確認する。

### 3. テンプレートをコピー
```bash
cp -r agent/short-template agent/SONG_SLUG
```

### 4. 音声トリミング
```bash
# VERSE_START = バース開始秒（VTTで確認）
# TOTAL_DURATION = (最後のVTT秒 - VERSE_START) + 8 程度
# FADE_START = TOTAL_DURATION - 3

ffmpeg -y \
  -ss VERSE_START \
  -i agent/audio/SONG_FILE.mp3 \
  -t TOTAL_DURATION \
  -af "afade=t=out:st=FADE_START:d=3" \
  -ac 2 -ar 44100 \
  agent/SONG_SLUG/assets/audio.mp3
```

### 5. index.html と compositions/song.html を編集

置き換えるプレースホルダー一覧:

| プレースホルダー | 内容 | 例 |
|---|---|---|
| `SONG_SLUG` | package.jsonのname | `ny-state-of-mind` |
| `ARTIST_NAME` | アーティスト名（全大文字） | `NAS` |
| `SONG_TITLE` | 曲名 | `N.Y. State of Mind` |
| `YEAR` | リリース年 | `1994` |
| `PRODUCER` | プロデューサー | `DJ PREMIER` |
| `TOTAL_DURATION` | 動画秒数（index.html×2 + song.html×2） | `38` |

### 6. 歌詞ブロックを埋める

各ブロックにEN原文とJP訳を記入。行が多い場合は `<br>` で折り返す。
ブロック数に合わせて b8 以降を追加（HTMLとshowコール両方）。

### 7. タイミング計算
```
動画内秒 = VTT秒 - VERSE_START
```

VTTの各行の開始秒からVERSE_STARTを引いた値を `show()` に渡す。

```javascript
// VTT: 20.305s → 動画: 20.305 - 18 = 2.3s
show("#b1", 2.3, 3.7);  // t=開始, t2=次の行の開始秒
```

`LAST_LYRIC_END` と `FADE_START` も更新すること。

### 8. レンダリング
```bash
cd agent/SONG_SLUG
npm run render -- --output ../../public/shorts/SONG_SLUG.mp4
```

---

## デザイン仕様（固定）

| 要素 | 設定 |
|---|---|
| EN歌詞 | 72px / weight 900 / 白 |
| JP歌詞 | 46px / weight 700 / ゴールド #c8a96b |
| セパレーター | ゴールドライン 48px |
| メタバー | 中央寄せ / bottom 210px |
| ウォーターマーク | 中央寄せ / bottom 90px |
| フェードアウト | 3秒 |
| 音声フェードアウト | 最後3秒 |

## イントロアニメーション（固定）

大きいタイトルカード → 縮小しながら下方向に移動 → メタバーとクロスフェード

---

## 参考: Nas Is Like の実装

- `agent/nas-minimal/` — 完成版
- VERSE_START: 18s
- TOTAL_DURATION: 38s
- ブロック数: 14
