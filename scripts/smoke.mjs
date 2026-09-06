/* Headless smoke test: runs the real built bundle in jsdom with fake-indexeddb.
 * Usage: node scripts/smoke.mjs   (run `npm run build` first) */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const dist = new URL('../dist', import.meta.url).pathname;
const html = readFileSync(`${dist}/index.html`, 'utf8')
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/, '')
  .replace(/<link rel="stylesheet"[^>]*>/, '');
const bundle = readFileSync(dist + '/assets/' + readFileSync(dist + '/sw.js', 'utf8').match(/assets\/index-[^"]+\.js/)[0].split('/').pop(), 'utf8');

const dom = new JSDOM(html, { url: 'http://127.0.0.1:8791/bonuspoint/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.indexedDB = globalThis.indexedDB;
window.confirm = () => true;
if (!window.crypto?.randomUUID) {
  Object.defineProperty(window, 'crypto', { value: { ...window.crypto, randomUUID: () => globalThis.crypto.randomUUID() } });
}
window.scrollTo = () => {};
window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {}, clearRect() {} });
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,x';

let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + name); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (sel) => window.document.querySelector(sel);
const qa = (sel) => [...window.document.querySelectorAll(sel)];
const text = () => window.document.body.textContent;

function click(node) { node.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }
function input(node, v) { node.value = v; node.dispatchEvent(new window.Event('input', { bubbles: true })); }
async function settle() { await sleep(120); }

window.eval(bundle); // run the real bundle
await settle();

// 1. First-run experience
check('empty state welcome', text().includes('Welcome to Bonus Point'));
check('add-first-card CTA', !!q('.empty-state .btn-red'));

// 2. Add flow -> custom card -> manual entry -> save
click(q('.empty-state .btn-red')); await settle();
check('add view popular grid', !!q('.popular-grid'));
click(qa('.popular-grid .card-tile').at(-1)); await settle(); // custom card
check('scan view', text().includes('Scan barcode'));
check('camera fallback hint', text().includes('Camera unavailable'));
click(qa('.scan-row')[0]); await settle();
const nameIn = q('.scan-form input[type=text]');
const numIn = q('.scan-form .field:nth-of-type(2) input') || qa('.scan-form input')[1];
input(nameIn, 'Café Uno ☕'); input(numIn, '1234567890');
click(q('.scan-form .btn-primary')); await settle();
check('detail after save', text().includes('Successfully added your card!'));
check('detail shows name', text().includes('Café Uno ☕'));

// 3. History: back should go to add (replace was used), again to list
window.history.back(); await settle();
check('back -> add view', !!q('.popular-grid'));
window.history.back(); await settle();
check('back -> list with card', !!q('.cards-grid .card-tile:not(.add-tile)'));
check('unicode initial on tile', text().includes('C'));

// 4. Search filter + no-match
input(q('.search-bar'), 'zzz'); await settle();
check('no-match message', text().includes('No cards match your search'));
input(q('.search-bar'), 'caf'); await settle();
check('search finds card', text().includes('Café Uno ☕'));
input(q('.search-bar'), ''); await settle();

// 5. Favorite toggle from tile star
click(q('.tile-star')); await settle();
check('favorite on', !!q('.tile-star.on'));

// 6. Detail view: QRish toggle, notes, archive
click(q('.cards-grid .card-tile:not(.add-tile)')); await settle();
check('detail view opens', text().includes('Manage'));
click(qa('.quick-actions button')[1]); await settle(); // toggle barcode/QR
check('after toggle still on detail', text().includes('Manage'));
click(qa('.quick-actions button')[2]); await settle(); // favorite
click(qa('.manage-row')[1]); await settle(); // Notes
const area = q('textarea'); input(area, 'terms apply');
click(q('.form .btn-primary')); await settle();
check('notes saved back to detail', text().includes('terms apply'.slice(0, 10)));

// 7. Archive + restore via settings
click(qa('.manage-row')[3]); await settle(); // Archive (confirm stubbed true)
await settle();
check('back on list after archive', !!q('.cards-grid'));
click(qa('.bottom-nav button')[2]); await settle(); // settings
check('settings shows dark theme row', text().includes('Dark theme: Off'));
click(qa('.settings-group button')[3]); await settle(); // Archived cards
check('archived list shows card', text().includes('Café Uno ☕'));
click(q('.row-card button')); await settle(); // restore
check('restore toast', text().includes('Card restored'));

// 8. Theme toggle + persistence
click(qa('.bottom-nav button')[2]); await settle();
click(qa('.settings-group button')[2]); await settle();
check('dark theme applied', window.document.body.classList.contains('dark'));
check('theme-color meta dark', q('meta[name=theme-color]').getAttribute('content') === '#101012');

// 9. Delete-all guarded by confirm; then clean up card
click(qa('.settings-group button')[4]); await settle();
check('delete-all toast', text().includes('All cards deleted'));

// 10. Version rendered
check('version in settings', /v0\.2\.1/.test(text()));

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
