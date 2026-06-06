# Audio Guide — Wegweiser Deutschland

Static, offline-first PWA that helps newcomers navigate local bureaucracy by
**icon and audio first** (illiteracy-first UX). Prototype: county of **Freising**,
language **Farsi/Dari**.

Speak or tap a category → step-by-step player, each step with its own audio and
an expandable German detail.

## Stack

- Vanilla JS + ES modules, no build step
- Service Worker for offline caching of shell + audio
- Web Speech API for speech-to-text (`fa-IR`)
- Voice → category routing behind one interface:
  - **mock** (default): client-side keyword matcher, works offline, no secrets
  - **proxy**: Cloudflare Worker calling Claude Haiku (`proxy/route-worker.js`)
- `data/topics.json` is the single content source

## Run locally

Any static file server works — ES modules and the Service Worker need HTTP
(not `file://`).

```sh
# Python
python -m http.server 8000

# or Node
npx serve .
```

Then open <http://localhost:8000>.

> The mic (Web Speech STT) requires a secure context. `localhost` counts as
> secure, so it works in local dev; on a real domain you need HTTPS.

## Regenerate placeholder assets

The committed audio is **silent placeholders** and the icons are plain squares —
both are throwaway scaffolding to be replaced before release.

```sh
python tools/gen_silent_audio.py   # writes a silent MP3 to every path in topics.json
python tools/gen_icons.py          # writes icons/icon-192.png and icon-512.png
```

To add or edit content, change `data/topics.json` and re-run `gen_silent_audio.py`
to create matching audio files.

## ⚠️ Content accuracy — authority data is unverified

`data/topics.json` includes an `authorities` map (offices each topic points to,
shown as a "where to go" card with directions + call buttons). The office
**names** are real, but **phone numbers and exact locations are placeholders**
and every entry is flagged `"verified": false`. The map links search by office
*name*, so they resolve to the right place without hardcoded coordinates, but
the phone numbers must be confirmed with the Landratsamt Freising before release.

## Deploy (GitHub Pages)

Push to the `main` branch and enable Pages → "Deploy from branch" → `main` / root.
Everything is relative-pathed, so it also works from a project subpath
(`user.github.io/repo/`).

## Switch routing to Claude Haiku (optional)

The mock keyword router is the default. To use real intent routing:

1. Deploy the proxy:
   ```sh
   cd proxy
   wrangler secret put ANTHROPIC_API_KEY   # set your key as a Worker secret
   wrangler deploy
   ```
2. In `js/router.js` set `ROUTER_MODE = 'proxy'` and point `PROXY_ENDPOINT` at
   the deployed Worker URL.

The client contract (`{ slug, confidence, clarify }`) is identical, so no other
code changes. If the proxy is unreachable, routing falls back to the mock matcher.

## Project layout

```
index.html              # three screens: home grid, topic player, voice overlay
css/styles.css          # RTL, illiteracy-first styling
js/app.js               # topics load, hash routing, SW registration
js/router.js            # mock keyword matcher + proxy-mode flag
js/player.js            # step audio player
js/voice.js             # Web Speech STT overlay
data/topics.json        # single content source (6 Freising categories)
audio/<topic>/*.mp3      # per-topic / per-step audio (silent placeholders)
icons/                  # PWA icons (placeholders)
sw.js                   # Service Worker (precache shell, cache-first audio)
manifest.webmanifest    # PWA manifest
proxy/route-worker.js   # Cloudflare Worker routing stub (Claude Haiku)
tools/                  # asset generators
```
