# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Newly arrived refugees and migrants in the county of Freising, Bavaria, who must
deal with German public authorities. The defining trait is not that they lack
German — it is that **reading cannot be assumed at all**, in any script. A user
may be illiterate in their own language, literate only in a non-Latin script,
or literate but unable to read German bureaucratic vocabulary. The interface may
not depend on any of these being true.

Situation: on a cheap Android phone, often on prepaid data or borrowed Wi-Fi,
frequently under time pressure (registration deadlines, appointment letters),
often while stressed and unsure who to ask. Sometimes the phone is held by a
helper — a volunteer, social worker, or a relative — rather than by the person
who needs the answer.

The job: *"I have a letter / a problem / a deadline. Where do I go, what do I
bring, and what happens there?"*

## Product Purpose

**A first line of orientation, not a manual.** The app does not explain German
bureaucracy and must not try. It answers the smallest useful question — *roughly
what is this, where do I go, what do I bring* — and then gets out of the way.

Anything beyond orientation belongs to a caseworker, a Beratungsstelle, or the
office itself. Depth is not the goal; being the thing someone can actually use
in the first five minutes is.

Success is behavioural: the user goes to the right place with the right papers.
Secondary success: a volunteer hands the phone over and lets it do the talking.

**Scope discipline:** when a topic starts to need a full procedure, that is a
signal to point at a human, not to add steps.

## Positioning

Official municipal information exists — as German-language PDFs and web pages.
Translation apps exist — but require the user to already know what to ask.
This product's mechanism is that **the content is pre-translated, pre-sequenced,
spoken, and offline**: no reading, no typing, no query formulation, no network.
The user says what is wrong in their own language, or taps a picture, and gets a
spoken sequence of steps plus a tap-to-navigate and tap-to-call destination.

## Operating Context

- Cheap Android, small screen, often an aging browser.
- Patchy or exhausted mobile data. Offline is the normal case, not an edge case.
- Audio is often consumed on speakerphone in a public place, or through cheap
  earphones. It must be intelligible at low fidelity.
- Right-to-left scripts are first-class, not a mirrored afterthought; the app
  must switch direction per language.
- Hand-off is common: helper opens it, hands the phone over.
- Deadlines are real and short (e.g. Wohnsitz anmeldung within 14 days), so
  time-critical topics must be distinguishable without reading.

## Capabilities and Constraints

**Confirmed:**

- Static, offline-first PWA. TypeScript, built by Vite into plain files; serving
  them needs no server-side runtime. Service Worker precaches the shell and the
  data and caches audio on first play.
- Content is data, not code: `data/` is the single source of truth for topics,
  steps, authorities, and per-language strings.
- **Multi-language is architectural, decided.** Language is a runtime parameter,
  not a hardcoded fact. Content keyed by locale; STT language tag, text
  direction, script normalization, and audio paths all derive from the active
  locale. Adding a language is a data + config job, never a code change.
  Freising pilot ships Farsi/Dari; Arabic, Ukrainian, Tigrinya, Turkish are the
  expected next candidates.
- **Audio pipeline is dual-source, decided.** TTS-generated audio for
  prototyping and for content that changes; human native-speaker recordings for
  release. The player must be indifferent to which it is playing, and content
  may be mixed per topic while recordings arrive.
- Voice input via Web Speech API. **Voice is never the only door** — it requires
  network and a secure context, and quality on cheap devices is uneven. The
  icon grid is the offline-reliable path and must always work alone.
- Voice → topic routing sits behind one interface with two backends: an offline
  client-side keyword matcher (default) and an optional server-side LLM router.
  Both return `{ slug, confidence, options }` and never text of their own. Falling back to the offline
  matcher on any failure is required behaviour, not an optimization.
- **Deployment is Hostinger only, decided 21.11.2026** (replaces the earlier
  split with GitHub Pages for testing). The test deployment runs at
  compass.gruber.am, kept out of search engines, with a server-side proxy able
  to hold an API key. All paths stay relative, so a later move to another
  domain or into a subfolder needs no code change.

**Explicitly undecided:**

- **Geographic scope.** Freising is the pilot. Whether other counties adopt this
  is unknown. Decision: do not build a multi-county abstraction now, but do not
  make choices that actively block one — keep county name, authorities, and
  topics fully in data rather than in code.
- Whether a helper-facing or German-language mode is ever needed.

## Brand Commitments

Name in use: **Wegweiser** / راهنمای آلمان. Not a registered or official
municipal brand. The app must not present itself as an official government
service, because it is not one.

## Evidence on Hand

- `content/` (built into `data/structure.json` + `data/lang/fa.json`) — six Freising topics with Farsi
  and German step text. This content is real and reviewed for meaning.
- `audio/**/*.mp3` — **silent placeholders**, generated by
  `tools/gen_silent_audio.py`. No real audio exists yet.
- `icons/` — plain generated squares, placeholders.
- **Authority phone numbers and locations are UNVERIFIED**, every entry flagged
  `"verified": false`. Office *names* are real. Numbers must be confirmed with
  the Landratsamt Freising before anyone relies on them. Future work must not
  present unverified contact data as confirmed, and must not invent more.
- No user research, usage data, or field testing has been done yet.

## Product Principles

1. **Reading is a bonus, never a requirement.** Every path to every answer must
   be completable by someone who cannot read a single word on the screen.
   Text is the redundant channel, not the primary one.
2. **Offline is the normal case.** A feature that only works online is a feature
   that fails when it is needed most. Network-dependent paths degrade to
   working ones; they never dead-end.
3. **Never strand the user.** Every failure state — no mic, no network, no
   match, no audio — resolves to a visible, tappable way forward. There is no
   error the user has to read their way out of.
4. **Say only what is verified.** This app sends people to physical offices with
   real deadlines. Unverified data is marked as such or withheld. Confidence in
   presentation must match confidence in the facts.
5. **Position is memory.** Users who cannot read navigate by shape, colour, and
   location. Things that move between visits destroy the only wayfinding they
   have.

## Accessibility & Inclusion

Target: WCAG 2.2 AA, with two amplifications that outrank it for this audience.

- **Non-literate access is the primary requirement**, not an accommodation.
  Icon, audio, and spatial memory carry meaning; text supports it.
- **The screen-reader path and the illiterate-user path are the same path.**
  Every control must be a real, focusable, labelled control with correct role
  and state. A `<div>` with a click handler fails both groups at once.
- Meaning is never carried by colour alone — always colour plus icon plus,
  where possible, position.
- Touch targets sized for stressed use on cheap hardware: 48px minimum, larger
  for primary actions.
- Full RTL support with per-language direction switching.
- Respect `prefers-reduced-motion`.
