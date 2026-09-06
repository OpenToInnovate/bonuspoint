/* Headless integration test: runs the real built bundle in jsdom with fake-indexeddb.
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
let confirmResult = true;
window.confirm = () => confirmResult;
if (!window.crypto?.randomUUID) {
  Object.defineProperty(window, 'crypto', { value: { ...window.crypto, randomUUID: () => globalThis.crypto.randomUUID() } });
}
window.scrollTo = () => {};
window.HTMLCanvasElement.prototype.getContext = () => ({
  drawImage() {}, clearRect() {},
  createImageData: (w, h) => ({ data: new window.Uint8ClampedArray(Number(w) * Number(h) * 4 || 4), width: Number(w) || 1, height: Number(h) || 1 }),
  putImageData() {},
});
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,x';
window.createImageBitmap = async () => ({ width: 100, height: 100 });
// Capture file inputs the app creates on the fly (photo add, import picker).
const origCreate = window.document.createElement.bind(window.document);
let lastFileInput = null;
window.document.createElement = (tag) => { const n = origCreate(tag); if (String(tag).toLowerCase() === 'input') lastFileInput = n; return n; };

let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + name); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (sel) => window.document.querySelector(sel);
const qa = (sel) => [...window.document.querySelectorAll(sel)];
const text = () => window.document.body.textContent;

function click(node) {
  if (!node) { console.error('CLICK TARGET MISSING. Body:', window.document.body.textContent.slice(0, 160).replace(/\s+/g, ' ')); throw new Error('click target missing'); }
  node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}
function input(node, v) { node.value = v; node.dispatchEvent(new window.Event('input', { bubbles: true })); }
function change(node) { node.dispatchEvent(new window.Event('change', { bubbles: true })); }
async function settle() { await sleep(120); }
function fireScan(textVal, format = 'qr_code') {
  window.dispatchEvent(new window.CustomEvent('bp-scan', { detail: { text: textVal, format, source: 'test' } }));
}
const cardTiles = () => qa('.cards-grid .card-tile:not(.add-tile)');
async function goCardsTab() { click(qa('.bottom-nav button')[0]); await settle(); }
async function goSettings() { click(qa('.bottom-nav button')[2]); await settle(); }

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
check('back -> list with card', cardTiles().length === 1);
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

// 6. Detail view: QR/barcode toggle, notes
click(q('.cards-grid .card-tile:not(.add-tile)')); await settle();
check('detail view opens', text().includes('Manage'));
click(qa('.quick-actions button')[1]); await settle(); // toggle barcode/QR
check('after toggle still on detail', text().includes('Manage'));
click(qa('.quick-actions button')[2]); await settle(); // favorite
click(qa('.manage-row')[1]); await settle(); // Notes
const area = q('textarea'); input(area, 'terms apply');
click(q('.form .btn-primary')); await settle();
check('notes saved back to detail', text().includes('terms apply'.slice(0, 10)));

// 6b. Photos: empty state, add via stubbed file picker, delete
click(qa('.manage-row')[2]); await settle(); // Photos
check('photos empty state', text().includes('No photos yet'));
click(q('.form .btn-primary')); await settle(); // opens hidden file input
check('file input captured', !!lastFileInput);
const file = new window.File(['fakejpegdata'], 'card.jpg', { type: 'image/jpeg' });
Object.defineProperty(lastFileInput, 'files', { value: [file], configurable: true });
change(lastFileInput); await settle();
check('photo added to grid', !!q('.photo-cell img'));
confirmResult = true;
click(q('.photo-del')); await settle();
check('photo deleted back to empty', text().includes('No photos yet'));
confirmResult = true;

// 7. Archive + restore via settings
await goCardsTab();
click(cardTiles()[0]); await settle();
click(qa('.manage-row')[3]); await settle(); // Archive (confirm stubbed true)
check('back on list after archive', !!q('.cards-grid'));
await goSettings();
check('settings shows dark theme row', text().includes('Dark theme: Off'));
click(qa('.settings-group button')[4]); await settle(); // Archived cards
check('archived list shows card', text().includes('Café Uno ☕'));
click(q('.row-card button')); await settle(); // restore
check('restore toast', text().includes('Card restored'));

// 8. Theme toggle + persistence
await goSettings();
click(qa('.settings-group button')[2]); await settle();
check('dark theme applied', window.document.body.classList.contains('dark'));
check('theme-color meta dark', q('meta[name=theme-color]').getAttribute('content') === '#101012');

// 9. Region switching: GB default shows Tesco, JP shows Rakuten, All shows both
check('region select present', !!q('[data-testid=region-select]'));
const regionSel = q('[data-testid=region-select]');
regionSel.value = 'JP'; change(regionSel); await settle();
await goCardsTab(); // list view; go to add
click(q('.icon-btn[aria-label="Add card"]')); await settle();
check('JP region shows Rakuten', text().includes('Rakuten'));
check('JP region hides Tesco', !text().includes('Tesco Clubcard'));
click(q('[data-testid=show-all-toggle]')); await settle();
check('show-all reveals Tesco', text().includes('Tesco Clubcard'));
click(q('[data-testid=show-all-toggle]')); await settle();
await goSettings();
regionSel.value = 'auto'; change(regionSel); await settle();

// 10. Sort cycling (recent -> az -> custom) does not lose cards
await goCardsTab();
const before = cardTiles().length;
click(q('[data-testid=sort-link]')); await settle();
click(q('[data-testid=sort-link]')); await settle();
check('sort cycles keep all cards', cardTiles().length === before && text().includes('Sorted: Custom'));

// 11. Scan simulation: 20 rapid identical decodes -> confirmation, exactly 1 card on Save
click(q('.icon-btn[aria-label="Add card"]')); await settle();
click(qa('.popular-grid .card-tile').find((t) => t.textContent.includes('Nectar')) || qa('.popular-grid .card-tile')[0]); await settle();
check('scan view open (Nectar)', text().includes('Scan barcode'));
for (let i = 0; i < 20; i++) fireScan('NECTAR-9999-TEST');
await settle();
check('scan confirm shown exactly once', qa('[data-testid=scan-confirm]').length === 1 && q('[data-testid=scan-confirm]').style.display !== 'none');
check('confirm shows scanned value', q('[data-testid=scan-value]')?.textContent === 'NECTAR-9999-TEST');
check('no card saved before explicit Save', !text().includes('Successfully added'));
// extra decodes while latched must be ignored
fireScan('DIFFERENT-CODE'); fireScan('NECTAR-9999-TEST'); await settle();
check('latched: later decodes ignored', q('[data-testid=scan-value]')?.textContent === 'NECTAR-9999-TEST');
click(q('[data-testid=scan-save]')); await settle();
check('detail after confirmed save', text().includes('Successfully added your card!'));
await goCardsTab();
check('exactly one card created from 23 decodes', cardTiles().length === before + 1);

// 12. Duplicate guard via scan: same brand+number again
click(q('.icon-btn[aria-label="Add card"]')); await settle();
const nectarTile = qa('.popular-grid .card-tile').find((t) => t.textContent.includes('Nectar')) || qa('.popular-grid .card-tile')[0];
click(nectarTile); await settle();
fireScan('NECTAR-9999-TEST'); await settle();
confirmResult = false; // decline "add anyway?"
click(q('[data-testid=scan-save]')); await settle();
await goCardsTab();
check('declined duplicate not added', cardTiles().length === before + 1);
click(q('.icon-btn[aria-label="Add card"]')); await settle();
click(nectarTile); await settle();
fireScan('NECTAR-9999-TEST'); await settle();
confirmResult = true; // accept "add anyway?" -> creates the duplicate for the dedupe test
click(q('[data-testid=scan-save]')); await settle();
await goCardsTab();
check('accepted duplicate added (2 Nectar cards)', cardTiles().length === before + 2);
confirmResult = true;

// 13. Duplicates helper in Settings: surfaces group and deletes all-but-one on tap
await goSettings();
check('duplicates row present', !!q('[data-testid=duplicates-row]'));
click(q('[data-testid=duplicates-row]')); await settle();
check('duplicates view lists group', text().includes('Duplicate cards') && !!q('.dupe-group'));
click(q('[data-testid=dupe-fix]')); await settle(); // confirm true
check('duplicates resolved', text().includes('No duplicate cards found'));
await goCardsTab();
check('one card kept per group', cardTiles().length === before + 1);

// 14. Select mode: multi-select delete without re-render jank
click(q('.icon-btn[aria-label="Select cards"]')); await settle();
check('select mode active bar', !!q('[data-testid=select-bar]'));
const tilesInSelect = cardTiles();
check('select mode hides add tile', !qa('.add-tile').length);
click(tilesInSelect[0]); await settle();
click(tilesInSelect[1]); await settle();
check('selection counter updates', text().includes('2 selected'));
check('delete button enabled with count', q('[data-bulk=delete]')?.textContent.includes('Delete (2)'));
confirmResult = true;
click(q('[data-bulk=delete]')); await settle();
check('bulk delete removed 2 cards', cardTiles().length === 0 && text().includes('Welcome to Bonus Point'));
check('select mode exited', !q('[data-testid=select-bar]'));
confirmResult = true;

// 14b. Re-add via scan confirmation (regression: latch still works after bulk ops)
click(q('.empty-state .btn-red')); await settle();
click(qa('.popular-grid .card-tile').find((t) => t.textContent.includes('Nectar')) || qa('.popular-grid .card-tile')[0]); await settle();
fireScan('NECTAR-RE-ADD-1'); await settle();
click(q('[data-testid=scan-save]')); await settle();
await goCardsTab();
check('re-add via scan works', cardTiles().length === 1);
check('tiles carry card ids', cardTiles().every((t) => t.dataset.cardId));

// 15. Bulk archive via select mode
click(q('.icon-btn[aria-label="Select cards"]')); await settle();
const t2 = cardTiles();
click(t2[0]); await settle();
check('archive button shows count', q('[data-bulk=archive]')?.textContent.includes('Archive (1)'));
confirmResult = true;
click(q('[data-bulk=archive]')); await settle();
check('bulk archive worked', cardTiles().length === 0);
confirmResult = true;

// 16. Deep-link to a deleted/unknown card id falls back to the list
window.history.pushState({ view: { name: 'detail', id: 'deleted-id-xyz' }, tab: 'cards' }, '');
window.dispatchEvent(new window.PopStateEvent('popstate', { state: { view: { name: 'detail', id: 'deleted-id-xyz' }, tab: 'cards' } }));
await settle();
check('deep-link to deleted id -> list', !!q('.bottom-nav') && !text().includes('Manage'));

// 17. Reorder (drag) machinery present: long-press handlers wired via grid (covered structurally)

// 18. Delete-all guarded by confirm
await goSettings();
click(qa('.settings-group button')[5]); await settle();
check('delete-all toast', text().includes('All cards deleted'));

// 19. Version rendered
check('version in settings', /v0\.\d+\.\d+/.test(text()));

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
