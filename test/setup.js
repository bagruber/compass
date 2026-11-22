// content.js loads its JSON with fetch(). In the tests the same files come
// straight from disk, so what is tested is the shipped data, not a fixture.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as content from '../src/content.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

// There is no proxy in the tests unless one of them puts one there: the
// endpoint answers as it does on a server without a key.
export async function staticFiles(path) {
  if (path.startsWith('api/')) return { ok: false, status: 503 };
  const body = await readFile(root + 'public/' + path, 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(body) };
}

export async function loadContent(lang = 'fa') {
  globalThis.fetch = staticFiles;
  await content.loadSpine();
  await content.loadLanguage(lang);
  return content;
}
