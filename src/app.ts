import * as content from './content.ts';
import type { Language, Topic } from './content.ts';
import { $ } from './dom.ts';
import { renderTopic, stopAudio } from './player.ts';
import { initVoice, openVoice, isVoiceSupported } from './voice.ts';

const screens = {
  language: $('screen-language'),
  home: $('screen-home'),
  topic: $('screen-topic'),
};

let topics: Topic[] = [];
let byId: Record<string, Topic> = {};

async function boot() {
  registerServiceWorker();

  try {
    await content.loadSpine();
  } catch (err) {
    return fail(err);
  }

  const code = content.preferredLanguage();
  const available = content.languages();

  // One language configured: the picker is a dead end, so skip it.
  if (code) return start(code);
  if (available.length === 1) return start(available[0].code);
  renderLanguagePicker(available);
  show('language');
}

async function start(code: string) {
  try {
    await content.loadLanguage(code);
  } catch (err) {
    return fail(err);
  }
  content.saveLanguage(code);

  const info = content.meta();
  document.documentElement.lang = info.code;
  document.documentElement.dir = info.dir;

  topics = content.topics();
  byId = Object.fromEntries(topics.map((topic) => [topic.id, topic]));

  applyStrings(info);
  renderHome();
  wireVoice();
  window.addEventListener('hashchange', route);
  route();

  // Dynamic import, so the inspector is never fetched on a normal visit.
  if (new URLSearchParams(window.location.search).has('debug')) {
    import('./debug.ts').then((debug) => debug.initDebug(topics));
  }
}

function applyStrings(info: ReturnType<typeof content.meta>) {
  $('kicker').textContent = info.county;
  $('guide-label').textContent = content.t('guide');
  $('grid').setAttribute('aria-label', content.t('topics'));
  $('mic-label').textContent = content.t('speak');
  $('mic').setAttribute('aria-label', content.t('speak'));
  $('back').setAttribute('aria-label', content.t('back'));
  $('voice-close').setAttribute('aria-label', content.t('close'));
  $('voice-retry').textContent = content.t('retry');
}

function renderLanguagePicker(languages: Language[]) {
  const list = $('language-list');
  list.textContent = '';
  languages.forEach((language) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'language-option';
    button.lang = language.code;
    button.dir = language.dir;
    button.textContent = language.name;
    button.addEventListener('click', () => start(language.code));
    list.appendChild(button);
  });
}

function renderHome() {
  const grid = $('grid');
  grid.textContent = '';

  // Fixed order, always. Users who cannot read navigate by position; a grid
  // that re-sorts itself between visits destroys the only wayfinding they
  // have. Urgency is carried by the badge and ring instead.
  topics.forEach((topic) => {
    const tile = document.createElement('a');
    tile.className = 'tile';
    tile.href = `#/topic/${topic.id}`;
    if (topic.urgency === 'high') tile.classList.add('is-urgent');

    if (topic.urgency === 'high') {
      const badge = document.createElement('span');
      badge.className = 'tile-badge';
      badge.textContent = '⏰';
      badge.setAttribute('aria-label', content.t('urgent'));
      tile.appendChild(badge);
    }

    const icon = document.createElement('span');
    icon.className = 'tile-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = topic.icon;

    const label = document.createElement('span');
    label.className = 'tile-label';
    label.textContent = topic.name;

    tile.append(icon, label);
    grid.appendChild(tile);
  });
}

function wireVoice() {
  initVoice(
    {
      overlay: $('voice-overlay'),
      status: $('voice-status'),
      transcript: $('voice-transcript'),
      close: $('voice-close'),
      retry: $('voice-retry'),
    },
    topics,
    (slug) => {
      window.location.hash = `#/topic/${slug}`;
    }
  );

  const mic = $('mic');
  mic.hidden = !isVoiceSupported();
  mic.addEventListener('click', openVoice);

  $('back').addEventListener('click', () => {
    window.location.hash = '#/';
  });
}

function show(name: keyof typeof screens) {
  Object.entries(screens).forEach(([key, node]) => {
    node.hidden = key !== name;
  });
}

function route() {
  const match = (window.location.hash || '#/').match(/^#\/topic\/(.+)$/);
  const topic = match && byId[match[1]];

  if (topic) {
    renderTopic(topic, $('topic-content'));
    show('topic');
    $('back').focus();
  } else {
    stopAudio();
    show('home');
  }
  window.scrollTo(0, 0);
}

// Content failed to load and there is nothing to fall back to. Say so in a way
// that does not require reading: an icon plus a reload the user can tap.
function fail(err: unknown) {
  console.error('[app] boot failed:', err);
  $('boot-error').hidden = false;
  Object.values(screens).forEach((node) => {
    node.hidden = true;
  });
}

function registerServiceWorker() {
  // The Service Worker is written by the build; the dev server has none.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.warn('[app] SW registration failed:', err);
  });
}

document.getElementById('reload')?.addEventListener('click', () => window.location.reload());

boot();
