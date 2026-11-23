// What the offline keyword matcher does today, pinned down before the refactor.
//
// Two groups. The first is the contract: these must keep working. The second
// records sentences the matcher gets wrong or cannot place — written the way
// someone would say them, not the way an office would name them. They are the
// measure for any better router: a group-two sentence that starts routing
// correctly moves up into group one.

import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadContent, staticFiles } from './setup.js';
import { question, route } from '../src/router.ts';

let topics;

beforeAll(async () => {
  topics = (await loadContent('fa')).topics();
});

const slug = async (phrase) => (await route(phrase, topics)).slug;

describe('routes by keyword', () => {
  test.each([
    ['می‌خواهم آدرس خانه را ثبت کنم', 'wohnsitz-anmelden'],
    ['Anmeldung', 'wohnsitz-anmelden'],
    ['پناهندگی', 'aufenthalt-asyl'],
    ['Ausländerbehörde', 'aufenthalt-asyl'],
    ['یوب سنتر', 'jobcenter'],
    ['Bürgergeld', 'jobcenter'],
    ['مدرسه برای بچه', 'kita-schule'],
    ['دکتر', 'gesundheit'],
    ['کلاس زبان آلمانی', 'deutschkurs'],
  ])('%s -> %s', async (phrase, expected) => {
    expect(await slug(phrase)).toBe(expected);
  });

  test('Arabic and Persian letter forms match each other', async () => {
    // ك and ي are the Arabic keyboard's letters; the keywords use ک and ی.
    expect(await slug('دكتر')).toBe('gesundheit');
    expect(await slug('پناهندگي')).toBe('aufenthalt-asyl');
  });

  test('ZWNJ and a plain space are the same word break', async () => {
    expect(await slug('یوب‌سنتر')).toBe('jobcenter');
  });
});

describe('asks instead of guessing', () => {
  test('no keyword: no slug and nothing to choose from', async () => {
    const result = await route('سلام', topics);
    expect(result.slug).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.options).toEqual([]);
  });

  test('a tie names both candidates', async () => {
    const result = await route('کار و مدرسه', topics);
    expect(result.slug).toBeNull();
    expect(result.options).toEqual(['jobcenter', 'kita-schule']);
  });

  test('the question comes from the language file, with both names in it', () => {
    const asked = question(['jobcenter', 'kita-schule'], topics);
    expect(asked).toBe('منظورتان کار و کمک‌هزینه یا مهدکودک و مدرسه است؟');
  });
});

describe('where keywords run out', () => {
  // Said as a situation, with no keyword in it.
  test.each([
    ['دخترم بعد از مدرسه تنها به خانه می‌آید', 'kita-schule'],
    ['نامه‌ای از اداره آمده و نمی‌فهمم', null],
    ['دندانم درد می‌کند', 'gesundheit'],
    ['اجاره‌ام خیلی زیاد است', null],
  ])('%s', async (phrase, wanted) => {
    const result = await route(phrase, topics);
    expect({ phrase, got: result.slug, wanted }).toMatchSnapshot();
  });

  // Substring matching: کار ("work") is inside کارت ("card"), so the sentence
  // scores for jobcenter as well and ends in a tie.
  test('a health-insurance card also counts as a question about work', async () => {
    const result = await route('کارت بیمه ندارم', topics);
    expect({ got: result.slug, wanted: 'gesundheit' }).toMatchSnapshot();
  });
});

// structure.json sets router_mode to "proxy", so every test above already ran
// through the fallback: the proxy answered 503 and the keyword matcher took
// over. These look at the proxy path itself.
describe('with the proxy', () => {
  afterEach(() => {
    globalThis.fetch = staticFiles;
    vi.useRealTimers();
  });

  const proxy = (answer) => {
    const calls = [];
    globalThis.fetch = async (path, init) => {
      calls.push({ path, body: JSON.parse(init.body) });
      return typeof answer === 'function' ? answer(init) : answer;
    };
    return calls;
  };
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });

  test('its answer is used, even where no keyword would match', async () => {
    const calls = proxy(ok({ slug: 'gesundheit', confidence: 0.9, options: [] }));
    const result = await route('دندانم درد می‌کند', topics);

    expect(result.slug).toBe('gesundheit');
    expect(result.trace.mode).toBe('proxy');
    expect(calls).toEqual([{ path: 'api/route.php', body: { transcript: 'دندانم درد می‌کند', lang: 'fa' } }]);
  });

  test('its two candidates are passed on', async () => {
    proxy(ok({ slug: null, confidence: 0.5, options: ['gesundheit', 'jobcenter'] }));
    const result = await route('کارت بیمه ندارم', topics);
    expect(result).toMatchObject({ slug: null, options: ['gesundheit', 'jobcenter'] });
  });

  test.each([
    ['an error status', { ok: false, status: 429 }],
    ['a topic the app does not have', ok({ slug: 'wohngeld', confidence: 0.9, options: [] })],
    ['a candidate the app does not have', ok({ slug: null, confidence: 0.5, options: ['gesundheit', 'wohngeld'] })],
  ])('%s falls back to the keyword matcher', async (_name, answer) => {
    proxy(answer);
    const result = await route('دکتر', topics);
    expect(result.slug).toBe('gesundheit');
    expect(result.trace.mode).toBe('mock');
  });

  test('no answer within six seconds falls back as well', async () => {
    vi.useFakeTimers();
    proxy(
      (init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const pending = route('دکتر', topics);
    await vi.advanceTimersByTimeAsync(6000);
    const result = await pending;
    expect(result.slug).toBe('gesundheit');
    expect(result.trace.mode).toBe('mock');
  });
});
