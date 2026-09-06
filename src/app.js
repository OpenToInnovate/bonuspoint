/**
 * Bonus Point — app shell & views (vanilla JS, hash-less view switching).
 */
import { db } from './db.js';
import { CATALOG, FORMATS } from './catalog.js';
import { renderBarcode, groupNumber } from './barcode.js';
import { startScan, nativeDetectorSupported } from './scanner.js';
import './styles.css';

const app = document.getElementById('app');
let toastTimer = null;

const state = {
  tab: 'cards',          // cards | offers | settings
  view: { name: 'list' } // { name, ...params }
};

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v; // only ever fed our own markup
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c != null) node.append(c);
  return node;
}

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = el('div', { class: 'toast' }, [msg]);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2200);
}

function uid() { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()); }

/* ---------------- Bottom nav ---------------- */
function renderNav() {
  const nav = el('nav', { class: 'bottom-nav' }, [
    navBtn('CARDS', '🎟️', 'cards'),
    navBtn('OFFERS', '🏷️', 'offers'),
    navBtn('SETTINGS', '⚙️', 'settings'),
  ]);
  app.append(nav);
}
function navBtn(label, ico, tab) {
  return el('button', { class: state.tab === tab && viewIsTabLevel() ? 'active' : '', onclick: () => { state.tab = tab; state.view = { name: tab === 'cards' ? 'list' : tab }; render(); } }, [
    el('span', { class: 'nav-ico' }, [ico]), label,
  ]);
}
function viewIsTabLevel() {
  return ['list', 'offers', 'settings'].includes(state.view.name);
}

/* ---------------- Cards list ---------------- */
async function renderCardsList() {
  const cards = (await db.listCards()).filter((c) => !c.archived).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  const header = el('div', { class: 'topbar' }, [
    el('h1', {}, ['Cards']),
    el('button', { class: 'icon-btn', 'aria-label': 'Add card', onclick: () => { state.view = { name: 'add' }; render(); } }, ['+']),
  ]);

  const grid = el('div', { class: 'cards-grid' });
  if (!cards.length) {
    grid.append(
      el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
        el('div', { class: 'big-ico' }, ['🎟️']),
        el('div', { style: 'font-weight:700;font-size:18px' }, ['No cards yet']),
        el('button', { class: 'btn-red', onclick: () => { state.view = { name: 'add' }; render(); } }, ['Add your first card']),
      ]),
    );
  }
  for (const c of cards) {
    grid.append(el('button', {
      class: 'card-tile', style: `background:${c.color}`,
      onclick: () => { state.view = { name: 'detail', id: c.id }; render(); },
    }, [
      el('div', { class: 'tile-name' }, [c.name]),
      c.number ? el('div', { class: 'tile-num' }, [groupNumber(c.number)]) : null,
    ]));
  }

  app.append(header, el('div', { class: 'section-label' }, ['All cards']), grid);
  app.append(el('button', { class: 'fab', 'aria-label': 'Add card', onclick: () => { state.view = { name: 'add' }; render(); } }, ['+']));
}

/* ---------------- Card detail ---------------- */
async function renderDetail(id) {
  const card = await db.getCard(id);
  if (!card) { state.view = { name: 'list' }; return render(); }

  const header = el('div', { class: 'topbar' }, [
    el('button', { class: 'icon-btn back', 'aria-label': 'Back', onclick: () => { state.view = { name: 'list' }; render(); } }, ['←']),
    el('h1', {}, ['Card']),
  ]);

  const face = el('div', { class: 'card-face fullscreen-bright' }, [
    el('div', { class: 'face-header', style: `background:${card.color}` }, [card.name]),
    el('div', { class: 'face-body' }, [
      el('canvas', { id: 'barcode-canvas' }),
      el('div', { class: 'card-number' }, [groupNumber(card.number || '—')]),
    ]),
  ]);

  const canvas = face.querySelector('canvas');
  const ok = renderBarcode(canvas, card.number || '', card.format || 'CODE128');
  if (!ok) {
    canvas.replaceWith(el('div', { style: 'color:#a1a1aa;padding:20px;font-size:13px' },
      ['Barcode could not be rendered for this number/format — QR fallback coming soon.']));
  }

  const container = el('div', {}, [header]);
  if (state.view.justAdded) {
    state.view.justAdded = false;
    container.append(el('div', { class: 'success-banner' }, ['✓ Successfully added your card!']));
  }

  const strip = el('div', { class: 'next-strip' });
  const others = (await db.listCards()).filter((c) => !c.archived && c.id !== card.id).slice(0, 6);
  for (const c of others) {
    strip.append(el('button', {
      class: 'row-card small-tile', style: `background:${c.color};color:#fff`,
      onclick: () => { state.view = { name: 'detail', id: c.id }; render(); },
    }, [el('div', { style: 'font-weight:700;font-size:11px;text-align:center;word-break:break-word' }, [c.name])]));
  }

  container.append(
    face,
    el('div', { class: 'detail-actions' }, [
      el('button', { onclick: () => editCard(card) }, ['✏️ Edit']),
      el('button', { onclick: async () => { face.requestFullscreen?.().catch(() => {}); face.classList.add('face-bright'); } }, ['🔆 Bright']),
      el('button', { class: 'danger', onclick: async () => { await db.deleteCard(card.id); toast('Card deleted'); goList(); } }, ['🗑 Delete']),
    ]),
    others.length ? el('div', { class: 'section-label' }, ['Next card']) : null,
    strip,
    el('button', { class: 'row-card', onclick: () => editCard(card) }, [
      el('div', {}, [el('div', { class: 'row-title' }, ['NOTES']),
        el('div', { class: 'row-value' }, [card.notes ? card.notes.slice(0, 40) : 'Add a note'])]),
      el('span', { class: 'chev' }, ['›']),
    ]),
  );
  app.append(container);
}

function editCard(card) {
  state.view = { name: 'edit', id: card.id };
  render();
}

function goList() { state.tab = 'cards'; state.view = { name: 'list' }; render(); }

/* ---------------- Add card ---------------- */
function renderAdd() {
  const header = el('div', { class: 'topbar' }, [
    el('button', { class: 'icon-btn back', 'aria-label': 'Back', onclick: goList }, ['←']),
    el('h1', {}, ['Add card']),
  ]);

  const grid = el('div', { class: 'popular-grid' });
  for (const item of CATALOG) {
    grid.append(el('button', {
      class: 'card-tile', style: `background:${item.color}`,
      onclick: () => { state.view = { name: 'number', catalogId: item.id }; render(); },
    }, [el('div', { class: 'tile-name', style: 'text-align:center;font-size:13px' }, [item.name])]));
  }
  grid.append(el('button', {
    class: 'card-tile', style: 'background:#52525b',
    onclick: () => { state.view = { name: 'number', catalogId: null }; render(); },
  }, [el('div', { class: 'tile-name', style: 'text-align:center;font-size:13px' }, ['＋ Custom card'])]));

  app.append(header, el('div', { class: 'section-label' }, ['Popular cards']), grid,
    el('div', { class: 'caption' }, ['Select a card to get started']));
}

/* ---------------- Card number / scan ---------------- */
function renderNumber({ catalogId }) {
  const preset = catalogId ? CATALOG.find((c) => c.id === catalogId) : null;
  let color = preset?.color || '#52525b';
  let name = preset?.name || '';
  let format = preset?.format || 'CODE128';
  let stopScan = null;

  const header = el('div', { class: 'topbar' }, [
    el('button', { class: 'icon-btn back', 'aria-label': 'Back', onclick: () => { stopScan?.(); state.view = { name: 'add' }; render(); } }, ['←']),
    el('h1', {}, [preset ? preset.name : 'Custom card']),
  ]);

  const video = el('video', { id: 'scanner-video', autoplay: true, playsinline: true, muted: true });
  const scanStatus = el('div', { class: 'scan-hint' }, ['Scanner idle']);

  const nameInput = el('input', { type: 'text', placeholder: 'e.g. My pharmacy card', value: name });
  const numInput = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'Card number' });
  const colorRow = el('div', { class: 'color-row' });
  const COLORS = ['#e11d48', '#00704a', '#004f9f', '#cc0000', '#5d6b2e', '#0088cf', '#1a3c8f', '#002d72', '#e50010', '#52525b'];
  for (const c of COLORS) {
    const dot = el('button', { class: `color-dot${c === color ? ' selected' : ''}`, style: `background:${c}`, onclick: () => { color = c; colorRow.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('selected')); dot.classList.add('selected'); } });
    colorRow.append(dot);
  }
  const formatSelect = el('select', { onchange: (e) => { format = e.target.value; } },
    FORMATS.map((f) => el('option', { value: f, selected: f === format ? '' : null }, [f])));

  const startScanner = async () => {
    scanStatus.textContent = nativeDetectorSupported() ? 'Scanner: native BarcodeDetector' : 'Scanner: ZXing';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      await video.play();
      stopScan = await startScan(video, ({ text }) => {
        numInput.value = text;
        toast(`Scanned: ${text}`);
        stopScan?.();
        stream.getTracks().forEach((t) => t.stop());
        scanStatus.textContent = `Detected ${text}`;
      }, (err) => { scanStatus.textContent = 'Scan error — enter number manually'; console.warn(err); });
      scanStatus.textContent = 'Point the camera at the barcode…';
      video.dataset.stop = '1';
      video.addEventListener('pause', () => {}, { once: true });
      video._stream = stream;
    } catch (e) {
      scanStatus.textContent = 'Camera unavailable — enter the number manually.';
      console.warn(e);
    }
  };
  const stopVideo = () => { video._stream?.getTracks().forEach((t) => t.stop()); stopScan?.(); };

  const save = async () => {
    const cardName = nameInput.value.trim();
    const number = numInput.value.trim();
    if (!cardName) return toast('Please enter a card name');
    if (!number) return toast('Please enter or scan a card number');
    await db.putCard({ id: uid(), name: cardName, color, format, number, notes: '', archived: false, createdAt: Date.now() });
    stopVideo();
    state.view = { name: 'detail', justAdded: true, id: undefined };
    // find the card we just saved
    const all = await db.listCards();
    state.view.id = all.find((c) => c.number === number && c.name === cardName)?.id;
    render();
  };

  const form = el('div', { class: 'form' }, [
    !preset ? el('div', { class: 'field' }, [el('label', {}, ['Name']), nameInput]) : null,
    el('div', { class: 'field' }, [el('label', {}, ['Card number']), numInput,
      el('button', { class: 'btn-secondary', onclick: startScanner }, ['📷 Scan barcode / QR'])]),
    scanStatus, video,
    !preset ? el('div', { class: 'field' }, [el('label', {}, ['Color']), colorRow]) : null,
    el('div', { class: 'field' }, [el('label', {}, ['Barcode format']), formatSelect]),
    el('button', { class: 'btn-primary', onclick: save }, ['Save card']),
  ]);

  app.append(header, form);
  window.addEventListener('pagehide', stopVideo, { once: true });
}

/* ---------------- Edit / notes ---------------- */
async function renderEdit(id) {
  const card = await db.getCard(id);
  if (!card) return goList();
  const header = el('div', { class: 'topbar' }, [
    el('button', { class: 'icon-btn back', 'aria-label': 'Back', onclick: () => { state.view = { name: 'detail', id }; render(); } }, ['←']),
    el('h1', {}, ['Edit card']),
  ]);
  const nameInput = el('input', { type: 'text', value: card.name });
  const numInput = el('input', { type: 'text', value: card.number });
  const notesInput = el('textarea', { rows: 4, placeholder: 'Notes (e.g. membership terms)' }, [card.notes || ''].filter(Boolean).join(''));
  const formatSelect = el('select', {}, FORMATS.map((f) => el('option', { value: f, selected: f === card.format ? '' : null }, [f])));
  app.append(header, el('div', { class: 'form' }, [
    el('div', { class: 'field' }, [el('label', {}, ['Name']), nameInput]),
    el('div', { class: 'field' }, [el('label', {}, ['Card number']), numInput]),
    el('div', { class: 'field' }, [el('label', {}, ['Barcode format']), formatSelect]),
    el('div', { class: 'field' }, [el('label', {}, ['Notes']), notesInput]),
    el('button', {
      class: 'btn-primary',
      onclick: async () => {
        await db.putCard({ ...card, name: nameInput.value.trim() || card.name, number: numInput.value.trim(), format: formatSelect.value, notes: notesInput.value });
        toast('Saved');
        state.view = { name: 'detail', id };
        render();
      },
    }, ['Save']),
  ]));
}

/* ---------------- Offers placeholder ---------------- */
function renderOffers() {
  app.append(
    el('div', { class: 'topbar' }, [el('h1', {}, ['Offers'])]),
    el('div', { class: 'offers-hero' }, [
      el('div', { class: 'big' }, ['🚫']),
      el('h2', {}, ['No ads. No tracking.']),
      el('p', {}, ['Your cards, your data.']),
      el('p', {}, ['Bonus Point deliberately ships no offers feed, no accounts and no analytics. Everything stays on your device.']),
    ]),
  );
}

/* ---------------- Settings ---------------- */
function renderSettings() {
  const header = el('div', { class: 'topbar' }, [el('h1', {}, ['Settings'])]);
  const group = el('div', { class: 'settings-group' }, [
    el('button', {
      onclick: async () => {
        const json = await db.export();
        const blob = new Blob([json], { type: 'application/json' });
        const a = el('a', { href: URL.createObjectURL(blob), download: `bonuspoint-backup-${new Date().toISOString().slice(0, 10)}.json` });
        a.click(); URL.revokeObjectURL(a.href);
        toast('Backup exported');
      },
    }, ['⬇️ Export backup (JSON)']),
    el('button', {
      onclick: () => {
        const input = el('input', { type: 'file', accept: 'application/json' });
        input.onchange = async () => {
          try { const n = await db.import(await input.files[0].text()); toast(`Imported ${n} cards`); render(); }
          catch (e) { toast('Import failed: ' + e.message); }
        };
        input.click();
      },
    }, ['⬆️ Import backup (JSON)']),
    el('button', {
      onclick: () => {
        document.body.classList.toggle('dark');
        localStorage.setItem('bp-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
      },
    }, ['🌙 Toggle dark theme']),
    el('button', {
      onclick: async () => {
        if (!confirm('Delete ALL cards? This cannot be undone.')) return;
        await db.clearCards(); toast('All cards deleted'); render();
      },
    }, ['🗑 Delete all data']),
  ]);
  app.append(header, group,
    el('div', { class: 'settings-note' }, [
      `Bonus Point v0.1.0 — offline-first loyalty card wallet.`,
      el('br'), 'No accounts. No ads. No tracking. Your cards never leave this device.',
    ]));
}

/* ---------------- Router ---------------- */
function render() {
  stopGlobalVideo?.();
  stopGlobalVideo = null;
  app.innerHTML = '';
  const v = state.view;
  const p = v.name === 'detail-added' ? v : v;
  const jobs = {
    list: () => renderCardsList(),
    detail: () => renderDetail(v.id),
    add: () => renderAdd(),
    number: () => renderNumber(v),
    edit: () => renderEdit(v.id),
    offers: () => renderOffers(),
    settings: () => renderSettings(),
  };
  Promise.resolve(jobs[v.name] || jobs.list).then(() => renderNav());
  if (v.name === 'number') { /* video cleanup handled in renderNumber */ }
}
let stopGlobalVideo = null;
window._setStopVideo = (fn) => { stopGlobalVideo = fn; };

// Init theme
if (localStorage.getItem('bp-theme') === 'dark') document.body.classList.add('dark');

// Service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.warn));
}

render();
