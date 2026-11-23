# Compass — Wegweiser

Offline-first PWA that gives newcomers a **first line of orientation** for local
bureaucracy: roughly what this is, where to go, what to bring. Icon and audio
first, so it works for someone who cannot read.

It is deliberately not a manual. When a topic starts needing a full procedure,
that is a signal to point at a caseworker, not to add steps.

Pilot: county of **Freising**, language **Farsi/Dari**.

## Stack

- TypeScript, no framework. Vite builds it, Vitest tests it.
- Service Worker: shell cache-first, data stale-while-revalidate, audio cached on play
  in a cache of its own that outlives releases. The build writes the file list and
  both cache names (`vite.config.ts`).
- Web Speech API for speech-to-text, language taken from the active locale.
  A text field takes the same question typed.
- Spoken or typed phrase → topic, behind one interface with two backends, both
  returning `{ slug, confidence, options }`. Neither writes text: a phrase that
  could mean two topics comes back as those two, and the app marks both tiles:
  - **proxy**: `proxy/route.php` asks a language model, so a sentence that
    describes a situation finds its topic without containing a keyword
  - **mock**: offline keyword matcher, no secrets. Takes over whenever the
    proxy is unreachable, slow, over its limit or not configured.

## Content model

Content is written in `content/` and built into the JSON the app reads.
Language is a runtime parameter, not a hardcoded fact: adding a language is a
writing job, no code change.

```
content/base.json              county, languages, router_mode, authorities,
                               and the order of the cases on the home screen
content/lang/<code>.json       UI strings and authority names in that language
content/cases/<id>.md          one case in German: icon, authority, title,
                               deadline, steps
content/cases/<id>.<code>.md   the same case in another language, plus the
                               keywords the offline matcher listens for
```

`pnpm content` (`tools/build_content.mjs`) turns this into
`public/data/structure.json` and `public/data/lang/<code>.json`. Both are
generated and not in git; `pnpm dev`, `pnpm test` and `pnpm build` run the step
first. It stops on a mistake and names the file: a translation with a different
number of steps than the German case, more than seven steps, an authority that
does not exist, a case file that is not in the list.

A case reads like this, and its translation mirrors it section by section:

```markdown
---
icon: 🏠
authority: buergerbuero
urgency: high
---

# Wohnsitz anmelden

## Frist

Wichtig: innerhalb von 14 Tagen nach dem Einzug

## Schritte

1. Termin beim Bürgerbüro vereinbaren
2. Wohnungsgeberbestätigung vom Vermieter holen
```

**German is the source.** It is German regardless of who is reading, and
showing the German term is how a user points at what they need at the counter.
A case that has no translation yet is left out in that language, not shown
half-translated.

The order in `base.json` is the order on the home screen, in every language.
Users who cannot read navigate by position; a grid that re-sorts itself between
visits destroys the only wayfinding they have.

### Adding a case

1. Write `content/cases/<id>.md` and add `<id>` to `topics` in `content/base.json`
2. Write `content/cases/<id>.<code>.md` for each language
3. Run `pnpm content`, then `python tools/gen_silent_audio.py`

### Adding a language

1. Copy `content/lang/fa.json`, translate it, save as `content/lang/<code>.json`
2. Add an entry to `languages` in `content/base.json`
   (`code`, `name` in its own script, `dir`, `stt` tag)
3. Translate the cases: `content/cases/<id>.<code>.md`
4. Run `pnpm content`, then `python tools/gen_silent_audio.py`

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

**The routing proxy** is deployed by the same workflow: `composer install` in
`proxy/`, then `route.php` and `vendor/` go to `<webroot>/api/`. The API key
is not in the repo and not under the webroot. It lives in a file one level
above `public_html`, which has to be created once by hand:

```php
<?php return ['anthropic_api_key' => 'sk-ant-...'];
```

saved as `/home/<user>/domains/gruber.am/compass-config.php`. Without that
file the proxy answers 503 and the app routes by keyword. The proxy counts
requests in `compass-rate.json` next to it: 20 per address in ten minutes,
1000 a day in total.

What was said is sent to the Anthropic API to be routed and is stored nowhere
on this server.

## ⚠️ Authority data is unverified

`content/base.json` flags every entry `"verified": false`, and the app shows
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
proxy/                  route.php and its Composer packages; deployed to api/
tools/                  asset generators (Python, run once)
```
