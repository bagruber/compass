// The step from Markdown to the JSON the app reads. What matters here is that
// a mistake in the content stops the build and says which file it is in.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { compile } from '../tools/build_content.mjs';

const content = join(import.meta.dirname, '..', 'content');

const base = {
  county: 'Freising',
  languages: [{ code: 'fa', name: 'فارسی', dir: 'rtl', stt: 'fa-IR' }],
  authorities: { wohngeldstelle: { de: 'Wohngeldstelle', icon: '🏛️', maps_query: 'Wohngeldstelle' } },
  topics: ['wohngeld'],
};
const german = `---
icon: 💶
authority: wohngeldstelle
urgency: high
---

# Wohngeld

## Frist

Gilt ab dem Monat,
in dem der Antrag ankommt

## Schritte

1. Antrag holen
2. Antrag abgeben
`;
const farsi = `# کمک‌هزینه‌ی مسکن

## Frist

از ماه درخواست

## Schritte

1. گرفتن فرم
2. تحویل فرم

## Stichwörter

- اجاره
- wohngeld
`;
const build = (files, changes = {}) => compile({ base: { ...base, ...changes }, packs: { fa: { ui: {} } }, files });

test('a case and its translation become one topic in each file', () => {
  const { structure, packs } = build({ 'wohngeld.md': german, 'wohngeld.fa.md': farsi });

  expect(structure.topics).toEqual([
    {
      id: 'wohngeld',
      icon: '💶',
      de: 'Wohngeld',
      authority: 'wohngeldstelle',
      urgency: 'high',
      deadline_de: 'Gilt ab dem Monat, in dem der Antrag ankommt',
      steps: [{ id: 1, de: 'Antrag holen' }, { id: 2, de: 'Antrag abgeben' }],
    },
  ]);
  expect(packs.fa).toEqual({
    ui: {},
    topics: {
      wohngeld: {
        name: 'کمک‌هزینه‌ی مسکن',
        deadline: 'از ماه درخواست',
        keywords: ['اجاره', 'wohngeld'],
        steps: { 1: 'گرفتن فرم', 2: 'تحویل فرم' },
      },
    },
  });
});

test('a case without a translation is left out of that language, not refused', () => {
  const { structure, packs } = build({ 'wohngeld.md': german });
  expect(structure.topics).toHaveLength(1);
  expect(packs.fa.topics).toEqual({});
});

describe('stops and names the file', () => {
  const steps = (count) => Array.from({ length: count }, (_, index) => `${index + 1}. Schritt`).join('\n');

  test.each([
    ['a translation with fewer steps', { 'wohngeld.md': german, 'wohngeld.fa.md': farsi.replace('2. تحویل فرم\n', '') }, {}, 'wohngeld.fa.md: 1 steps, the German file has 2'],
    ['a translation that drops the deadline', { 'wohngeld.md': german, 'wohngeld.fa.md': farsi.replace('## Frist', '## Notiz') }, {}, 'wohngeld.fa.md: ## Frist'],
    ['more than seven steps', { 'wohngeld.md': german.replace(/1\. Antrag holen\n2\. Antrag abgeben/, steps(8)) }, {}, 'wohngeld.md: 8 steps, at most 7'],
    ['an authority nobody defined', { 'wohngeld.md': german.replace('wohngeldstelle', 'sozialamt') }, {}, 'wohngeld.md: base.json has no authority "sozialamt"'],
    ['a file that is not in the list', { 'wohngeld.md': german, 'kindergeld.md': german }, {}, 'kindergeld.md: "kindergeld" is not in the topics list'],
    ['a listed case without a file', { 'wohngeld.md': german }, { topics: ['wohngeld', 'kindergeld'] }, 'kindergeld.md is missing'],
    ['a translation into a language that is not set up', { 'wohngeld.md': german, 'wohngeld.ar.md': farsi }, {}, 'wohngeld.ar.md: base.json has no language "ar"'],
  ])('%s', (_name, files, changes, message) => {
    expect(() => build(files, changes)).toThrow(message);
  });
});

test('the content in the repo builds, with every case translated into Farsi', () => {
  const read = (path) => readFileSync(join(content, path), 'utf8');
  const base = JSON.parse(read('base.json'));
  const { structure, packs } = compile({
    base,
    packs: { fa: JSON.parse(read('lang/fa.json')) },
    files: Object.fromEntries(readdirSync(join(content, 'cases')).map((file) => [file, read(`cases/${file}`)])),
  });

  expect(structure.topics.map((topic) => topic.id)).toEqual(base.topics);
  expect(Object.keys(packs.fa.topics)).toEqual(base.topics);
});
