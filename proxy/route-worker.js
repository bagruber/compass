// Cloudflare Worker — intent-routing proxy (STUB, not deployed).
//
// The static PWA cannot hold the Anthropic key. This Worker is the "proxy"
// half of the mock+proxy design: deploy it, set ROUTER_MODE='proxy' and
// PROXY_ENDPOINT in js/router.js, and routing upgrades from keyword matching
// to Claude Haiku — same { slug, confidence, clarify } contract, no client
// changes. Until deployed, the app runs entirely on the mock router.
//
// Deploy: `wrangler deploy`, with ANTHROPIC_API_KEY set as a Worker secret.

const MODEL = 'claude-haiku-4-5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SYSTEM = `You route a spoken Farsi/Dari phrase to exactly one help category for newcomers in Freising, Germany.
You ONLY pick a slug from the provided list — you never answer the question or invent content.
If the phrase clearly matches one category, return its slug with clarify=null.
If it is ambiguous or matches none, return slug=null and a short Farsi clarifying question in "clarify".`;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }

    const { transcript, slugs } = await request.json();
    if (!transcript || !Array.isArray(slugs)) {
      return json({ error: 'transcript and slugs required' }, 400);
    }

    const catalogue = slugs.map((s) => `- ${s.id}: ${s.fa} (${s.de})`).join('\n');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 256,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Categories:\n${catalogue}\n\nUser said: "${transcript}"`,
          },
        ],
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                slug: { type: ['string', 'null'] },
                clarify: { type: ['string', 'null'] },
              },
              required: ['slug', 'clarify'],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (!res.ok) return json({ error: `anthropic ${res.status}` }, 502);

    const data = await res.json();
    const text = data.content.find((b) => b.type === 'text')?.text ?? '{}';
    const parsed = JSON.parse(text); // { slug, clarify }

    return json({
      slug: parsed.slug,
      confidence: parsed.slug ? 0.9 : 0,
      clarify: parsed.clarify,
    });
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
