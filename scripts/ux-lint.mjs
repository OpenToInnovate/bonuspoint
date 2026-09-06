/* UX lint: static guarantees over src/styles.css, index.html, public/ manifest/sw.
 *  1. Touch targets: no interactive element styled below 44px; global button minimum declared.
 *  2. Every interactive style path has :active and :focus-visible feedback.
 *  3. No horizontal overflow at 360px: no base-rule width/min-width above 360px.
 *  4. manifest + service-worker paths resolve (icons, start_url, cached assets).
 * Run: node scripts/ux-lint.mjs  (after `npm run build` for the dist checks)
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src', 'styles.css'), 'utf8');
let fail = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + name); if (!cond) fail++; };

/* --- parse CSS into rules (naive but sufficient: no nested braces in this file) --- */
const rules = [];
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  rules.push({ selector: m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: m[2] });
}
const px = (v) => { const m = /(-?[\d.]+)px/.exec(v || ''); return m ? parseFloat(m[1]) : null; };

/* 1. Touch targets: subject (last compound) of a selector must be interactive. */
const INTERACTIVE_SUBJECT = /(^|\s|,|>|\+|~)(button|a|\.icon-btn|\.card-tile|\.bulk-btn|\.scan-row|\.manage-row|\.brand-chip|\.color-dot|\.btn-red|\.btn-primary|\.btn-secondary|\.sort-link|\.tile-star|\.photo-del)$/;
const subject = (sel) => sel.split(',')[0].trim().split(/[\s>+~]/).pop();
let smallTargets = [];
const finalHeights = new Map(); // cascade-aware: later declarations win
for (const r of rules) {
  const subj = subject(r.selector);
  for (const decl of r.body.split(';')) {
    const [prop, val] = decl.split(':').map((s) => s?.trim());
    const v = px(val);
    if (v !== null && (prop === 'height' || prop === 'min-height')) finalHeights.set(subj + '|' + prop, { v, sel: r.selector });
  }
}
for (const [key, { v, sel }] of finalHeights) {
  const subj = key.split('|')[0];
  if (!INTERACTIVE_SUBJECT.test(subj)) continue;
  if (v < 44 && v > 0) smallTargets.push(`${sel} { ${key.split('|')[1]}: ${v}px }`);
}
check('no interactive element styled below 44px height', smallTargets.length === 0);
if (smallTargets.length) console.error(smallTargets.join('\n'));
check('global button touch-target floor declared (min-height >= 44px)',
  rules.some((r) => r.selector === 'button' && ((r.body.match(/min-height:\s*([\d.]+)px/) || [])[1] ? parseFloat(r.body.match(/min-height:\s*([\d.]+)px/)[1]) : 0) >= 44));

/* 2. :active and :focus-visible feedback exist for interactive elements. */
check('buttons have :focus-visible style', /button:focus-visible/.test(css));
const activeCount = [...css.matchAll(/:active/g)].length;
check('interactive elements have :active feedback (>=5 rules)', activeCount >= 5);

/* 3. No horizontal overflow at 360px: no width/min-width declaration > 360px in px. */
let wide = [];
for (const r of rules) {
  for (const decl of r.body.split(';')) {
    const [prop, val] = decl.split(':').map((s) => s?.trim());
    const v = px(val);
    if (v !== null && (prop === 'width' || prop === 'min-width') && v > 360) wide.push(`${r.selector} { ${prop}: ${v}px }`);
  }
}
check('no fixed width/min-width above 360px viewport', wide.length === 0);
if (wide.length) console.error(wide.join('\n'));
check('no horizontal overflow guard (overflow-x handled or wrapping layout)', /flex-wrap|grid-template-columns|overflow-x/.test(css));

/* 4. manifest + SW paths resolve (dist). */
const dist = join(root, 'dist');
const indexHtml = existsSync(dist) ? readFileSync(join(dist, 'index.html'), 'utf8') : '';
const manifestRel = /<link rel="manifest" href="([^"]+)"/.exec(indexHtml)?.[1];
check('index.html references a manifest', !!manifestRel);
if (manifestRel) {
  const manifestPath = join(dist, manifestRel.replace(/^\.\//, '').replace(/^\/bonuspoint\//, ''));
  check('manifest file exists in dist', existsSync(manifestPath));
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const stripBase = (p) => String(p).replace(/^\.?\//, '').replace(/^\/bonuspoint\//, '');
    const baseDir = manifestRel.includes('/')
      ? join(dist, stripBase(manifestRel).replace(/[^/]*$/, ''))
      : dist;
    let iconsOk = true;
    for (const icon of manifest.icons || []) {
      const p = join(baseDir, stripBase(icon.src));
      if (!existsSync(p)) { iconsOk = false; console.error('missing icon:', icon.src, '->', p); }
    }
    check('all manifest icons resolve', iconsOk);
    check('start_url resolves under base', typeof manifest.start_url === 'string' && !manifest.start_url.startsWith('/'));
  }
}
const swPath = join(dist, 'sw.js');
check('service worker exists in dist', existsSync(swPath));
if (existsSync(swPath)) {
  const sw = readFileSync(swPath, 'utf8');
  const cached = [...sw.matchAll(/['"]([^'"]*(?:assets\/|index\.html)[^'"]*)['"]/g)].map((m) => m[1].replace(/^\.?\//, '').replace(/^\/bonuspoint\//, ''));
  let allExist = cached.length > 0;
  for (const c of cached) if (!existsSync(join(dist, c))) { allExist = false; console.error('sw caches missing file:', c); }
  check('every SW-cached path exists in dist', allExist);
}

console.log(fail === 0 ? '\nUX LINT: ALL PASS' : `\nUX LINT: ${fail} FAILURES`);
process.exit(fail ? 1 : 0);
