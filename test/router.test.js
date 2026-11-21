// What the offline keyword matcher does today, pinned down before the refactor.
//
// Two groups. The first is the contract: these must keep working. The second
// records sentences the matcher gets wrong or cannot place — written the way
// someone would say them, not the way an office would name them. They are the
// measure for any better router: a group-two sentence that starts routing
// correctly moves up into group one.

import { beforeAll, describe, expect, test } from 'vitest';
import { loadContent } from './setup.js';
import { route } from '../src/router.ts';

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
  test('no keyword: no slug, a spoken prompt to try again', async () => {
    const result = await route('سلام', topics);
    expect(result.slug).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.clarify).toBeTruthy();
  });

  test('a tie names both candidates', async () => {
    const result = await route('کار و مدرسه', topics);
    expect(result.slug).toBeNull();
    expect(result.clarify).toContain('کار و کمک‌هزینه');
    expect(result.clarify).toContain('مهدکودک و مدرسه');
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
