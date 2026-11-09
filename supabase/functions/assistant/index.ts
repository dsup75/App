// DeepBoost Life — AI assistant (Supabase Edge Function, Deno)
//
// Key: each user pastes their Gemini key in the app (Settings → AI Assistant). It is stored encrypted
// in Supabase Vault and read here with the service role. A project-wide GEMINI_API_KEY secret, if set,
// is used instead. Optional secret: GEMINI_MODEL (default below).
//
// The app sends the signed-in user's own data summary (already filtered by
// Row Level Security). The key never reaches the phone. The assistant only
// answers — it never changes data.

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';
const ENV_KEY = Deno.env.get('GEMINI_API_KEY');
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** The key the signed-in user saved in the app (encrypted in Vault), or the project secret. Never sent back. */
async function keyFor(req: Request): Promise<string | null> {
  if (ENV_KEY) return ENV_KEY;
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ') || !SB_URL || !SERVICE) return null;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { authorization: auth, apikey: SERVICE } });
  if (!u.ok) return null;
  const user = await u.json();
  if (!user?.id) return null;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/ai_key_for_user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
    body: JSON.stringify({ p_user: user.id }),
  });
  if (!r.ok) return null;
  const k = await r.json();
  return typeof k === 'string' && k.length > 10 ? k : null;
}


const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM = `You are the assistant inside "DeepBoost Life", a personal app for money, study (Class 12 / JEE), tasks and a digital-marketing business.
Rules:
- Use ONLY the JSON data provided. Never invent amounts, names, dates or results. If the data does not contain the answer, say so.
- Amounts in the data are in paise; show them as Indian rupees (₹1,23,456.78).
- You cannot create, edit or delete anything. If the user asks for an action, tell them which screen to use.
- Reply in the language the user writes in (English or simple Hinglish). Be short and practical; use bullet points for lists.
- For plans (study plan, proposal), base them on the user's real data and clearly mark assumptions.`;

const EXTRACT = `Extract ONE money transaction from the user's text and/or image (UPI screenshot, bank SMS, bill or receipt).
Return ONLY JSON with these keys:
{"type":"income"|"expense"|"transfer","title":string,"amount":number (rupees),"date":"YYYY-MM-DD"|null,"time":"HH:MM" (24h)|null,
 "app":"gpay"|"phonepe"|"paytm"|"bhim"|"amazonpay"|"cred"|"netbanking"|"card"|"cash"|"other"|null,
 "party":string|null (who paid me, or whom I paid),"reference":string|null (UTR / transaction id),
 "mode":"personal"|"business","notes":string|null}
Rules: use only what is visible or written; never guess an amount; if a value is missing use null.
"Paid to"/"Sent"/"Debited" = expense. "Received from"/"Credited" = income. title = short purpose or the other party.`;

async function extract(KEY: string, text: string, image?: { base64: string; mime: string }) {
  const parts: unknown[] = [];
  if (image?.base64) parts.push({ inline_data: { mime_type: image.mime || 'image/jpeg', data: image.base64 } });
  parts.push({ text: `Today is ${new Date().toISOString().slice(0, 10)}.\n${text || '(see image)'}` });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: EXTRACT }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 600 },
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message ?? 'AI request failed.');
  const raw = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '{}';
  return JSON.parse(raw.replace(/^```json|```$/g, '').trim());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    // Connection test from Settings → AI Assistant (never calls Gemini, never returns the key)
    const KEY = await keyFor(req);
    if (body?.mode === 'ping') return Response.json({ ok: true, key: Boolean(KEY), model: MODEL }, { headers: cors });
    if (!KEY) {
      return Response.json({ error: 'No Gemini API key yet. Add it in Settings → AI Assistant.' }, { status: 400, headers: cors });
    }
    if (body?.mode === 'extract') {
      if ((body.image?.base64?.length ?? 0) > 4_000_000) return Response.json({ error: 'Image too large.' }, { status: 400, headers: cors });
      const draft = await extract(KEY, String(body.text ?? '').slice(0, 3000), body.image);
      return Response.json({ draft }, { headers: cors });
    }
    const { question, context, history } = body;
    if (!question || typeof question !== 'string' || question.length > 2000) {
      return Response.json({ error: 'Invalid question.' }, { status: 400, headers: cors });
    }
    const ctx = JSON.stringify(context ?? {}).slice(0, 60000);
    const past = Array.isArray(history) ? history.slice(-6) : [];
    const contents = [
      ...past.map((m: { role: string; text: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.text).slice(0, 4000) }],
      })),
      { role: 'user', parts: [{ text: `My data (JSON):\n${ctx}\n\nQuestion: ${question}` }] },
    ];
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      return Response.json({ error: data?.error?.message ?? 'AI request failed.' }, { status: 502, headers: cors });
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    return Response.json({ answer: text || 'No answer.' }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: cors });
  }
});
