import { beforeAll, describe, expect, test } from 'vitest';
import { loadContent } from './setup.js';

let content;
let topics;

beforeAll(async () => {
  content = await loadContent('fa');
  topics = content.topics();
});

describe('merged topics', () => {
  test('keep the order of structure.json', () => {
    expect(topics.map((topic) => topic.id)).toEqual([
      'wohnsitz-anmelden',
      'aufenthalt-asyl',
      'jobcenter',
      'kita-schule',
      'gesundheit',
      'deutschkurs',
    ]);
  });

  test('carry the translated name and the German term side by side', () => {
    const wohnsitz = topics[0];
    expect(wohnsitz.name).toBe('ثبت محل سکونت');
    expect(wohnsitz.de).toBe('Wohnsitz anmelden');
    expect(wohnsitz.steps).toHaveLength(5);
    expect(wohnsitz.steps[1].de).toBe('Wohnungsgeberbestätigung vom Vermieter holen');
  });

  test('derive audio paths from language, topic and step', () => {
    const jobcenter = topics.find((topic) => topic.id === 'jobcenter');
    expect(jobcenter.audioFull).toBe('audio/fa/jobcenter/full.mp3');
    expect(jobcenter.steps[2].audio).toBe('audio/fa/jobcenter/step-3.mp3');
  });

  test('resolve the authority, or null where a topic has none', () => {
    expect(topics[0].authority.name).toBe('اداره‌ی شهروندی، شهر فرایزینگ');
    expect(topics[0].authority.verified).toBe(false);
    expect(topics.find((topic) => topic.id === 'gesundheit').authority).toBeNull();
  });

  test('every step of every topic is translated', () => {
    for (const topic of topics) {
      for (const step of topic.steps) {
        expect(step.text, `${topic.id} step ${step.id}`).not.toBe(step.de);
      }
    }
  });
});

describe('t()', () => {
  test('substitutes placeholders', () => {
    expect(content.t('clarify_between', { options: 'الف' })).toBe('منظورتان الف است؟');
  });

  test('returns the key itself when a string is missing', () => {
    expect(content.t('gibt_es_nicht')).toBe('gibt_es_nicht');
  });
});
