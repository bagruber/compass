import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// The Service Worker has to know every file of the shell by name, and Vite
// names the built files by content hash. So the list is written after the
// build: src/sw.js is the template, this fills in what actually landed in dist.
//
// Audio is left out on purpose — it is cached on first play, never up front.
// The data files are in: without them a first visit leaves nothing to start
// from offline.
function serviceWorker(): Plugin {
  return {
    name: 'compass-sw',
    apply: 'build',
    writeBundle(options) {
      const dist = options.dir!;
      const shell = readdirSync(dist, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name).slice(dist.length + 1).replaceAll('\\', '/'))
        // The routing inspector is only fetched behind ?debug; precaching it
        // would download it for everyone. The server refuses to hand out
        // .htaccess, and one refused file fails the whole install.
        .filter((file) => !file.startsWith('audio/') && !file.includes('/debug-') && !file.startsWith('.'))
        .sort();

      // Named after the contents, not the file names: index.html and the
      // icons keep their names when they change, and a worker whose text
      // stays the same is never installed again.
      const hash = createHash('sha256');
      for (const file of shell) hash.update(file).update(readFileSync(join(dist, file)));

      writeFileSync(
        join(dist, 'sw.js'),
        readFileSync('src/sw.js', 'utf8')
          .replace('__CACHE__', `compass-${hash.digest('hex').slice(0, 8)}`)
          .replace("'__SHELL__'", JSON.stringify(['./', ...shell.map((file) => `./${file}`)]))
      );
    },
  };
}

export default defineConfig({
  // Relative, so the same build runs at a domain root and in a subfolder.
  base: './',
  plugins: [serviceWorker()],
});
