# Compass — Wegweiser

Offline-first PWA that gives newcomers a **first line of orientation** for local
bureaucracy: roughly what this is, where to go, what to bring. Icon and audio
first, so it works for someone who cannot read.

It is deliberately not a manual. When a topic starts needing a full procedure,
that is a signal to point at a caseworker, not to add steps.

Pilot: county of **Freising**, language **Farsi/Dari**.

## Stack

- Vanilla JS + ES modules, no build step
- Service Worker: shell cache-first, data stale-while-revalidate, audio cached on play
- Web Speech API for speech-to-text, language taken from the active locale
- Voice → topic routing behind one interface, both returning `{ slug, confidence, clarify }`:
  - **mock** (default): offline keyword matcher, no secrets
  - **proxy**: `proxy/route.php` holding the API key

## Content model

Language is a runtime parameter, not a hardcoded fact. Adding a language is a
data job — two files, no code change.

```
data/structure.json     county, languages, router_mode, authorities,
                        topic + step ids, icons, urgency, German text
data/lang/<code>.json   everything in that language: UI strings, topic and
                        step text, keywords, authority names
```

**German lives in `structure.json`**, not in the language files — German is
German regardless of who is reading, and showing the German term is how a user
points at what they need at the counter.

The split also guarantees every language gets the same topics in the same
order. Users who cannot read navigate by position; a grid that re-sorts itself
between visits destroys the only wayfinding they have.

### Adding a language

1. Copy `data/lang/fa.json`, translate it, save as `data/lang/<code>.json`
2. Add an entry to `languages` in `data/structure.json`
   (`code`, `name` in its own script, `dir`, `stt` tag)
3. Run `python tools/gen_silent_audio.py`

## Audio

Path by convention: `audio/<lang>/<topic>/{full,step-N}.mp3`. Nothing stores
these paths, so dropping a native speaker's recording at the path replaces the
generated one — no JSON edit anywhere.

```sh
python tools/gen_silent_audio.py   # placeholder MP3s for every missing clip
python tools/gen_icons.py          # PWA icons
```

The generator records what it created in `audio/generated.json` with a hash of
the source text. Re-runs only touch its own files. A **human recording is never
overwritten** — but if the text behind one has changed since it was recorded,
the script says so, because a recording that no longer matches its text is
worse than a missing one.

> The committed audio is **silent placeholders**. `synthesize()` in the script
> is the single function to replace with a real TTS provider.

## Run locally

ES modules and the Service Worker need HTTP, not `file://`.

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>. The mic needs a secure context — `localhost`
counts, a real domain needs HTTPS.

## Deploy

**GitHub Pages — testing.** Enable Pages → deploy from `main` / root. All paths
are relative, so a project subpath works. `router_mode` stays `"mock"`; there is
no server side, so the offline matcher is the only router.

**Hostinger — production.** Upload the repo to the webroot, then:

1. `proxy/route.php` → `<webroot>/api/route.php`
2. `composer require anthropic-ai/sdk` next to it
3. `.htaccess`: `SetEnv ANTHROPIC_API_KEY sk-ant-...`
4. Set `"router_mode": "proxy"` in `data/structure.json`

Same code both places; only the config differs. If the proxy is unreachable,
routing falls back to the offline matcher on its own.

## ⚠️ Authority data is unverified

`data/structure.json` flags every entry `"verified": false`, and the app shows
that flag to the user. Office **names** are real; **phone numbers and locations
are placeholders** and must be confirmed with the Landratsamt Freising before
anyone relies on them. Map links search by office name, so they resolve
correctly without hardcoded coordinates.

## Layout

```
index.html              language picker, home grid, topic, voice overlay
css/styles.css          flat, high-contrast, direction-neutral (logical properties)
js/app.js               boot, language resolution, hash routing
js/content.js           loads and merges structure + language; single content source
js/player.js            topic screen and audio
js/voice.js             speech-to-text overlay
js/router.js            voice → topic matching, locale-aware normalization
sw.js                   three-tier Service Worker
proxy/route.php         API-key proxy (Hostinger)
tools/                  asset generators
```
