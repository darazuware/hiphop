interface Env {
  CONTACT_TO_EMAIL: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    const body = await request.formData();
    const name    = (body.get('name')    as string ?? '').trim();
    const email   = (body.get('email')   as string ?? '').trim();
    const message = (body.get('message') as string ?? '').trim();

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ ok: false, error: '必須項目が未入力です' }), { status: 400, headers });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ ok: false, error: 'メールアドレスの形式が正しくありません' }), { status: 400, headers });
    }

    const toEmail = env.CONTACT_TO_EMAIL ?? 'darazuware@gmail.com';

    const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: 'noreply@waxthink.com', name: 'WAX&INK Contact' },
        reply_to: { email, name },
        subject: `[WAX&INK] お問い合わせ: ${name}`,
        content: [{
          type: 'text/plain',
          value: `名前: ${name}\nメール: ${email}\n\n${message}`,
        }],
      }),
    });

    if (!res.ok && res.status !== 202) {
      return new Response(JSON.stringify({ ok: false, error: '送信に失敗しました。時間をおいて再度お試しください。' }), { status: 502, headers });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'サーバーエラーが発生しました' }), { status: 500, headers });
  }
};
