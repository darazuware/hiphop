/**
 * Telegram Bot API — ポーリング・通知・メッセージパース
 *
 * getUpdates でメッセージを取得し、
 * "アーティスト名 - 曲名 [年]" 形式をパースする。
 */

const BASE_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

/**
 * Telegram Bot API に GET リクエストを送信する
 * @param {string} method - APIメソッド名
 * @param {Record<string, any>} params - クエリパラメータ
 * @returns {Promise<any>} APIレスポンスの result フィールド
 */
async function callApi(method, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  }
  const url = `${BASE_URL}/${method}?${query}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram API エラー: ${data.description}`);
  }
  return data.result;
}

/**
 * 新しいメッセージを取得する
 * @param {number} offset - 次の update_id
 * @returns {Promise<Array>} update 配列
 */
export async function getUpdates(offset) {
  return callApi('getUpdates', {
    offset,
    timeout: 10,
    allowed_updates: JSON.stringify(['message']),
  });
}

/**
 * テキストメッセージを送信する
 * @param {string} text - 送信テキスト
 * @param {string|number} chatId - 送信先 Chat ID（省略時は環境変数）
 * @returns {Promise<any>}
 */
function escapeMd(text) {
  // Markdown V1 の特殊文字（_ * ` [ ]）をエスケープ。意図的なMarkdown記法は壊さない最小限対応。
  return String(text).replace(/[_*`\[\]]/g, '\\$&');
}

export async function sendMessage(text, chatId, { safe = false } = {}) {
  const targetChat = chatId || process.env.TELEGRAM_CHAT_ID;
  return callApi('sendMessage', {
    chat_id: targetChat,
    text: safe ? escapeMd(text) : text,
    parse_mode: 'Markdown',
  });
}

/**
 * メッセージテキストを解析する（複数曲対応）
 *
 * 対応形式:
 *   "Nas - N.Y. State of Mind [1994]"
 *   複数行の場合:
 *     Nas - N.Y. State of Mind [1994]
 *     Wu-Tang Clan - C.R.E.A.M. [1993]
 *
 * @param {string} text - 受信メッセージ
 * @returns {Array<{ artist: string, title: string, year: number|null }> | null}
 */
export function parseMessage(text) {
  if (!text || typeof text !== 'string') return null;

  const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return null;

  const songs = [];
  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed) songs.push(parsed);
  }

  return songs.length > 0 ? songs : null;
}

/**
 * 1行をパースして { artist, title, year } を返す。
 * 以下の形式に対応:
 *   "Nas - N.Y. State of Mind [1994]"   ← 標準
 *   "fugees-fu gee la"                   ← スペースなしダッシュ
 *   "Nas - NY State of Mind"             ← 年なし
 *   "Nas/NY State of Mind [1994]"        ← スラッシュ区切り
 *   "Nas: NY State of Mind"              ← コロン区切り
 */
function parseLine(line) {
  // 年を先に抽出（末尾の [YYYY] または (YYYY)）
  const yearMatch = line.match(/[\[(](\d{4})[\])]\s*$/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  const withoutYear = yearMatch ? line.slice(0, yearMatch.index).trim() : line.trim();

  // 区切り文字を順に試す: " - " → " / " → ":" → 最初の "-"
  const separators = [' - ', ' – ', ' — ', ' / ', ': '];
  for (const sep of separators) {
    const idx = withoutYear.indexOf(sep);
    if (idx > 0) {
      const artist = withoutYear.slice(0, idx).trim();
      const title = withoutYear.slice(idx + sep.length).trim();
      if (artist && title) return { artist, title, year };
    }
  }

  // 最後の手段: 最初の "-" で分割（"fugees-fu gee la" 対応）
  const dashIdx = withoutYear.indexOf('-');
  if (dashIdx > 0) {
    const artist = withoutYear.slice(0, dashIdx).trim();
    const title = withoutYear.slice(dashIdx + 1).trim();
    if (artist && title) return { artist, title, year };
  }

  return null;
}
