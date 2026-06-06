// Fullscreen voice overlay: STT (Web Speech, fa-IR) -> router -> navigate.
//
// IMPORTANT: Web Speech STT on Android Chrome streams audio to Google and does
// NOT work offline; fa-IR quality is uneven on cheap devices. So this path is
// best-effort: any failure closes the overlay and leaves the user on the icon
// grid (which is the offline-reliable way in). Voice is never the only door.

import { route } from './router.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

let el = {};
let onNavigate = null;
let topics = [];
let recognition = null;

export function isVoiceSupported() {
  return Boolean(SR);
}

export function initVoice(elements, topicList, navigateFn) {
  el = elements;
  topics = topicList;
  onNavigate = navigateFn;
  el.close.addEventListener('click', closeVoice);
  el.retry.addEventListener('click', openVoice);
}

// Single source of truth for the overlay's visual state + status line.
// State drives which glyph shows (CSS [data-state]): listening | processing |
// found | error | unsupported. 'error' also reveals the retry button.
function setState(state, statusText) {
  el.overlay.dataset.state = state;
  el.status.textContent = statusText;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fa-IR';
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function stopRecognition() {
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      /* already stopped */
    }
    recognition = null;
  }
}

export function openVoice() {
  stopRecognition(); // retry may re-open while a session is still live
  el.overlay.hidden = false;
  el.transcript.textContent = '';

  if (!isVoiceSupported()) {
    setState('unsupported', 'صدا روی این دستگاه پشتیبانی نمی‌شود. لطفاً از دکمه‌ها استفاده کنید.');
    return;
  }

  setState('listening', 'در حال شنیدن… بفرمایید');
  recognition = new SR();
  recognition.lang = 'fa-IR';
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((r) => r[0].transcript)
      .join(' ');
    el.transcript.textContent = transcript;
    if (event.results[event.results.length - 1].isFinal) {
      handleTranscript(transcript);
    }
  };

  recognition.onerror = (event) => {
    console.warn('[voice] recognition error:', event.error);
    setState('error', 'متوجه نشدم. دوباره تلاش کنید یا از دکمه‌ها استفاده کنید.');
  };

  // Ended while still listening = nothing was captured. Offer a retry.
  recognition.onend = () => {
    if (el.overlay.dataset.state === 'listening') {
      setState('error', 'چیزی نشنیدم. دوباره تلاش کنید یا از دکمه‌ها استفاده کنید.');
    }
  };

  try {
    recognition.start();
  } catch (err) {
    setState('error', 'صدا در دسترس نیست. دوباره تلاش کنید یا از دکمه‌ها استفاده کنید.');
  }
}

async function handleTranscript(transcript) {
  setState('processing', 'در حال جستجو…');
  const result = await route(transcript, topics);

  if (result.slug) {
    const topic = topics.find((t) => t.id === result.slug);
    setState('found', `${topic.fa} ✓`);
    speak(topic.fa);
    setTimeout(() => {
      closeVoice();
      onNavigate(result.slug);
    }, 900);
  } else {
    setState('error', result.clarify);
    speak(result.clarify);
  }
}

export function closeVoice() {
  stopRecognition();
  window.speechSynthesis?.cancel();
  el.overlay.hidden = true;
}
