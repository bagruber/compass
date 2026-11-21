// Topic screen: one "play all" control, the destination, and the short list of
// things to know. Audio-first; German text is secondary and behind a toggle.
//
// Everything user-facing is built with createElement + textContent rather than
// innerHTML: content comes from JSON that a caseworker will eventually edit,
// and an apostrophe in a translation must never be able to break the page.

import { t, type Authority, type Step, type Topic } from './content.ts';

type PlayState = 'idle' | 'loading' | 'playing' | 'error';

let audio: HTMLAudioElement | null = null; // one shared element; only one clip plays at a time
let activeButton: HTMLButtonElement | null = null;

function setButtonState(button: HTMLButtonElement, state: PlayState) {
  button.classList.toggle('is-loading', state === 'loading');
  button.classList.toggle('is-playing', state === 'playing');
  button.classList.toggle('is-error', state === 'error');
  button.setAttribute('aria-pressed', String(state === 'playing'));
}

function reset(button: HTMLButtonElement | null) {
  if (button) setButtonState(button, 'idle');
}

function play(src: string, button: HTMLButtonElement) {
  if (!audio) audio = new Audio();

  // Tapping the active button again stops it (and cancels an in-flight load).
  if (activeButton === button && !audio.paused) {
    audio.pause();
    reset(button);
    activeButton = null;
    return;
  }

  reset(activeButton);
  activeButton = button;
  audio.src = src;

  // Spinner from tap until playback actually starts. On patchy data the gap is
  // real, and a tap must never look dead.
  setButtonState(button, 'loading');
  audio.onwaiting = () => setButtonState(button, 'loading');
  audio.onplaying = () => setButtonState(button, 'playing');
  audio.onended = () => {
    reset(button);
    activeButton = null;
  };
  audio.onerror = () => {
    setButtonState(button, 'error');
    activeButton = null;
  };
  audio.play().catch(() => {
    setButtonState(button, 'error');
    activeButton = null;
  });
}

export function stopAudio() {
  if (audio) audio.pause();
  reset(activeButton);
  activeButton = null;
}

function playButton(src: string, label: string, extraClass?: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = extraClass ? `btn-play ${extraClass}` : 'btn-play';
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', 'false');

  const icon = document.createElement('span');
  icon.className = 'play-icon';
  icon.setAttribute('aria-hidden', 'true');
  button.appendChild(icon);

  if (extraClass) {
    const text = document.createElement('span');
    text.textContent = label;
    button.appendChild(text);
  }

  button.addEventListener('click', () => play(src, button));
  return button;
}

// Deadline banner. Icon + colour together carry "act fast" — never colour
// alone, so it survives colour-blindness and cross-cultural colour meaning.
function deadlineBanner(topic: Topic) {
  const banner = document.createElement('div');
  banner.className = 'deadline';

  const icon = document.createElement('span');
  icon.className = 'deadline-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '⏰';

  const text = document.createElement('div');
  const primary = document.createElement('p');
  primary.className = 'deadline-text';
  primary.textContent = topic.deadline || t('urgent');
  text.appendChild(primary);

  if (topic.deadlineDe) {
    const german = document.createElement('p');
    german.className = 'deadline-de';
    german.lang = 'de';
    german.dir = 'ltr';
    german.textContent = topic.deadlineDe;
    text.appendChild(german);
  }

  banner.append(icon, text);
  return banner;
}

// Where to go: a physical office with reading-free actions — tap the pin for
// directions, tap the phone to call.
function destination(auth: Authority) {
  const card = document.createElement('section');
  card.className = 'destination';

  const head = document.createElement('div');
  head.className = 'destination-head';

  const icon = document.createElement('span');
  icon.className = 'destination-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = auth.icon;

  const names = document.createElement('div');
  const name = document.createElement('p');
  name.className = 'destination-name';
  name.textContent = auth.name;
  const german = document.createElement('p');
  german.className = 'destination-de';
  german.lang = 'de';
  german.dir = 'ltr';
  german.textContent = auth.de;
  names.append(name, german);

  head.append(icon, names);

  const actions = document.createElement('div');
  actions.className = 'destination-actions';

  const map = document.createElement('a');
  map.className = 'action';
  map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(auth.maps_query)}`;
  map.target = '_blank';
  map.rel = 'noopener';
  map.append(glyph('📍'), label(t('directions')));
  actions.appendChild(map);

  if (auth.phone) {
    const call = document.createElement('a');
    call.className = 'action';
    call.href = `tel:${auth.phone}`;
    call.append(glyph('📞'), label(t('call')));
    actions.appendChild(call);
  }

  card.append(head, actions);

  // The data is flagged unverified; the interface says so rather than
  // presenting a guessed phone number with the confidence of a checked one.
  if (auth.verified === false) {
    const warning = document.createElement('p');
    warning.className = 'destination-unverified';
    warning.textContent = t('unverified');
    card.appendChild(warning);
  }

  return card;
}

function glyph(char: string) {
  const span = document.createElement('span');
  span.className = 'action-icon';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = char;
  return span;
}

function label(text: string) {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

function stepItem(topic: Topic, step: Step) {
  const item = document.createElement('li');
  item.className = 'step';

  const number = document.createElement('span');
  number.className = 'step-num';
  number.setAttribute('aria-hidden', 'true');
  // Localised numerals: the step number renders in the reader's own digits.
  number.textContent = step.id.toLocaleString(document.documentElement.lang);

  const body = document.createElement('div');
  body.className = 'step-body';

  const text = document.createElement('p');
  text.className = 'step-text';
  text.textContent = step.text;
  body.appendChild(text);

  // The German term is what you point at when you reach the counter, so it is
  // a real disclosure control: focusable, labelled, and state-announcing.
  const german = document.createElement('p');
  german.className = 'step-de';
  german.lang = 'de';
  german.dir = 'ltr';
  german.textContent = step.de;
  german.hidden = true;
  german.id = `de-${topic.id}-${step.id}`;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'step-toggle';
  toggle.textContent = t('show_german');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', german.id);
  toggle.addEventListener('click', () => {
    const open = german.hidden;
    german.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });

  body.append(toggle, german);

  item.append(number, body, playButton(step.audio, t('play')));
  return item;
}

export function renderTopic(topic: Topic, container: HTMLElement) {
  stopAudio();
  container.textContent = '';

  const header = document.createElement('header');
  header.className = 'topic-header';

  const icon = document.createElement('span');
  icon.className = 'topic-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = topic.icon;

  const heading = document.createElement('h1');
  heading.textContent = topic.name;

  const german = document.createElement('p');
  german.className = 'topic-de';
  german.lang = 'de';
  german.dir = 'ltr';
  german.textContent = topic.de;

  header.append(icon, heading, german);
  container.appendChild(header);

  container.appendChild(playButton(topic.audioFull, t('play_all'), 'btn-play-full'));

  if (topic.urgency === 'high') container.appendChild(deadlineBanner(topic));
  if (topic.authority) container.appendChild(destination(topic.authority));

  const list = document.createElement('ol');
  list.className = 'steps';
  topic.steps.forEach((step) => list.appendChild(stepItem(topic, step)));
  container.appendChild(list);
}
