// Fullscreen voice overlay: STT -> router -> navigate.
//
// Web Speech STT streams audio to the vendor and does NOT work offline, and
// recognition quality on cheap devices is uneven. So this whole path is
// best-effort: every failure lands on a visible retry and leaves the icon grid
// intact behind it. Voice is never the only door.

import { route } from './router.ts';
import { meta, t, type Topic } from './content.ts';

// The DOM typings know the recognition events but not the recognizer itself,
// and Chrome still ships it under the webkit prefix. This is the part used here.
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface VoiceElements {
  overlay: HTMLElement;
  status: HTMLElement;
  transcript: HTMLElement;
  close: HTMLElement;
  retry: HTMLElement;
}

type VoiceState = 'listening' | 'processing' | 'found' | 'error' | 'unsupported';

const speech = window as unknown as Record<string, (new () => Recognition) | undefined>;
const SR = speech.SpeechRecognition || speech.webkitSpeechRecognition;

let el: VoiceElements;
let onNavigate: (slug: string) => void;
let topicList: Topic[] = [];
let recognition: Recognition | null = null;

export function isVoiceSupported() {
  return Boolean(SR);
}

export function initVoice(elements: VoiceElements, topics: Topic[], navigateFn: (slug: string) => void) {
  el = elements;
  topicList = topics;
  onNavigate = navigateFn;
  el.close.addEventListener('click', closeVoice);
  el.retry.addEventListener('click', openVoice);
  el.overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeVoice();
  });
}

// [data-state] drives which glyph shows and whether retry is offered:
// listening | processing | found | error | unsupported
function setState(state: VoiceState, statusText: string) {
  el.overlay.dataset.state = state;
  el.status.textContent = statusText;
}

function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = meta().stt;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function stopRecognition() {
  if (!recognition) return;
  try {
    recognition.stop();
  } catch (e) {
    /* already stopped */
  }
  recognition = null;
}

export function openVoice() {
  stopRecognition(); // retry can re-open while a session is still live
  el.overlay.hidden = false;
  el.transcript.textContent = '';

  if (!isVoiceSupported()) {
    setState('unsupported', t('unsupported'));
    el.close.focus();
    return;
  }

  setState('listening', t('listening'));
  el.close.focus();

  recognition = new SR!();
  recognition.lang = meta().stt;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(' ');
    el.transcript.textContent = transcript;
    if (event.results[event.results.length - 1].isFinal) handleTranscript(transcript);
  };

  recognition.onerror = () => setState('error', t('no_match'));

  // Ended while still listening means nothing was captured.
  recognition.onend = () => {
    if (el.overlay.dataset.state === 'listening') setState('error', t('no_speech'));
  };

  try {
    recognition.start();
  } catch (err) {
    setState('error', t('mic_error'));
  }
}

async function handleTranscript(transcript: string) {
  setState('processing', t('searching'));
  const result = await route(transcript, topicList);

  // Announced rather than handed to a listener, so the debug panel can observe
  // routing without anything in the shipping path knowing it exists.
  document.dispatchEvent(
    new CustomEvent('compass:route', { detail: { transcript, result, source: 'voice' } })
  );

  if (!result.slug) {
    setState('error', result.clarify || t('no_match'));
    speak(result.clarify || t('no_match'));
    return;
  }

  // Both routers only return ids from the list they were given.
  const slug = result.slug;
  const topic = topicList.find((item) => item.id === slug)!;
  setState('found', topic.name);
  speak(topic.name);
  setTimeout(() => {
    closeVoice();
    onNavigate(slug);
  }, 900);
}

export function closeVoice() {
  stopRecognition();
  window.speechSynthesis?.cancel();
  el.overlay.hidden = true;
  document.getElementById('mic')?.focus();
}
