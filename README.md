# Compass — Wegweiser

Offline-first PWA that gives newcomers a **first line of orientation** for local
bureaucracy: roughly what this is, where to go, what to bring. Icon and audio
first, so it works for someone who cannot read.

It is deliberately not a manual. When a topic starts needing a full procedure,
that is a signal to point at a caseworker, not to add steps.

Pilot: county of **Freising**, language **Farsi/Dari**.

## Stack

- TypeScript, no framework. Vite builds it, Vitest tests it.
- Service Worker: shell cache-first, data stale-while-revalidate, audio cached on play.
  The build writes its file list and cache name (`vite.config.ts`).
- Web Speech API for speech-to-text, language taken from the active locale
- Voice → topic routing behind one interface, both returning `{ slug, confidence, clarify }`:
  - **mock** (default): offline keyword matcher, no secrets
  - **proxy**: `proxy/route.php` holding the API key

## Content model

Language is a runtime parameter, not a hardcoded fact. Adding a language is a
data job — two files, no code change.

```
public/data/structure.json     county, languages, router_mode, authorities,
                               topic + step ids, icons, urgency, German text
public/data/lang/<code>.json   everything in that language: UI strings, topic
                               and step text, keywords, authority names
```

**German lives in `structure.json`**, not in the language files — German is
German regardless of who is reading, and showing the German term is how a user
points at what they need at the counter.

The split also guarantees every language gets the same topics in the same
order. Users who cannot read navigate by position; a grid that re-sorts itself
between visits destroys the only wayfinding they have.

### Adding a language

1. Copy `public/data/lang/fa.json`, translate it, save as `public/data/lang/<code>.json`
2. Add an entry to `languages` in `public/data/structure.json`
   (`code`, `name` in its own script, `dir`, `stt` tag)
3. Run `python tools/gen_silent_audio.py`

## Audio

Path by convention: `public/audio/<lang>/<topic>/{full,step-N}.mp3`. Nothing stores
these paths, so dropping a native speaker's recording at the path replaces the
generated one — no JSON edit anywhere.

```sh
python tools/gen_silent_audio.py   # placeholder MP3s for every missing clip
python tools/gen_icons.py          # PWA icons
```

The generator records what it created in `public/audio/generated.json` with a hash of
the source text. Re-runs only touch its own files. A **human recording is never
overwritten** — but if the text behind one has changed since it was recorded,
the script says so, because a recording that no longer matches its text is
worse than a missing one.

> The committed audio is **silent placeholders**. `synthesize()` in the script
> is the single function to replace with a real TTS provider.

## Run locally

```sh
pnpm install
pnpm dev        # http://localhost:5173, no Service Worker
pnpm test
pnpm build      # type check, then dist/
pnpm preview    # serves dist/, with the Service Worker
```

The mic needs a secure context — `localhost` counts, a real domain needs HTTPS.
Append `?debug` to the URL for the routing inspector.

## Deploy

Pushing to `main` runs `.github/workflows/gruber-am.yml`: test, build, then
`rsync` of `dist/` to **compass.gruber.am** on Hostinger. Starting the workflow
by hand defaults to a dry run. The five secrets it needs are listed at the top
of the workflow file.

The site is a test deployment: `public/.htaccess` and a meta tag keep it out of
search engines.

GitHub Pages from the branch root no longer works — the repo holds sources, not
the built site.

**The routing proxy is not deployed yet.** `proxy/route.php` has to end up at
`<webroot>/api/route.php` with its Composer packages and an API key the web
server cannot hand out; until then `router_mode` stays `"mock"`. If the proxy
is unreachable, routing falls back to the offline matcher on its own.

## ⚠️ Authority data is unverified

`public/data/structure.json` flags every entry `"verified": false`, and the app shows
that flag to the user. Office **names** are real; **phone numbers and locations
are placeholders** and must be confirmed with the Landratsamt Freising before
anyone relies on them. Map links search by office name, so they resolve
correctly without hardcoded coordinates.

## Layout

```
index.html              language picker, home grid, topic, voice overlay
css/styles.css          flat, high-contrast, direction-neutral (logical properties)
src/app.ts              boot, language resolution, hash routing
src/content.ts          loads and merges structure + language; single content source
src/player.ts           topic screen and audio
src/voice.ts            speech-to-text overlay
src/router.ts           voice → topic matching, locale-aware normalization
src/debug.ts            routing inspector, loaded only behind ?debug
src/sw.js               Service Worker template, filled in by the build
public/                 served as is: data, audio, icons, manifest, .htaccess
test/                   Vitest: content merge, routing, the app in jsdom
proxy/route.php         API-key proxy (Hostinger)
tools/                  asset generators (Python, run once)
```
