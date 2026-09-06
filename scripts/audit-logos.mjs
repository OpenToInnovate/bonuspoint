// Logo coverage audit: every catalog entry must have a bundled, non-placeholder
// logo asset. Run: node scripts/audit-logos.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogSrc = readFileSync(join(root, 'src', 'catalog.js'), 'utf8');
const ids = [...catalogSrc.matchAll(/^\s*\{\s*id:\s*'([^']+)'/gm)].map((m) => m[1]);

let fail = 0;
for (const id of ids) {
  const p = join(root, 'src', 'assets', 'logos', `${id}.svg`);
  if (!existsSync(p)) { console.error(`MISSING  ${id}`); fail++; continue; }
  const svg = readFileSync(p, 'utf8');
  const hasGlyph = /<path\s/.test(svg) || /<text\s/.test(svg);
  const tintable = /fill="#ffffff"/i.test(svg);
  if (!hasGlyph) { console.error(`EMPTY    ${id} (no path/text)`); fail++; continue; }
  if (!tintable) { console.error(`NOTINT   ${id} (no fill="#ffffff" to tint)`); fail++; continue; }
}

const files = readdirSync(join(root, 'src', 'assets', 'logos'));
const orphans = files
  .filter((f) => f.endsWith('.svg') && !ids.includes(f.replace(/\.svg$/, '')));
for (const o of orphans) console.warn(`ORPHAN   ${o} (not in catalog)`);

console.log(fail === 0
  ? `OK: ${ids.length}/${ids.length} catalog brands have real tintable logo assets.`
  : `FAIL: ${fail} of ${ids.length} brands lack a proper logo.`);
process.exit(fail === 0 ? 0 : 1);
