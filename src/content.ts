// Single source of content truth. Loads the language-invariant spine
// (structure.json) and one language file, merges them, and hands the rest of
// the app objects that need no further lookup.
//
// Nothing else in the codebase should know that content is split across two
// files, or that audio paths follow a convention.

const LANG_KEY = 'compass.lang';

export interface Language {
  code: string;
  name: string;
  dir: 'rtl' | 'ltr';
  stt: string;
}

interface SpineAuthority {
  de: string;
  icon: string;
  maps_query: string;
  phone?: string;
  verified?: boolean;
}

interface Spine {
  county: string;
  router_mode?: 'mock' | 'proxy';
  languages: Language[];
  authorities: Record<string, SpineAuthority>;
  topics: {
    id: string;
    icon: string;
    de: string;
    authority?: string;
    urgency?: 'high';
    deadline_de?: string;
    steps: { id: number; de: string }[];
  }[];
}

interface Pack {
  code: string;
  equivalents?: [string, string][];
  ui?: Record<string, string>;
  authorities?: Record<string, string>;
  topics?: Record<
    string,
    { name: string; deadline?: string; keywords?: string[]; steps?: Record<string, string> }
  >;
}

export interface Authority extends SpineAuthority {
  name: string;
}

export interface Step {
  id: number;
  text: string;
  de: string;
  audio: string;
}

export interface Topic {
  id: string;
  icon: string;
  name: string;
  de: string;
  urgency?: 'high';
  deadline: string | null;
  deadlineDe: string | null;
  keywords: string[];
  authority: Authority | null;
  audioFull: string;
  steps: Step[];
}

let spine: Spine;
let pack: Pack;

export async function loadSpine() {
  const res = await fetch('data/structure.json');
  if (!res.ok) throw new Error(`structure.json ${res.status}`);
  spine = await res.json();
  return spine;
}

export async function loadLanguage(code: string) {
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
  const lang = spine.languages.find((l) => l.code === pack.code)!;
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
export function t(key: string, vars?: Record<string, string>) {
  let s = pack.ui?.[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  }
  return s;
}

// audio/<lang>/<topic>/step-<n>.mp3, or full.mp3 when step is omitted.
// Convention, not configuration: dropping a native speaker's recording at the
// path replaces the generated one with no JSON edit anywhere.
export function audioFor(topicId: string, stepId?: number) {
  const file = stepId == null ? 'full' : `step-${stepId}`;
  return `audio/${pack.code}/${topicId}/${file}.mp3`;
}

export function authority(id: string): Authority | null {
  const a = spine.authorities[id];
  if (!a) return null;
  return { ...a, name: pack.authorities?.[id] || a.de };
}

// Merged, render-ready topics. A topic missing from the language pack is
// dropped rather than shown untranslated — a half-translated tile is worse
// than an absent one for someone navigating by shape.
export function topics(): Topic[] {
  return spine.topics
    .filter((topic) => pack.topics?.[topic.id])
    .map((topic) => {
      const text = pack.topics![topic.id];
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

export function saveLanguage(code: string) {
  try {
    localStorage.setItem(LANG_KEY, code);
  } catch (e) {
    /* private mode — the app still works, the choice just won't persist */
  }
}
