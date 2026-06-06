// Voice -> category routing. One interface, two backends.
//
//   route(transcript, topics) -> { slug, confidence, clarify }
//     slug:       matched topic id, or null when unresolved
//     confidence: 0..1 (rough; mock backend)
//     clarify:    Farsi question to speak back, or null
//
// MODE 'mock'  : client-side keyword matcher. No secrets, works offline.
// MODE 'proxy' : POST to a serverless function that holds the Anthropic key
//                and asks Claude Haiku to pick a slug. Same return shape, so
//                swapping is a one-line config change. Stub lives in proxy/.

export const ROUTER_MODE = 'mock'; // 'mock' | 'proxy'
export const PROXY_ENDPOINT = '/api/route';

const CLARIFY_NONE = 'متوجه نشدم. لطفاً دوباره بگویید یا روی یکی از دکمه‌ها بزنید.';

function clarifyBetween(topics) {
  const names = topics.map((t) => t.fa).join(' یا ');
  return `منظورتان ${names} است؟`;
}

// Normalize Farsi/Arabic variants so "ی/ي" and "ک/ك" match, drop diacritics.
function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/ي/g, 'ی') // Arabic yeh -> Farsi yeh
    .replace(/ك/g, 'ک') // Arabic kaf -> Farsi keheh
    .replace(/[ً-ْ]/g, '') // harakat/diacritics
    .replace(/‌/g, ' ') // ZWNJ -> space
    .trim();
}

function scoreTopic(transcript, topic) {
  const hay = normalize(transcript);
  let hits = 0;
  for (const kw of topic.keywords || []) {
    if (hay.includes(normalize(kw))) hits += 1;
  }
  return hits;
}

function routeMock(transcript, topics) {
  const scored = topics
    .map((t) => ({ topic: t, score: scoreTopic(transcript, t) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];

  if (!best || best.score === 0) {
    return { slug: null, confidence: 0, clarify: CLARIFY_NONE };
  }

  // Ambiguous: top two tied on a positive score -> ask which one.
  if (second && second.score === best.score) {
    return {
      slug: null,
      confidence: 0.5,
      clarify: clarifyBetween([best.topic, second.topic]),
    };
  }

  const confidence = Math.min(1, 0.5 + best.score * 0.25);
  return { slug: best.topic.id, confidence, clarify: null };
}

async function routeProxy(transcript, topics) {
  try {
    const res = await fetch(PROXY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript,
        slugs: topics.map((t) => ({ id: t.id, fa: t.fa, de: t.de })),
      }),
    });
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    return await res.json(); // { slug, confidence, clarify }
  } catch (err) {
    // Network/key failure must never strand the user: fall back to mock.
    console.warn('[router] proxy failed, falling back to mock:', err);
    return routeMock(transcript, topics);
  }
}

export function route(transcript, topics) {
  if (ROUTER_MODE === 'proxy') return routeProxy(transcript, topics);
  return Promise.resolve(routeMock(transcript, topics));
}
