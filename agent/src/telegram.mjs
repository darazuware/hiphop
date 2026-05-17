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
export async function sendMessage(text, chatId) {
  const targetChat = chatId || process.env.TELEGRAM_CHAT_ID;
  return callApi('sendMessage', {
    chat_id: targetChat,
    text,
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

  // 改行で分割
  const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return null;

  const songs = [];
  for (const line of lines) {
    // 最後の " - " を区切り文字として使う
    // 例: "Nas - N.Y. State of Mind [1994]" → "Nas" と "N.Y. State of Mind [1994]"
    const lastDashIndex = line.lastIndexOf(' - ');
    if (lastDashIndex === -1) continue; // " - " が見つからない場合はスキップ

    const artist = line.substring(0, lastDashIndex).trim();
    const rest = line.substring(lastDashIndex + 3).trim();
    
    if (!artist || !rest) continue;

    // rest から年を抽出（[YYYY] の形式）
    const yearMatch = rest.match(/\[(\d{4})\]$/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const title = yearMatch ? rest.substring(0, rest.lastIndexOf('[')).trim() : rest;

    if (artist && title) {
      songs.push({ artist, title, year });
    }
  }

  return songs.length > 0 ? songs : null;
}
