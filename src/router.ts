// Voice -> topic routing. One interface, two backends.
//
//   route(transcript, topics) -> { slug, confidence, clarify }
//
// mock  : client-side keyword matcher. No secrets, works offline. Default.
// proxy : POST to a serverless endpoint holding the API key. Same shape, so
//         switching is a config change in data/structure.json, not a code edit.
//
// Any proxy failure — offline, slow, over its limit, not configured — falls
// back to mock. Routing must never dead-end.

import { meta, t, type Topic } from './content.ts';

type Equivalents = [string, string][];

export interface RouteResult {
  slug: string | null;
  confidence: number;
  clarify: string | null;
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
    return { slug: null, confidence: 0, clarify: t('no_match'), trace: { ...trace, reason: 'no keyword matched' } };
  }

  // Top two tied on a positive score -> ask which one rather than guessing.
  if (second && second.score === best.score) {
    const options = [best.topic.name, second.topic.name].join(t('clarify_or'));
    return {
      slug: null,
      confidence: 0.5,
      clarify: t('clarify_between', { options }),
      trace: { ...trace, reason: `tie: ${best.topic.id} vs ${second.topic.id}` },
    };
  }

  return {
    slug: best.topic.id,
    confidence: Math.min(1, 0.5 + best.score * 0.25),
    clarify: null,
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
    if (result.slug && !topics.some((topic) => topic.id === result.slug)) {
      throw new Error(`proxy named an unknown topic: ${result.slug}`);
    }
    return {
      slug: result.slug ?? null,
      confidence: result.confidence ?? 0,
      clarify: result.clarify ?? null,
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

export function route(transcript: string, topics: Topic[]): Promise<RouteResult> {
  if (meta().routerMode === 'proxy') return routeProxy(transcript, topics);
  return Promise.resolve(routeMock(transcript, topics));
}
