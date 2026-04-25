import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

async function tryModel(client: GoogleGenAI, model: string) {
  const t0 = Date.now();
  try {
    const res = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Reply with exactly: PONG' }],
        },
      ],
    });
    const ms = Date.now() - t0;
    return { model, ok: true, ms, text: (res.text ?? '').trim() };
  } catch (err: any) {
    let snippet = err?.message ?? String(err);
    try {
      const parsed = JSON.parse(snippet);
      snippet = `${parsed?.error?.code} ${parsed?.error?.status} — ${parsed?.error?.message?.split('\n')[0]}`;
    } catch {
      snippet = snippet.slice(0, 200);
    }
    return { model, ok: false, snippet };
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY missing in env');
    process.exit(1);
  }
  const client = new GoogleGenAI({ apiKey });
  console.log(`Testing key ${apiKey.slice(0, 6)}… across ${MODELS.length} models\n`);
  for (const m of MODELS) {
    const r = await tryModel(client, m);
    if (r.ok) {
      console.log(`OK    ${r.model.padEnd(28)}  ${r.ms}ms  → ${r.text}`);
    } else {
      console.log(`FAIL  ${r.model.padEnd(28)}  ${r.snippet}`);
    }
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
