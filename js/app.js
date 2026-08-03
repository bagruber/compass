import * as content from './content.js';
import { renderTopic, stopAudio } from './player.js';
import { initVoice, openVoice, isVoiceSupported } from './voice.js';

const screens = {
  language: document.getElementById('screen-language'),
  home: document.getElementById('screen-home'),
  topic: document.getElementById('screen-topic'),
};

let topics = [];
let byId = {};

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

async function start(code) {
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
    import('./debug.js').then((debug) => debug.initDebug(topics));
  }
}

function applyStrings(info) {
  document.getElementById('kicker').textContent = info.county;
  document.getElementById('guide-label').textContent = content.t('guide');
  document.getElementById('grid').setAttribute('aria-label', content.t('topics'));
  document.getElementById('mic-label').textContent = content.t('speak');
  document.getElementById('mic').setAttribute('aria-label', content.t('speak'));
  document.getElementById('back').setAttribute('aria-label', content.t('back'));
  document.getElementById('voice-close').setAttribute('aria-label', content.t('close'));
  document.getElementById('voice-retry').textContent = content.t('retry');
}

function renderLanguagePicker(languages) {
  const list = document.getElementById('language-list');
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
  const grid = document.getElementById('grid');
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
      overlay: document.getElementById('voice-overlay'),
      status: document.getElementById('voice-status'),
      transcript: document.getElementById('voice-transcript'),
      close: document.getElementById('voice-close'),
      retry: document.getElementById('voice-retry'),
    },
    topics,
    (slug) => {
      window.location.hash = `#/topic/${slug}`;
    }
  );

  const mic = document.getElementById('mic');
  mic.hidden = !isVoiceSupported();
  mic.addEventListener('click', openVoice);

  document.getElementById('back').addEventListener('click', () => {
    window.location.hash = '#/';
  });
}

function show(name) {
  Object.entries(screens).forEach(([key, node]) => {
    node.hidden = key !== name;
  });
}

function route() {
  const match = (window.location.hash || '#/').match(/^#\/topic\/(.+)$/);
  const topic = match && byId[match[1]];

  if (topic) {
    renderTopic(topic, document.getElementById('topic-content'));
    show('topic');
    document.getElementById('back').focus();
  } else {
    stopAudio();
    show('home');
  }
  window.scrollTo(0, 0);
}

// Content failed to load and there is nothing to fall back to. Say so in a way
// that does not require reading: an icon plus a reload the user can tap.
function fail(err) {
  console.error('[app] boot failed:', err);
  document.getElementById('boot-error').hidden = false;
  Object.values(screens).forEach((node) => {
    node.hidden = true;
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.warn('[app] SW registration failed:', err);
  });
}

document.getElementById('reload')?.addEventListener('click', () => window.location.reload());

boot();
