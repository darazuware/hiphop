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
 * メッセージテキストを解析する
 *
 * 対応形式:
 *   "Nas - N.Y. State of Mind [1994]"
 *   "Wu-Tang Clan - C.R.E.A.M. [1993]"
 *   "Nas - N.Y. State of Mind"  (年なし)
 *
 * @param {string} text - 受信メッセージ
 * @returns {{ artist: string, title: string, year: number|null } | null}
 */
export function parseMessage(text) {
  if (!text || typeof text !== 'string') return null;

  // "アーティスト - 曲名 [年]" または "アーティスト - 曲名"
  const match = text.trim().match(/^(.+?)\s*[-–—]\s*(.+?)(?:\s*\[(\d{4})\])?\s*$/);
  if (!match) return null;

  const artist = match[1].trim();
  const title = match[2].trim();
  const year = match[3] ? parseInt(match[3], 10) : null;

  if (!artist || !title) return null;

  return { artist, title, year };
}
