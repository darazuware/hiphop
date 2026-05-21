import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// ESモジュールで__dirnameを再現するための設定
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// プロジェクトのルートディレクトリパス
const PROJECT_ROOT = path.resolve(__dirname, '../../');

/**
 * Astroファイルを解析し、YouTube IDと歌詞対訳リストを抽出する
 * @param {string} slug - 曲のスラッグ（例: 'come-down'）
 * @returns {object} 解析結果 { youtubeId, lyrics: [{ eng, jpn }] }
 */
function parseAstroFile(slug) {
  const filePath = path.join(PROJECT_ROOT, 'src/pages/songs', `${slug}.astro`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Astroファイルが見つかりません: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // YouTube IDの抽出
  const youtubeIdMatch = content.match(/youtubeId=["']([^"']+)["']/);
  const youtubeId = youtubeIdMatch ? youtubeIdMatch[1] : null;

  // LyricsBlockの抽出
  const lyricsBlocks = [];
  const lyricsBlockRegex = /<LyricsBlock[\s\S]*?>([\s\S]*?)<\/LyricsBlock>/g;
  let match;

  while ((match = lyricsBlockRegex.exec(content)) !== null) {
    const blockContent = match[1];

    // eng（英語歌詞）スロットの抽出
    const engMatch = blockContent.match(/<Fragment slot="eng">([\s\S]*?)<\/Fragment>/);
    // jpn（日本語和訳）スロットの抽出
    const jpnMatch = blockContent.match(/<Fragment slot="jpn">([\s\S]*?)<\/Fragment>/);

    if (engMatch && jpnMatch) {
      const engText = cleanText(engMatch[1]);
      const jpnText = cleanText(jpnMatch[1]);

      // 空白でない場合のみ追加
      if (engText || jpnText) {
        lyricsBlocks.push({
          eng: engText,
          jpn: jpnText
        });
      }
    }
  }

  return {
    youtubeId,
    lyrics: lyricsBlocks
  };
}

/**
 * HTMLタグの除去や不要な空白のトリミングを行い、テキストをクリーンにする
 * @param {string} text - 対象のテキスト
 * @returns {string} クリーニング後のテキスト
 */
function cleanText(text) {
  let cleaned = text;
  
  // QuickSlangタグのword属性の値を抽出して残す（通常閉じと自己閉じの両方に対応、アポストロフィに対応するためクォーテーションを区別）
  cleaned = cleaned.replace(/<QuickSlang[^>]*word="([^"]+)"[^>]*>([\s\S]*?)<\/QuickSlang>/gi, '$1');
  cleaned = cleaned.replace(/<QuickSlang[^>]*word="([^"]+)"[^>]*\/>/gi, '$1');
  cleaned = cleaned.replace(/<QuickSlang[^>]*word='([^']+)'[^>]*>([\s\S]*?)<\/QuickSlang>/gi, '$1');
  cleaned = cleaned.replace(/<QuickSlang[^>]*word='([^']+)'[^>]*\/>/gi, '$1');

  cleaned = cleaned
    .replace(/<br\s*\/?>/gi, '\n') // <br />タグを改行に変換
    .replace(/<\/?[^>]+(>|$)/g, '') // その他のHTMLタグを除去
    .trim();

  // 各行の前後にある余分なスペースを削除し、空行を除去して結合する
  return cleaned
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

/**
 * YouTubeから動画、音声、および英語字幕アセットをダウンロード・抽出する
 * @param {string} youtubeId - YouTube動画ID
 * @returns {object} ダウンロードされたファイルのパス情報 { videoPath, audioPath, subtitlePath }
 */
function downloadAssets(youtubeId) {
  const tempDir = path.join(PROJECT_ROOT, 'agent/temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const baseName = `video-${youtubeId}`;
  const videoPath = path.join(tempDir, `${baseName}.mp4`);
  const audioPath = path.join(tempDir, `${baseName}.mp3`);
  
  // yt-dlpは字幕を [baseName].[lang].vtt のような形式で出力する
  const subtitlePath = path.join(tempDir, `${baseName}.en.vtt`);

  console.log(`\n--- YouTubeアセットのダウンロードを開始します (ID: ${youtubeId}) ---`);

  // 1. 動画のダウンロード (すでに存在する場合はスキップ)
  if (!fs.existsSync(videoPath)) {
    console.log(`[1/3] 動画をダウンロード中 (1080p以下, MP4)...`);
    const downloadCmd = `yt-dlp -f "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]" -o "${videoPath}" "https://www.youtube.com/watch?v=${youtubeId}"`;
    execSync(downloadCmd, { stdio: 'inherit' });
    console.log(`-> 動画を保存しました: ${videoPath}`);
  } else {
    console.log(`[1/3] すでに動画が存在するためダウンロードをスキップします: ${videoPath}`);
  }

  // 2. 音声の抽出 (すでに存在する場合はスキップ)
  if (!fs.existsSync(audioPath)) {
    console.log(`[2/3] 動画から高音質な音声を抽出中...`);
    const extractCmd = `ffmpeg -i "${videoPath}" -q:a 0 -map a "${audioPath}" -y`;
    execSync(extractCmd, { stdio: 'ignore' });
    console.log(`-> 音声を保存しました: ${audioPath}`);
  } else {
    console.log(`[2/3] すでに音声が存在するため抽出をスキップします: ${audioPath}`);
  }

  // 3. 字幕のダウンロード (すでに存在する場合はスキップ)
  // yt-dlpが実際に出力する可能性のある別言語名や自動生成用ファイルに対応するため、
  // 生成されたファイルを後で確認する。
  if (!fs.existsSync(subtitlePath)) {
    console.log(`[3/3] 英語字幕（自動生成含む）を取得中...`);
    // メディアダウンロードをスキップし、字幕のみ書き出す
    const subCmd = `yt-dlp --write-auto-subs --write-subs --sub-langs en --skip-download -o "${path.join(tempDir, baseName)}" "https://www.youtube.com/watch?v=${youtubeId}"`;
    execSync(subCmd, { stdio: 'ignore' });

    // ファイル名揺れ対策（例: en.vtt か en-US.vtt などの違いを確認）
    const files = fs.readdirSync(tempDir);
    const matchingFile = files.find(f => f.startsWith(baseName) && f.endsWith('.vtt'));
    if (matchingFile) {
      const actualPath = path.join(tempDir, matchingFile);
      if (actualPath !== subtitlePath) {
        fs.renameSync(actualPath, subtitlePath);
      }
      console.log(`-> 字幕を保存しました: ${subtitlePath}`);
    } else {
      console.log(`[警告] 字幕が見つかりませんでした。動画に字幕が設定されていないか、自動生成が無効です。`);
    }
  } else {
    console.log(`[3/3] すでに字幕が存在するため取得をスキップします: ${subtitlePath}`);
  }

  return {
    videoPath,
    audioPath,
    subtitlePath: fs.existsSync(subtitlePath) ? subtitlePath : null
  };
}

/**
 * 2つの文字列の単語ベースでの類似度を計算する（0.0 〜 1.0）
 * @param {string} str1 - 比較元テキスト
 * @param {string} str2 - 比較先テキスト
 * @returns {number} 類似度スコア
 */
function getSimilarity(str1, str2) {
  const words1 = new Set(str1.toLowerCase().replace(/[^a-z0-9'\s]/g, '').split(/\s+/).filter(Boolean));
  const words2 = new Set(str2.toLowerCase().replace(/[^a-z0-9'\s]/g, '').split(/\s+/).filter(Boolean));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  let intersection = 0;
  for (const w of words1) {
    if (words2.has(w)) intersection++;
  }
  
  return intersection / Math.max(words1.size, words2.size);
}

/**
 * WebVTTファイルをパースしてタイムコードとテキストのペアを抽出する
 * @param {string} filePath - VTTファイルのパス
 * @returns {Array<object>} パース結果 [{ start, end, text }]
 */
function parseVtt(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const blocks = content.split(/\n\s*\n/);
  const items = [];

  // WebVTTのタイムコード正規表現: 00:00:00.000 --> 00:00:00.000
  const timeRegex = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/;

  for (const block of blocks) {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    // 最初の行、または2番目の行がタイムコード形式であることを期待する
    let timeMatch = lines[0].match(timeRegex);
    let textIdx = 1;

    if (!timeMatch && lines.length > 2) {
      timeMatch = lines[1].match(timeRegex);
      textIdx = 2;
    }

    if (timeMatch) {
      const start = timeMatch[1];
      const end = timeMatch[2];
      const text = lines.slice(textIdx).join(' ');
      items.push({ start, end, text });
    }
  }

  return items;
}

/**
 * Astroの対訳歌詞ブロックとWebVTT字幕のタイミングを同期（アライメント）する
 * @param {Array<object>} lyrics - Astroから抽出した歌詞 [{ eng, jpn }]
 * @param {Array<object>} vttItems - VTTからパースした字幕 [{ start, end, text }]
 * @returns {Array<object>} 同期済み歌詞リスト [{ start, end, eng, jpn }]
 */
function alignLyrics(lyrics, vttItems) {
  const aligned = [];
  let vttIdx = 0;

  console.log(`\n--- 字幕のアライメント（同期）処理を開始します ---`);

  for (let i = 0; i < lyrics.length; i++) {
    const block = lyrics[i];
    const firstLine = block.eng.split('\n')[0];
    
    let bestMatchIdx = -1;
    let maxSim = 0.15; // 最低類似度しきい値

    // 現在のVTTインデックスから前後15行の範囲で、最も類似度の高いVTT行を探索する
    const startSearch = Math.max(0, vttIdx - 2);
    const endSearch = Math.min(vttItems.length, vttIdx + 15);

    for (let j = startSearch; j < endSearch; j++) {
      const sim = getSimilarity(firstLine, vttItems[j].text);
      if (sim > maxSim) {
        maxSim = sim;
        bestMatchIdx = j;
      }
    }

    if (bestMatchIdx !== -1) {
      vttIdx = bestMatchIdx;
      const start = vttItems[vttIdx].start;
      
      // ブロックの最後の行にマッチするVTTを探索し、終了時間を決定する
      const engLines = block.eng.split('\n');
      const lastLine = engLines[engLines.length - 1];
      let endVttIdx = vttIdx;
      let lastMaxSim = 0.15;

      const endSearchRange = Math.min(vttItems.length, vttIdx + engLines.length + 3);
      for (let j = vttIdx; j < endSearchRange; j++) {
        const sim = getSimilarity(lastLine, vttItems[j].text);
        if (sim > lastMaxSim) {
          lastMaxSim = sim;
          endVttIdx = j;
        }
      }

      vttIdx = endVttIdx;
      const end = vttItems[vttIdx].end;

      aligned.push({
        start,
        end,
        eng: block.eng.replace(/\n/g, ' '),
        jpn: block.jpn.replace(/\n/g, ' ')
      });
      
      vttIdx++; // 次の探索へ進む
    } else {
      // マッチしなかった場合は、前のブロックの終了時間から仮の時間を設定する
      const prevBlock = aligned[aligned.length - 1];
      const start = prevBlock ? prevBlock.end : '00:00:00.000';
      
      // 仮の長さ（文字数に応じた秒数、最低3秒）
      const seconds = Math.max(3, Math.ceil(block.eng.length * 0.1));
      const end = addSecondsToTimecode(start, seconds);

      aligned.push({
        start,
        end,
        eng: block.eng.replace(/\n/g, ' '),
        jpn: block.jpn.replace(/\n/g, ' '),
        isEstimated: true
      });
    }
  }

  // 重複時間（前ブロックの終了時間が次ブロックの開始時間より遅い場合）のトリミング調整
  for (let j = 0; j < aligned.length - 1; j++) {
    if (compareTimecode(aligned[j].end, aligned[j + 1].start) > 0) {
      aligned[j].end = aligned[j + 1].start;
    }
  }

  console.log(`-> アライメント完了: 全 ${lyrics.length} ブロック中、${aligned.filter(b => !b.isEstimated).length} ブロックの同期に成功。`);
  return aligned;
}

/**
 * 2つのタイムコード（hh:mm:ss.mmm）の前後関係を比較する
 * @param {string} t1 - 比較元のタイムコード
 * @param {string} t2 - 比較先のタイムコード
 * @returns {number} t1が遅い場合は正、早い場合は負、同じなら0
 */
function compareTimecode(t1, t2) {
  const toSec = (t) => {
    const parts = t.split(':');
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
  };
  return toSec(t1) - toSec(t2);
}

/**
 * タイムコード（hh:mm:ss.mmm）に秒数を加算する
 * @param {string} timecode - 加算元のタイムコード
 * @param {number} seconds - 加算する秒数
 * @returns {string} 加算後のタイムコード
 */
function addSecondsToTimecode(timecode, seconds) {
  const parts = timecode.split(':');
  if (parts.length < 3) return timecode;

  let hrs = parseInt(parts[0], 10);
  let mins = parseInt(parts[1], 10);
  let secs = parseFloat(parts[2]);

  secs += seconds;
  if (secs >= 60) {
    mins += Math.floor(secs / 60);
    secs = secs % 60;
  }
  if (mins >= 60) {
    hrs += Math.floor(mins / 60);
    mins = mins % 60;
  }

  const pad = (num, size = 2) => String(num).padStart(size, '0');
  const padMs = (num) => String(num.toFixed(3)).split('.')[1] || '000';

  return `${pad(hrs)}:${pad(mins)}:${pad(Math.floor(secs))}.${padMs(secs)}`;
}

/**
 * 同期した歌詞データから、FFmpegで焼き付けるためのASS字幕ファイルを生成する
 * @param {Array<object>} alignedLyrics - 同期済み歌詞
 * @param {string} outputPath - 出力先ASSファイルのパス
 */
function generateAssSubtitle(alignedLyrics, outputPath) {
  const assHeader = `[Script Info]
Title: Waxthink Short Video Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,32,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,10,10,250,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let events = '';

  for (const block of alignedLyrics) {
    // タイムコードのフォーマット変換 (00:00:00.000 -> 0:00:00.00)
    const formatTime = (t) => {
      const parts = t.split(':');
      const hr = parseInt(parts[0], 10);
      const min = parts[1];
      const sec = parseFloat(parts[2]).toFixed(2);
      return `${hr}:${min}:${sec.padStart(5, '0')}`;
    };

    const start = formatTime(block.start);
    const end = formatTime(block.end);

    // ASSの装飾タグを使い、英語を上（白・太字）、日本語を下（金/黄色・太字）に配置する
    const engPart = `{\\fs52\\c&HFFFFFF&\\3c&H000000&\\b1}${block.eng}`;
    const jpnPart = `{\\fs40\\c&H00FFFF&\\3c&H000000&\\b1}${block.jpn}`;
    const text = `${engPart}\\N${jpnPart}`;

    events += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`;
  }

  fs.writeFileSync(outputPath, assHeader + events, 'utf-8');
  console.log(`-> ASS字幕ファイルを生成しました: ${outputPath}`);
}

/**
 * ぼかし背景と字幕焼き付けを伴う9:16ショート動画をFFmpegで生成する
 * @param {object} params - 動画生成用パラメータ
 * @returns {string} 生成された動画ファイルのパス
 */
function generateVideo({ slug, type, videoPath, audioPath, assPath, startTime, duration }) {
  const videosDir = path.join(PROJECT_ROOT, 'public/videos');
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }

  const outputPath = path.join(videosDir, `${slug}-short.mp4`);
  console.log(`\n--- FFmpegによるショート動画生成を開始します ---`);
  console.log(`スタイル: ${type.toUpperCase()}`);
  console.log(`切り出し区間: ${startTime} から ${duration} 秒間`);

  let ffmpegCmd = '';

  // FFmpegフィルター内でのASSファイルパスのエスケープ処理
  const escapedAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');

  if (type === 'pv') {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`PV動画ファイルが見つかりません: ${videoPath}`);
    }

    // [bg] 1080x1920に引き伸ばしてぼかす、[fg] 横幅1080にリサイズ、中央に配置して重ね合わせ、字幕を焼き付ける
    const filter = `split[bg_tmp][fg_tmp];[bg_tmp]scale=1080:1920,boxblur=20:5[bg];[fg_tmp]scale=1080:-1[fg];[bg][fg]overlay=0:(H-h)/2,subtitles='${escapedAssPath}'`;

    ffmpegCmd = `ffmpeg -ss ${startTime} -t ${duration} -i "${videoPath}" -vf "${filter}" -c:v libx264 -crf 23 -c:a aac -b:a 192k -y "${outputPath}"`;
  } else {
    // ジャケット画像ベースの生成
    let coverPath = path.join(PROJECT_ROOT, 'public/images/covers', `${slug}.jpg`);
    
    // ジャケット画像がない場合のフォールバック（デフォルト画像）
    if (!fs.existsSync(coverPath)) {
      console.log(`[警告] 曲専用のジャケットが見つかりません。デフォルトのジャケットを探索します...`);
      const defaultCoverPath = path.join(PROJECT_ROOT, 'public/images/covers/default.jpg');
      if (fs.existsSync(defaultCoverPath)) {
        coverPath = defaultCoverPath;
      } else {
        // default.jpgも無ければ、プロジェクト内の他の画像を探索する
        const placeholderPath = path.join(PROJECT_ROOT, 'public/favicon.svg');
        if (fs.existsSync(placeholderPath)) {
          coverPath = placeholderPath;
        } else {
          throw new Error(`動画の背景にする画像が見つかりません。public/images/covers/${slug}.jpg を配置してください。`);
        }
      }
    }

    if (!fs.existsSync(audioPath)) {
      throw new Error(`音声ファイルが見つかりません: ${audioPath}`);
    }

    // ジャケット（正方形）をぼかし背景の中央上寄り（Y=450）にオーバーレイし、字幕を焼き付ける
    const filter = `split[bg_tmp][fg_tmp];[bg_tmp]scale=1080:1920,boxblur=20:5[bg];[fg_tmp]scale=800:800[fg];[bg][fg]overlay=(W-w)/2:450,subtitles='${escapedAssPath}'`;

    ffmpegCmd = `ffmpeg -ss ${startTime} -t ${duration} -loop 1 -i "${coverPath}" -i "${audioPath}" -vf "${filter}" -c:v libx264 -crf 23 -c:a aac -b:a 192k -shortest -y "${outputPath}"`;
  }

  console.log(`FFmpegを実行しています...`);
  execSync(ffmpegCmd, { stdio: 'inherit' });
  console.log(`-> ショート動画の生成に成功しました！: ${outputPath}`);

  return outputPath;
}

// ==========================================
// メイン処理の実行フロー
// ==========================================
async function main() {
  const args = process.argv.slice(2);
  const slugArg = args.find(a => !a.startsWith('-'));
  
  if (!slugArg) {
    console.log(`
使用方法:
  node agent/src/generate-short-video.mjs <slug> [オプション]

オプション:
  --type <pv|cover>   動画スタイル（デフォルト: pv。失敗時はcoverへ自動フォールバック）
  --start <hh:mm:ss>  切り出し開始時間（デフォルト: 00:00:30）
  --duration <秒数>    切り出し秒数（デフォルト: 30）

例:
  node agent/src/generate-short-video.mjs come-down --type cover --start 00:01:15 --duration 45
`);
    process.exit(1);
  }

  // オプション解析
  const getOpt = (opt) => {
    const idx = args.indexOf(opt);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  let type = getOpt('--type') || 'pv';
  const startTime = getOpt('--start') || '00:00:30';
  const duration = parseInt(getOpt('--duration') || '30', 10);

  console.log(`==========================================`);
  console.log(` ショート動画自動生成プロセスを開始します `);
  console.log(` 対象曲: ${slugArg}`);
  console.log(`==========================================`);

  try {
    // 1. Astroファイルのパース
    const songData = parseAstroFile(slugArg);
    console.log(`Astroファイルを解析しました。歌詞ブロック数: ${songData.lyrics.length}`);

    // 2. アセットのダウンロード
    let assets = null;
    let downloadFailed = false;

    if (songData.youtubeId) {
      try {
        assets = downloadAssets(songData.youtubeId);
      } catch (err) {
        console.error(`\n[エラー] アセットのダウンロードに失敗しました: ${err.message}`);
        downloadFailed = true;
      }
    } else {
      console.log(`\n[警告] Astroファイルに youtubeId が定義されていません。`);
      downloadFailed = true;
    }

    // PVタイプが指定されていてダウンロードが失敗した場合、自動的にジャケットベースに切り替える
    if (type === 'pv' && downloadFailed) {
      console.log(`\n[フォールバック] PV動画アセットの取得に失敗したため、ジャケット画像（COVER）ベースに切り替えます。`);
      type = 'cover';
    }

    // ジャケットベースで、かつ音声ダウンロードが失敗している場合のフォールバック（音声を再試行するか、エラーとするか）
    if (type === 'cover' && (!assets || !fs.existsSync(assets.audioPath))) {
      throw new Error(`音声アセットが存在しないため、ジャケット動画を作成できません。`);
    }

    // 3. 字幕のパースと同期（アライメント）
    let alignedLyrics = songData.lyrics;
    const tempAssPath = path.join(PROJECT_ROOT, 'agent/temp', `sub-${songData.youtubeId || slugArg}.ass`);

    if (assets && assets.subtitlePath) {
      const vttItems = parseVtt(assets.subtitlePath);
      console.log(`字幕ファイルをパースしました。行数: ${vttItems.length}`);
      
      // タイムスタンプとのアライメント
      alignedLyrics = alignLyrics(songData.lyrics, vttItems);
    } else {
      console.log(`\n[警告] 字幕ファイルが取得できなかったため、タイミングデータは仮設定（文字数換算の推定値）になります。`);
      // 全体が未同期としてアライメントを仮設定
      alignedLyrics = alignLyrics(songData.lyrics, []);
    }

    // 4. ASS字幕ファイルの生成
    generateAssSubtitle(alignedLyrics, tempAssPath);

    // 5. ショート動画のエンコード生成
    generateVideo({
      slug: slugArg,
      type,
      videoPath: assets ? assets.videoPath : null,
      audioPath: assets ? assets.audioPath : null,
      assPath: tempAssPath,
      startTime,
      duration
    });

    console.log(`\n==========================================`);
    console.log(` プロセスが正常に完了しました！ `);
    console.log(` 動画保存先: public/videos/${slugArg}-short.mp4`);
    console.log(`==========================================`);

  } catch (error) {
    console.error(`\n[致命的エラー] 処理が異常終了しました:`, error.message);
    process.exit(1);
  }
}

// 直接実行された場合はメイン処理を実行
if (process.argv[1] === __filename) {
  main();
}
