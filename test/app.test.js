// @vitest-environment jsdom
//
// The whole app from index.html to a rendered topic, in jsdom. No Service
// Worker, no audio playback, no speech — those need a real browser. What this
// pins down is the path a tap takes: boot, home grid, topic screen, back.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, expect, test, vi } from 'vitest';

// jsdom swaps in its own URL class, which node:fs does not accept.
const read = (path) => readFileSync(join(import.meta.dirname, '..', path), 'utf8');

const visible = (id) => !document.getElementById(id).hidden;

async function goto(hash) {
  window.location.hash = hash;
  window.dispatchEvent(new Event('hashchange'));
  await vi.waitFor(() => expect(window.location.hash).toBe(hash));
}

beforeAll(async () => {
  const html = read('index.html');
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script'));
  window.scrollTo = () => {};
  globalThis.fetch = async (path) =>
    path.startsWith('api/')
      ? { ok: false, status: 503 }
      : { ok: true, status: 200, json: async () => JSON.parse(read('public/' + path)) };

  await import('../src/app.ts');
  await vi.waitFor(() => expect(visible('screen-home')).toBe(true));
});

test('with one language configured, boot skips the picker and sets the direction', () => {
  expect(visible('screen-language')).toBe(false);
  expect(document.documentElement.lang).toBe('fa');
  expect(document.documentElement.dir).toBe('rtl');
});

test('home shows the six topics in fixed order, two of them urgent', () => {
  const tiles = [...document.querySelectorAll('.tile')];
  expect(tiles.map((tile) => tile.getAttribute('href'))).toEqual([
    '#/topic/wohnsitz-anmelden',
    '#/topic/aufenthalt-asyl',
    '#/topic/jobcenter',
    '#/topic/kita-schule',
    '#/topic/gesundheit',
    '#/topic/deutschkurs',
  ]);
  expect(document.querySelectorAll('.tile.is-urgent')).toHaveLength(2);
});

test('the mic stays hidden where speech recognition is missing', () => {
  expect(document.getElementById('mic').hidden).toBe(true);
});

test('a topic renders its heading, deadline, destination and steps', async () => {
  await goto('#/topic/wohnsitz-anmelden');

  expect(visible('screen-topic')).toBe(true);
  expect(visible('screen-home')).toBe(false);

  const topic = document.getElementById('topic-content');
  expect(topic.querySelector('h1').textContent).toBe('ثبت محل سکونت');
  expect(topic.querySelector('.topic-de').textContent).toBe('Wohnsitz anmelden');
  expect(topic.querySelector('.deadline')).not.toBeNull();
  expect(topic.querySelectorAll('.step')).toHaveLength(5);
  expect(topic.querySelector('.destination-unverified')).not.toBeNull();

  const [map, call] = topic.querySelectorAll('.action');
  expect(map.href).toContain('google.com/maps');
  expect(call.href).toBe('tel:+4981615444');
});

test('the German term of a step opens on tap', async () => {
  await goto('#/topic/wohnsitz-anmelden');
  const step = document.querySelector('.step');
  const toggle = step.querySelector('.step-toggle');
  const german = step.querySelector('.step-de');

  expect(german.hidden).toBe(true);
  toggle.click();
  expect(german.hidden).toBe(false);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
});

test('a topic without an authority has no destination card', async () => {
  await goto('#/topic/gesundheit');
  await vi.waitFor(() =>
    expect(document.querySelector('#topic-content h1').textContent).toBe('پزشک و سلامت')
  );
  expect(document.querySelector('.destination')).toBeNull();
});

test('an unknown topic falls back to home', async () => {
  await goto('#/topic/gibt-es-nicht');
  await vi.waitFor(() => expect(visible('screen-home')).toBe(true));
});

function type(phrase) {
  document.getElementById('ask-input').value = phrase;
  document.getElementById('ask').dispatchEvent(new Event('submit', { cancelable: true }));
}

test('a typed phrase opens its topic and clears the field', async () => {
  await goto('#/');
  type('دکتر');
  await vi.waitFor(() => expect(window.location.hash).toBe('#/topic/gesundheit'));
  expect(document.getElementById('ask-input').value).toBe('');
  expect(document.getElementById('ask-status').textContent).toBe('');
});

test('a typed phrase that matches nothing says so and stays on home', async () => {
  await goto('#/');
  type('سلام');
  const status = document.getElementById('ask-status');
  await vi.waitFor(() => expect(status.textContent).toContain('متوجه نشدم'));
  expect(window.location.hash).toBe('#/');
  expect(document.getElementById('ask-input').value).toBe('سلام');
});
