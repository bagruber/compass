import { renderTopic, stopAudio } from './player.js';
import { initVoice, openVoice, isVoiceSupported } from './voice.js';

const screens = {
  home: document.getElementById('screen-home'),
  topic: document.getElementById('screen-topic'),
};

let topics = [];
let byId = {};
let authorities = {};

async function boot() {
  const res = await fetch('data/topics.json');
  const data = await res.json();
  topics = data.topics;
  authorities = data.authorities || {};
  byId = Object.fromEntries(topics.map((t) => [t.id, t]));

  document.getElementById('county').textContent = data.meta.county;
  document.getElementById('lang-label').textContent = data.meta.lang_label;

  renderHome();
  wireVoice();
  wireRouting();
  registerServiceWorker();
  route();
}

function renderHome() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  // Surface time-critical topics first; stable order for the rest. Tradeoff:
  // this moves icons around vs. a fixed layout users could memorize by position.
  const ordered = [...topics].sort(
    (a, b) => (b.urgency === 'high') - (a.urgency === 'high')
  );
  ordered.forEach((t) => {
    const tile = document.createElement('a');
    tile.className = 'tile';
    tile.href = `#/topic/${t.id}`;
    const badge =
      t.urgency === 'high'
        ? '<span class="tile-urgent" aria-label="زمان‌حساس">⏰</span>'
        : '';
    if (t.urgency === 'high') tile.classList.add('is-urgent');
    tile.innerHTML = `${badge}<span class="tile-icon">${t.icon}</span>
      <span class="tile-label">${t.fa}</span>`;
    grid.appendChild(tile);
  });
}

function wireVoice() {
  const elements = {
    overlay: document.getElementById('voice-overlay'),
    status: document.getElementById('voice-status'),
    transcript: document.getElementById('voice-transcript'),
    close: document.getElementById('voice-close'),
    retry: document.getElementById('voice-retry'),
  };
  initVoice(elements, topics, (slug) => {
    window.location.hash = `#/topic/${slug}`;
  });

  const mic = document.getElementById('mic');
  if (!isVoiceSupported()) mic.classList.add('mic-unsupported');
  mic.addEventListener('click', openVoice);
}

function wireRouting() {
  window.addEventListener('hashchange', route);
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
  const hash = window.location.hash || '#/';
  const match = hash.match(/^#\/topic\/(.+)$/);
  if (match && byId[match[1]]) {
    renderTopic(byId[match[1]], authorities, document.getElementById('topic-content'));
    show('topic');
  } else {
    stopAudio();
    show('home');
  }
  window.scrollTo(0, 0);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('[app] SW registration failed:', err);
    });
  }
}

boot();
