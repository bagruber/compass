// Voice -> topic routing. One interface, two backends.
//
//   route(transcript, topics) -> { slug, confidence, options }
//
// mock  : client-side keyword matcher. No secrets, works offline. Default.
// proxy : POST to a serverless endpoint holding the API key. Same shape, so
//         switching is a config change in content/base.json, not a code edit.
//
// Neither backend writes text. When a phrase could mean two topics, the
// result names both and the app asks with its own fixed words — so every
// sentence the user meets has been written and checked beforehand.
//
// Any proxy failure — offline, slow, over its limit, not configured — falls
// back to mock. Routing must never dead-end.

import { meta, t, type Topic } from './content.ts';

type Equivalents = [string, string][];

export interface RouteResult {
  slug: string | null;
  confidence: number;
  options: string[]; // two topic ids to choose between, or none
  trace: {
    mode: 'mock' | 'proxy';
    reason: string;
    normalized?: string;
    scores: { id: string; name: string; score: number; hits: string[] }[];
  };
}

const PROXY_ENDPOINT = 'api/route.php';
const PROXY_TIMEOUT = 6000; // then the offline matcher answers instead

// Combining marks: Latin diacritics, Arabic harakat, superscript alef.
// Written out rather than \p{M} so the module still parses on the old Chrome
// builds this audience's phones actually run.
const MARKS = /[̀-ͯؐ-ًؚ-ٰٟۖ-ۭ]/g;

function normalize(text: string, equivalents: Equivalents) {
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

function scoreTopic(haystack: string, topic: Topic, equivalents: Equivalents) {
  const hits = topic.keywords.filter((kw) => haystack.includes(normalize(kw, equivalents)));
  return { score: hits.length, hits };
}

function routeMock(transcript: string, topics: Topic[]): RouteResult {
  const { equivalents } = meta();
  const hay = normalize(transcript, equivalents);

  const scored = topics
    .map((topic) => ({ topic, ...scoreTopic(hay, topic, equivalents) }))
    .sort((a, b) => b.score - a.score);

  const [best, second] = scored;

  // Every branch carries a trace of how it decided. Cheap to build (the scores
  // already exist) and the only way to tell a wrong keyword list from a wrong
  // transcript when a test phrase routes somewhere surprising.
  const trace = {
    mode: 'mock' as const,
    normalized: hay,
    scores: scored.map(({ topic, score, hits }) => ({
      id: topic.id,
      name: topic.name,
      score,
      hits,
    })),
  };

  if (!best || best.score === 0) {
    return { slug: null, confidence: 0, options: [], trace: { ...trace, reason: 'no keyword matched' } };
  }

  // Top two tied on a positive score -> ask which one rather than guessing.
  if (second && second.score === best.score) {
    return {
      slug: null,
      confidence: 0.5,
      options: [best.topic.id, second.topic.id],
      trace: { ...trace, reason: `tie: ${best.topic.id} vs ${second.topic.id}` },
    };
  }

  return {
    slug: best.topic.id,
    confidence: Math.min(1, 0.5 + best.score * 0.25),
    options: [],
    trace: { ...trace, reason: `${best.topic.id} led with ${best.score}` },
  };
}

async function routeProxy(transcript: string, topics: Topic[]): Promise<RouteResult> {
  // Aborted by hand: AbortSignal.timeout is missing on the old Chrome builds
  // this audience's phones run.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PROXY_TIMEOUT);

  try {
    const res = await fetch(PROXY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Only what was said and in which language. The proxy reads the topics
      // from the same data files the app does.
      body: JSON.stringify({ transcript, lang: meta().code }),
      signal: abort.signal,
    });
    if (!res.ok) throw new Error(`proxy ${res.status}`);

    const result = await res.json();
    const options: string[] = result.options ?? [];
    for (const id of [result.slug, ...options]) {
      if (id && !topics.some((topic) => topic.id === id)) throw new Error(`proxy named an unknown topic: ${id}`);
    }
    return {
      slug: result.slug ?? null,
      confidence: result.confidence ?? 0,
      options,
      // The proxy decides server-side, so there is no local scoring to show.
      trace: { mode: 'proxy', reason: 'decided by the model', scores: [] },
    };
  } catch (err) {
    console.warn('[router] proxy failed, falling back to mock:', err);
    return routeMock(transcript, topics);
  } finally {
    clearTimeout(timer);
  }
}

// "Do you mean A or B?", put together from the language file.
export function question(options: string[], topics: Topic[]) {
  const names = options.map((id) => topics.find((topic) => topic.id === id)!.name);
  return t('clarify_between', { options: names.join(t('clarify_or')) });
}

export function route(transcript: string, topics: Topic[]): Promise<RouteResult> {
  if (meta().routerMode === 'proxy') return routeProxy(transcript, topics);
  return Promise.resolve(routeMock(transcript, topics));
}
