// Single source of content truth. Loads the language-invariant spine
// (structure.json) and one language file, merges them, and hands the rest of
// the app objects that need no further lookup.
//
// Nothing else in the codebase should know that content is split across two
// files, or that audio paths follow a convention.

const LANG_KEY = 'compass.lang';

let spine = null;
let pack = null;

export async function loadSpine() {
  const res = await fetch('data/structure.json');
  if (!res.ok) throw new Error(`structure.json ${res.status}`);
  spine = await res.json();
  return spine;
}

export async function loadLanguage(code) {
  const res = await fetch(`data/lang/${code}.json`);
  if (!res.ok) throw new Error(`lang/${code}.json ${res.status}`);
  pack = await res.json();
  pack.code = code;
  return pack;
}

export function languages() {
  return spine.languages;
}

export function meta() {
  const lang = spine.languages.find((l) => l.code === pack.code);
  return {
    code: pack.code,
    dir: lang.dir,
    stt: lang.stt,
    county: spine.county,
    routerMode: spine.router_mode || 'mock',
    equivalents: pack.equivalents || [],
  };
}

// UI string with {placeholder} substitution. Missing keys return the key
// itself — visible in testing, harmless in production, never a crash.
export function t(key, vars) {
  let s = pack.ui?.[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  }
  return s;
}

// audio/<lang>/<topic>/step-<n>.mp3, or full.mp3 when step is omitted.
// Convention, not configuration: dropping a native speaker's recording at the
// path replaces the generated one with no JSON edit anywhere.
export function audioFor(topicId, stepId) {
  const file = stepId == null ? 'full' : `step-${stepId}`;
  return `audio/${pack.code}/${topicId}/${file}.mp3`;
}

export function authority(id) {
  const a = spine.authorities[id];
  if (!a) return null;
  return { ...a, name: pack.authorities?.[id] || a.de };
}

// Merged, render-ready topics. A topic missing from the language pack is
// dropped rather than shown untranslated — a half-translated tile is worse
// than an absent one for someone navigating by shape.
export function topics() {
  return spine.topics
    .filter((topic) => pack.topics?.[topic.id])
    .map((topic) => {
      const text = pack.topics[topic.id];
      return {
        id: topic.id,
        icon: topic.icon,
        name: text.name,
        de: topic.de,
        urgency: topic.urgency,
        deadline: text.deadline || null,
        deadlineDe: topic.deadline_de || null,
        keywords: text.keywords || [],
        authority: topic.authority ? authority(topic.authority) : null,
        audioFull: audioFor(topic.id),
        steps: topic.steps.map((step) => ({
          id: step.id,
          text: text.steps?.[String(step.id)] || step.de,
          de: step.de,
          audio: audioFor(topic.id, step.id),
        })),
      };
    });
}

// Stored choice first, then the device's own language preference, then null
// (which sends the user to the picker).
export function preferredLanguage() {
  const saved = localStorage.getItem(LANG_KEY);
  const known = spine.languages.map((l) => l.code);
  if (saved && known.includes(saved)) return saved;
  for (const tag of navigator.languages || []) {
    const base = tag.split('-')[0].toLowerCase();
    if (known.includes(base)) return base;
  }
  return null;
}

export function saveLanguage(code) {
  try {
    localStorage.setItem(LANG_KEY, code);
  } catch (e) {
    /* private mode — the app still works, the choice just won't persist */
  }
}
