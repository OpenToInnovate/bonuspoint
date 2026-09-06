import { defineConfig } from 'vite';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/**
 * Injects the built hashed asset list into dist/sw.js (self.__BP_ASSETS) and
 * rewrites the cache name to a content-derived version, so every deploy
 * precaches all assets and stale caches are dropped on activate.
 */
function swPrecache() {
  return {
    name: 'bp-sw-precache',
    apply: 'build',
    closeBundle() {
      const root = fileURLToPath(new URL('.', import.meta.url));
      const assets = readdirSync(`${root}dist/assets`)
        .filter((f) => /\.(js|css)$/.test(f))
        .sort()
        .map((f) => `./assets/${f}`);
      const version = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 8);
      const path = `${root}dist/sw.js`;
      let sw = readFileSync(path, 'utf8');
      sw = sw.replace('__BP_CACHE__', `bonuspoint-${version}`).replace('self.__BP_ASSETS || []', JSON.stringify(assets));
      writeFileSync(path, sw);
      console.log(`[sw-precache] cache bonuspoint-${version}, ${assets.length} assets`);
    },
  };
}

export default defineConfig({
  plugins: [swPrecache()],
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.2.1') },
});
