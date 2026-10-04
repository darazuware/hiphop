// Vercel Serverless Function。Resend経由で運営者へ通知メールを送る。
// 環境変数: RESEND_API_KEY（必須）, CONTACT_TO_EMAIL（任意・既定 darazuware@gmail.com）, CONTACT_FROM_EMAIL（任意・既定 onboarding@resend.dev）

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    res.status(500).json({ ok: false, error: '送信設定が未完了です。しばらくしてからお試しください。' });
    return;
  }
  const { name = '', email = '', message = '' } = req.body ?? {};
  const n = String(name).trim().slice(0, 100);
  const e = String(email).trim().slice(0, 200);
  const m = String(message).trim().slice(0, 5000);
  if (!n || !e || !m) {
    res.status(400).json({ ok: false, error: '必須項目が未入力です' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    res.status(400).json({ ok: false, error: 'メールアドレスの形式が正しくありません' });
    return;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM_EMAIL ?? 'WAX&THINK <onboarding@resend.dev>',
        to: [process.env.CONTACT_TO_EMAIL ?? 'darazuware@gmail.com'],
        reply_to: e,
        subject: `[WAX&THINK] お問い合わせ: ${n}`.replace(/[\r\n]/g, ' '),
        text: `名前: ${n}\nメール: ${e}\n\n${m}`,
      }),
    });
    if (!r.ok) {
      res.status(502).json({ ok: false, error: '送信に失敗しました。時間をおいて再度お試しください。' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: 'サーバーエラーが発生しました' });
  }
}
