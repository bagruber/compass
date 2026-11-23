// Offline caching for cheap Android on patchy data. Three tiers, because the
// asset types have genuinely different needs:
//
//   shell (html/css/js)  cache-first, versioned. The build writes the name
//                        and the file list (vite.config.ts).
//   data  (json)         stale-while-revalidate. Serves instantly offline, but
//                        a corrected phone number reaches users on the next
//                        visit instead of waiting for a version bump.
//   audio (mp3)          kept on first play. Never precached: this
//                        audience is on prepaid data and downloading every
//                        language up front would spend their money for them.
//                        In a cache of its own, named after the recordings,
//                        so a release that changes none of them leaves what
//                        was already heard on the phone.

const CACHE = '__CACHE__';
const AUDIO = '__AUDIO__';

const SHELL = '__SHELL__';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== AUDIO).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isData(url) {
  return url.pathname.includes('/data/') && url.pathname.endsWith('.json');
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  // Cached copy wins the race; the refresh lands for next time.
  if (cached) return cached;
  const response = await network;
  if (response) return response;
  return new Response('{}', { headers: { 'Content-Type': 'application/json' }, status: 503 });
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && new URL(request.url).origin === self.location.origin) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

// A player asks for audio in byte ranges, and a partial answer cannot be put
// in a cache. So the whole file is fetched and kept once, and each range is
// cut from that copy.
async function audio(request) {
  const cache = await caches.open(AUDIO);
  let whole = await cache.match(request.url);
  if (!whole) {
    whole = await fetch(request.url);
    if (!whole.ok) return whole;
    cache.put(request.url, whole.clone());
  }

  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') || '');
  if (!range) return whole;

  const bytes = await whole.arrayBuffer();
  const start = Number(range[1]);
  const end = range[2] ? Number(range[2]) : bytes.byteLength - 1;
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': whole.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${bytes.byteLength}`,
    },
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/audio/')) event.respondWith(audio(request));
  else event.respondWith(isData(url) ? staleWhileRevalidate(request) : cacheFirst(request));
});
