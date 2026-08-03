// Voice -> topic routing. One interface, two backends.
//
//   route(transcript, topics) -> { slug, confidence, clarify }
//
// mock  : client-side keyword matcher. No secrets, works offline. Default.
// proxy : POST to a serverless endpoint holding the API key. Same shape, so
//         switching is a config change in data/structure.json, not a code edit.
//
// Any proxy failure falls back to mock. Routing must never dead-end.

import { meta, t } from './content.js';

const PROXY_ENDPOINT = 'api/route.php';

// Combining marks: Latin diacritics, Arabic harakat, superscript alef.
// Written out rather than \p{M} so the module still parses on the old Chrome
// builds this audience's phones actually run.
const MARKS = /[̀-ͯؐ-ًؚ-ٰٟۖ-ۭ]/g;

function normalize(text, equivalents) {
  let s = (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(MARKS, '')
    .replace(/‌/g, ' ') // ZWNJ reads as a word break for matching
    .replace(/\s+/g, ' ')
    .trim();
  for (const [from, to] of equivalents) s = s.split(from).join(to);
  return s;
}

function scoreTopic(haystack, topic, equivalents) {
  let hits = 0;
  for (const kw of topic.keywords) {
    if (haystack.includes(normalize(kw, equivalents))) hits += 1;
  }
  return hits;
}

function routeMock(transcript, topics) {
  const { equivalents } = meta();
  const hay = normalize(transcript, equivalents);

  const scored = topics
    .map((topic) => ({ topic, score: scoreTopic(hay, topic, equivalents) }))
    .sort((a, b) => b.score - a.score);

  const [best, second] = scored;

  if (!best || best.score === 0) {
    return { slug: null, confidence: 0, clarify: t('no_match') };
  }

  // Top two tied on a positive score -> ask which one rather than guessing.
  if (second && second.score === best.score) {
    const options = [best.topic.name, second.topic.name].join(t('clarify_or'));
    return { slug: null, confidence: 0.5, clarify: t('clarify_between', { options }) };
  }

  return {
    slug: best.topic.id,
    confidence: Math.min(1, 0.5 + best.score * 0.25),
    clarify: null,
  };
}

async function routeProxy(transcript, topics) {
  try {
    const res = await fetch(PROXY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript,
        lang: meta().code,
        slugs: topics.map((topic) => ({ id: topic.id, name: topic.name, de: topic.de })),
      }),
    });
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[router] proxy failed, falling back to mock:', err);
    return routeMock(transcript, topics);
  }
}

export function route(transcript, topics) {
  if (meta().routerMode === 'proxy') return routeProxy(transcript, topics);
  return Promise.resolve(routeMock(transcript, topics));
}
