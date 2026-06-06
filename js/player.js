// Renders a topic into the player screen: one "play all" control plus a list of
// steps. Each step is icon-first and audio-first (big play button); the German
// text is secondary and hidden behind a tap, per the illiteracy-first brief.

let audio = null; // single shared <audio>; only one clip plays at a time

function clearButtonStates() {
  document
    .querySelectorAll('.btn-play')
    .forEach((b) => b.classList.remove('playing', 'loading'));
}

function play(src, button) {
  if (!audio) audio = new Audio();

  // Tapping the active button again -> stop (also cancels an in-flight load).
  if (audio.dataset.btn === button.dataset.key && !audio.paused) {
    audio.pause();
    button.classList.remove('playing', 'loading');
    return;
  }

  clearButtonStates();
  audio.src = src;
  audio.dataset.btn = button.dataset.key;

  // Spinner from tap until audio actually starts — on patchy data the gap
  // between request and playback is real, and a tap must never look dead.
  button.classList.add('loading');
  audio.onwaiting = () => button.classList.add('loading');
  audio.onplaying = () => {
    button.classList.remove('loading');
    button.classList.add('playing');
  };
  audio.onended = () => button.classList.remove('playing', 'loading');
  audio.onerror = () => {
    button.classList.remove('playing', 'loading');
    console.warn('[player] audio failed to load:', src);
  };
  audio.play().catch((err) => {
    button.classList.remove('playing', 'loading');
    console.warn('[player] audio failed:', err);
  });
}

export function stopAudio() {
  if (audio) audio.pause();
  clearButtonStates();
}

// Time-sensitive banner. Icon + amber accent carry the "act fast" meaning
// (not colour alone); the deadline text serves readers. Optional per topic.
function urgencyBanner(topic) {
  const b = document.createElement('div');
  b.className = 'urgency';
  b.innerHTML = `<span class="urgency-icon" aria-hidden="true">⏰</span>
    <div class="urgency-text">
      <p class="urgency-fa">${topic.deadline_fa || 'زمان‌حساس'}</p>
      <p class="urgency-de">${topic.deadline_de || ''}</p>
    </div>`;
  return b;
}

// "Where to go" card: a physical office with reading-free actions —
// tap the pin for directions, tap the phone to call. Optional per topic.
function authorityCard(auth) {
  const card = document.createElement('div');
  card.className = 'authority';

  const head = document.createElement('div');
  head.className = 'authority-head';
  head.innerHTML = `<span class="authority-icon">${auth.icon}</span>
    <div class="authority-names">
      <p class="authority-fa">${auth.fa}</p>
      <p class="authority-de">${auth.de}</p>
    </div>`;

  const actions = document.createElement('div');
  actions.className = 'authority-actions';

  const map = document.createElement('a');
  map.className = 'authority-btn';
  map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(auth.maps_query)}`;
  map.target = '_blank';
  map.rel = 'noopener';
  map.innerHTML = '<span class="authority-btn-icon">📍</span><span>مسیر</span>';
  actions.appendChild(map);

  if (auth.phone) {
    const call = document.createElement('a');
    call.className = 'authority-btn';
    call.href = `tel:${auth.phone}`;
    call.innerHTML = '<span class="authority-btn-icon">📞</span><span>تماس</span>';
    actions.appendChild(call);
  }

  card.append(head, actions);
  return card;
}

export function renderTopic(topic, authorities, container) {
  stopAudio();
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'topic-header';
  header.innerHTML = `<span class="topic-icon">${topic.icon}</span>
    <h2>${topic.fa}</h2>
    <p class="de-sub">${topic.de}</p>`;
  container.appendChild(header);

  if (topic.urgency === 'high') container.appendChild(urgencyBanner(topic));

  const auth = topic.authority && authorities[topic.authority];
  if (auth) container.appendChild(authorityCard(auth));

  if (topic.audio_full) {
    const full = document.createElement('button');
    full.className = 'btn-play btn-play-full';
    full.dataset.key = `${topic.id}-full`;
    full.innerHTML = '<span class="play-icon">▶</span><span>شنیدن کامل</span>';
    full.addEventListener('click', () => play(topic.audio_full, full));
    container.appendChild(full);
  }

  const list = document.createElement('ol');
  list.className = 'steps';

  topic.steps.forEach((step) => {
    const li = document.createElement('li');
    li.className = 'step';

    const playBtn = document.createElement('button');
    playBtn.className = 'btn-play';
    playBtn.dataset.key = `${topic.id}-${step.id}`;
    playBtn.setAttribute('aria-label', 'پخش صدا');
    playBtn.innerHTML = '<span class="play-icon">▶</span>';
    playBtn.addEventListener('click', () => play(step.audio, playBtn));

    const num = document.createElement('span');
    num.className = 'step-num';
    num.textContent = step.id;

    const body = document.createElement('div');
    body.className = 'step-body';
    body.innerHTML = `<p class="step-fa">${step.fa}</p>
      <p class="step-de" hidden>${step.de}</p>`;
    body.addEventListener('click', () => {
      body.querySelector('.step-de').hidden = !body.querySelector('.step-de').hidden;
    });

    li.append(num, body, playBtn);
    list.appendChild(li);
  });

  container.appendChild(list);
}
