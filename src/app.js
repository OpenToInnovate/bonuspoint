/**
 * Bonus Point — app shell & views (vanilla JS, hash-less view switching).
 */
import { db } from './db.js';
import { CATALOG, FORMATS, REGION_LABELS, identityOf } from './catalog.js';
import { logoSrc, hasLogo } from './logos.js';
import { regionMatches } from './region.js';
import { renderBarcode, renderQR, displayMode, groupNumber } from './barcode.js';
import { startScan, nativeDetectorSupported } from './scanner.js';
import { detectRegion, REGIONS } from './region.js';
import './styles.css';

const app = document.getElementById('app');
let toastTimer = null;

const state = {
  tab: 'cards',          // cards | offers | settings
  view: { name: 'list' } // { name, ...params }
};

/* UI-only state (not persisted cards) */
let searchQuery = '';
let showAllRegions = false; // add-card "Show all regions" toggle

async function effectiveRegion() {
  const stored = await db.getSetting('region');
  return stored && stored !== 'auto' ? stored : detectRegion();
}

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
const SORTS = [
  { id: 'recent', label: 'Recently used' },
  { id: 'az', label: 'A–Z' },
  { id: 'custom', label: 'Custom' },
];
let currentSort = localStorage.getItem('bp-sort') || 'recent';

function sortCards(cards, mode) {
  const copy = [...cards];
  if (mode === 'az') copy.sort((a, b) => a.name.localeCompare(b.name));
  else if (mode === 'custom') copy.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  else copy.sort((a, b) => (b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0));
  return copy;
}

async function renderCardsList() {
  const all = (await db.listCards()).filter((c) => !c.archived);

  const header = el('div', { class: 'topbar list-header' }, [
    el('span', { class: 'icon-btn back', 'aria-hidden': 'true' }, ['←']),
    el('h1', { class: 'centered-title' }, ['Loyalty Cards']),
    el('button', { class: 'icon-btn', 'aria-label': 'Add card', onclick: () => { state.view = { name: 'add' }; render(); } }, ['+']),
  ]);

  const search = el('input', {
    class: 'search-bar', type: 'search', placeholder: 'Search cards',
    value: searchQuery,
    oninput: (e) => { searchQuery = e.target.value; updateGrid(); },
  });

  // Recents chips: brands of recently used + favorited cards. Hidden when empty.
  const recentCards = all
    .filter((c) => c.lastUsedAt || c.favorite)
    .sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0) || (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 10);
  const chipsWrap = el('div', { class: 'chips-row', 'data-testid': 'recents-row' });
  for (const c of recentCards) {
    chipsWrap.append(el('button', {
      class: 'brand-chip', style: `background:${c.color}`, 'aria-label': c.name,
      title: c.name,
      onclick: () => { state.view = { name: 'detail', id: c.id }; render(); },
    }, [el('span', {}, [(c.name || '?').trim().charAt(0).toUpperCase()])]));
  }

  const sectionHead = el('div', { class: 'section-head' }, [
    el('span', { class: 'count-label', 'data-testid': 'cards-count' }, ['']),
    el('button', { class: 'sort-link', 'data-testid': 'sort-link', onclick: cycleSort }, ['Sort by']),
  ]);

  const grid = el('div', { class: 'cards-grid', 'data-testid': 'cards-grid' });
  const frag = el('div');
  frag.append(header, search, chipsWrap, sectionHead, grid);

  const countLabel = sectionHead.querySelector('.count-label');
  const updateGrid = () => {
    const q = searchQuery.trim().toLowerCase();
    const visible = q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all;
    countLabel.textContent = `${visible.length} loyalty card${visible.length === 1 ? '' : 's'}`;
    grid.innerHTML = '';
    for (const c of sortCards(visible, currentSort)) grid.append(listTile(c));
    grid.append(el('button', {
      class: 'card-tile add-tile', 'aria-label': 'Add card',
      onclick: () => { state.view = { name: 'add' }; render(); },
    }, [el('span', { class: 'add-plus' }, ['+'])]));
  };
  updateGrid();

  function cycleSort() {
    const idx = SORTS.findIndex((s) => s.id === currentSort);
    currentSort = SORTS[(idx + 1) % SORTS.length].id;
    localStorage.setItem('bp-sort', currentSort);
    toast(`Sorted: ${SORTS.find((s) => s.id === currentSort).label}`);
    updateGrid();
  }

  if (!all.length) {
    grid.innerHTML = '';
    grid.append(el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
      el('div', { class: 'big-ico' }, ['🎟️']),
      el('div', { style: 'font-weight:700;font-size:18px' }, ['No cards yet']),
      el('button', { class: 'btn-red', onclick: () => { state.view = { name: 'add' }; render(); } }, ['Add your first card']),
    ]));
  } else {
    enableDragReorder(grid, sortCards(all, 'custom'));
  }

  app.append(frag);
}

function listTile(c) {
  const tile = el('button', {
    class: 'card-tile', style: `background:${c.color || '#52525b'}`, 'data-card-id': c.id,
    onclick: () => { if (suppressClick) return; state.view = { name: 'detail', id: c.id }; render(); },
  }, [
    logoImg(c.logo, c.ink),
    el('div', { class: 'tile-name', style: `color:${c.text || '#fff'}` }, [c.name]),
    c.number ? el('div', { class: 'tile-num' }, [groupNumber(c.number)]) : null,
    el('span', {
      class: `tile-star${c.favorite ? ' on' : ''}`, style: `color:${c.text || '#fff'}`, 'aria-label': c.favorite ? 'Remove favorite' : 'Add favorite',
      onclick: async (e) => {
        e.stopPropagation();
        await db.putCard({ ...c, favorite: !c.favorite });
        render();
      },
    }, [c.favorite ? '★' : '☆']),
  ]);
  return tile;
}

/* Long-press drag-and-drop reordering across the favorites + all-cards grids. */
let suppressClick = false;
function enableDragReorder(root, orderedCards) {
  let dragged = null;
  let pressTimer = null;
  let startX = 0, startY = 0;

  const tiles = () => Array.from(root.querySelectorAll('.card-tile'));

  root.addEventListener('pointerdown', (e) => {
    const tile = e.target.closest?.('.card-tile');
    if (!tile || e.button) return;
    startX = e.clientX; startY = e.clientY;
    pressTimer = setTimeout(() => {
      dragged = tile;
      tile.classList.add('dragging');
      if (navigator.vibrate) navigator.vibrate(30);
      suppressClick = true;
      try { tile.setPointerCapture(e.pointerId); } catch {}
    }, 350);
  });

  root.addEventListener('pointermove', (e) => {
    if (!dragged) {
      if (pressTimer && Math.hypot(e.clientX - startX, e.clientY - startY) > 12) {
        clearTimeout(pressTimer); pressTimer = null;
      }
      return;
    }
    e.preventDefault();
    const r = dragged.getBoundingClientRect();
    dragged.style.transform = `translate(${e.clientX - startX}px, ${e.clientY - startY}px)`;
    for (const t of tiles()) {
      if (t === dragged) continue;
      const tr = t.getBoundingClientRect();
      const hit = e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom;
      t.classList.toggle('drop-target', hit);
    }
  }, { passive: false });

  const finish = async (e) => {
    clearTimeout(pressTimer); pressTimer = null;
    if (!dragged) return;
    const tile = dragged;
    dragged = null;
    tile.classList.remove('dragging');
    tile.style.transform = '';
    const target = tiles().find((t) => t.classList.contains('drop-target'));
    tiles().forEach((t) => t.classList.remove('drop-target'));
    if (!target) return;
    const draggedId = tile.dataset.cardId;
    const targetId = target.dataset.cardId;
    if (!draggedId || !targetId || draggedId === targetId) return;
    const ids = orderedCards.map((c) => c.id);
    const fromIdx = ids.indexOf(draggedId);
    const wasBefore = fromIdx < ids.indexOf(targetId);
    ids.splice(fromIdx, 1);
    const tIdx = ids.indexOf(targetId);
    ids.splice(wasBefore ? tIdx + 1 : tIdx, 0, draggedId);
    const byId = new Map(orderedCards.map((c) => [c.id, c]));
    for (let i = 0; i < ids.length; i++) {
      const card = byId.get(ids[i]);
      if (card && (card.sort ?? 0) !== i) await db.putCard({ ...card, sort: i });
    }
    setTimeout(() => { suppressClick = false; }, 0);
    render();
  };
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', finish);
}


/* ---------------- Card detail (dark premium view) ---------------- */
function manageRow({ icon, label, sub, danger, onclick }) {
  return el('button', {
    class: `manage-row${danger ? ' danger' : ''}`, onclick,
  }, [
    el('span', { class: 'manage-ico', 'aria-hidden': 'true' }, [icon]),
    el('span', { class: 'manage-label' }, [
      el('span', { class: 'manage-title' }, [label]),
      sub ? el('span', { class: 'manage-sub' }, [sub]) : null,
    ]),
    el('span', { class: 'chev', 'aria-hidden': 'true' }, ['›']),
  ]);
}

async function renderDetail(id) {
  const card = await db.getCard(id);
  if (!card) { state.view = { name: 'list' }; return render(); }

  // Opening the barcode view counts as a use — drives recents + Recently used sort.
  if (!card.lastUsedAt || Date.now() - card.lastUsedAt > 60_000) {
    card.lastUsedAt = Date.now();
    await db.putCard(card);
  }

  const ink = card.ink || '#ffffff';
  const faceColor = card.color || '#52525b';
  const header = el('div', { class: 'topbar detail-topbar' }, [
    el('button', { class: 'icon-btn back', 'aria-label': 'Back', onclick: () => { state.view = { name: 'list' }; render(); } }, ['←']),
    el('h1', {}, [card.name]),
  ]);

  const face = el('div', { class: 'card-face detail-face' }, [
    el('div', { class: 'face-strip', style: `background:${faceColor}` }, [
      el('span', { class: 'face-logo', style: `background:${faceColor}` }, [logoImg(card.logo, ink)]),
      el('span', { class: 'face-title', style: `color:${card.text || '#fff'}` }, [card.name]),
      el('span', { class: 'face-pill' }, ['Details']),
    ]),
    el('div', { class: 'face-body' }, [
      el('canvas', { id: 'barcode-canvas' }),
      el('div', { class: 'card-number' }, [groupNumber(card.number || '—')]),
    ]),
  ]);

  const canvas = face.querySelector('canvas');
  const renderCode = async () => {
    const m = displayMode(card);
    const ok = m === 'qr'
      ? await renderQR(canvas, card.number || '', { width: 520 })
      : renderBarcode(canvas, card.number || '', card.format || 'CODE128', { scale: 3 });
    canvas.style.display = ok ? '' : 'none';
    let msg = face.querySelector('.code-error');
    if (!ok && !msg) {
      msg = el('div', { class: 'code-error' },
        ['Code could not be rendered for this number/format.']);
      canvas.after(msg);
    }
    if (msg) msg.style.display = ok ? 'none' : '';
  };
  renderCode();

  const container = el('div', { class: 'detail-view' }, [header]);
  if (state.view.justAdded) {
    state.view.justAdded = false;
    container.append(el('div', { class: 'success-banner' }, ['✓ Successfully added your card!']));
  }
  container.append(face);

  // Quick actions: brightness, barcode/QR toggle, favorite.
  container.append(el('div', { class: 'quick-actions' }, [
    el('button', { onclick: async () => { face.requestFullscreen?.().catch(() => {}); face.classList.add('face-bright'); } }, ['🔆 Bright']),
    el('button', {
      onclick: async () => {
        const next = displayMode(card) === 'qr' ? 'barcode' : 'qr';
        await db.putCard({ ...card, displayFormat: next });
        toast(next === 'qr' ? 'Showing QR code' : 'Showing barcode');
        render();
      },
    }, [displayMode(card) === 'qr' ? '▭ Barcode' : '▣ QR']),
    el('button', {
      onclick: async () => {
        await db.putCard({ ...card, favorite: !card.favorite });
        toast(card.favorite ? 'Removed from favorites' : 'Added to favorites');
        render();
      },
    }, [card.favorite ? '★ Favorited' : '☆ Favorite']),
  ]));

  const photos = Array.isArray(card.photos) ? card.photos : [];
  const manage = el('div', { class: 'manage-section' }, [
    el('div', { class: 'manage-head' }, ['Manage']),
    manageRow({ icon: '✏️', label: 'Edit card', sub: 'Name, number & format', onclick: () => editCard(card) }),
    manageRow({ icon: '📝', label: 'Notes', sub: card.notes ? card.notes.slice(0, 42) : 'Add a note', onclick: () => { state.view = { name: 'notes', id: card.id }; render(); } }),
    manageRow({ icon: '🖼️', label: 'Photos', sub: photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : 'Add photos', onclick: () => { state.view = { name: 'photos', id: card.id }; render(); } }),
    manageRow({
      icon: '🗄️', label: 'Archive card', sub: 'Restore anytime from Settings',
      onclick: async () => {
        if (!confirm(`Archive "${card.name}"? You can restore it in Settings.`)) return;
        await db.putCard({ ...card, archived: true });
        toast('Card archived');
        goList();
      },
    }),
    manageRow({
      icon: '🗑️', label: 'Delete card', danger: true,
      onclick: async () => {
        if (!confirm(`Permanently delete "${card.name}"?`)) return;
        await db.deleteCard(card.id);
        toast('Card deleted');
        goList();
      },
    }),
  ]);
  container.append(manage);

  const others = (await db.listCards()).filter((c) => !c.archived && c.id !== card.id).slice(0, 6);
  if (others.length) {
    const strip = el('div', { class: 'next-strip' });
    for (const c of others) {
      strip.append(el('button', {
        class: 'row-card small-tile', style: `background:${c.color || '#52525b'}`,
        onclick: () => { state.view = { name: 'detail', id: c.id }; render(); },
      }, [el('div', { style: `font-weight:700;font-size:11px;text-align:center;word-break:break-word;color:${c.text || '#fff'}` }, [c.name])]));
    }
    container.append(el('div', { class: 'manage-head' }, ['Next card']), strip);
  }

  app.append(container);
}

function editCard(card) {
  state.view = { name: 'edit', id: card.id };
  render();
}

function goList() { state.tab = 'cards'; state.view = { name: 'list' }; render(); }

/* Bundled brand logo (imported at build time from src/assets/logos — never fetched at runtime). */
function logoImg(id, ink = '#ffffff') {
  const src = logoSrc(id, ink);
  if (!src) return null;
  return el('img', { class: 'tile-logo', src, alt: '', draggable: 'false' });
}

/* ---------------- Add card ---------------- */
async function renderAdd() {
  const region = await effectiveRegion();
  const header = el('div', { class: 'topbar' }, [
    el('button', { class: 'icon-btn back', 'aria-label': 'Back', onclick: goList }, ['←']),
    el('h1', {}, ['Add card']),
  ]);

  const label = el('div', { class: 'section-label', 'data-testid': 'popular-label' }, [
    `Popular cards — ${REGION_LABELS[region] || region}`,
  ]);

  const grid = el('div', { class: 'popular-grid' });
  const fill = () => {
    grid.innerHTML = '';
    const list = CATALOG.filter((item) => showAllRegions || regionMatches(item.regions, region));
    for (const item of list) {
      grid.append(el('button', {
        class: 'card-tile', style: `background:${item.color}`,
        onclick: () => { state.view = { name: 'number', catalogId: item.id }; render(); },
      }, [
        logoImg(item.id, item.ink),
        el('div', { class: 'tile-name', style: `text-align:center;font-size:12px;color:${item.text || '#fff'}` }, [item.name]),
      ]));
    }
    grid.append(el('button', {
      class: 'card-tile', style: 'background:#52525b',
      onclick: () => { state.view = { name: 'number', catalogId: null }; render(); },
    }, [el('div', { class: 'tile-name', style: 'text-align:center;font-size:12px' }, ['＋ Custom card'])]));
  };
  fill();

  const toggle = el('button', {
    class: 'show-all-toggle', 'data-testid': 'show-all-toggle',
    onclick: () => { showAllRegions = !showAllRegions; toggle.textContent = showAllRegions ? 'Show my region only' : 'Show all regions'; fill(); },
  }, [showAllRegions ? 'Show my region only' : 'Show all regions']);

  app.append(header, label, grid, toggle,
    el('div', { class: 'caption' }, ['Select a card to get started']));
}

/* ---------------- Card number / scan ---------------- */
function renderNumber({ catalogId }) {
  const preset = catalogId ? CATALOG.find((c) => c.id === catalogId) : null;
  let { color, ink, text } = identityOf(preset);
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
    await db.putCard({ id: uid(), name: cardName, color, ink, text, format, number, notes: '', photos: [], archived: false, favorite: false, sort: (await db.listCards()).length, createdAt: Date.now(), logo: preset?.id || null });
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

/* ---------------- Notes ---------------- */
async function renderNotes(id) {
  const card = await db.getCard(id);
  if (!card) return goList();
  const area = el('textarea', { rows: 6, placeholder: 'Notes (e.g. membership terms, expiry)' }, [card.notes || ''].filter(Boolean).join(''));
  app.append(
    el('div', { class: 'topbar' }, [
      el('button', { class: 'icon-btn back', 'aria-label': 'Back', onclick: () => { state.view = { name: 'detail', id }; render(); } }, ['←']),
      el('h1', {}, ['Notes']),
    ]),
    el('div', { class: 'form' }, [
      el('div', { class: 'field' }, [area]),
      el('button', {
        class: 'btn-primary',
        onclick: async () => {
          await db.putCard({ ...card, notes: area.value });
          toast('Notes saved');
          state.view = { name: 'detail', id };
          render();
        },
      }, ['Save notes']),
    ]),
  );
}

/* ---------------- Photos ---------------- */
async function shrinkImage(file) {
  const bmp = await createImageBitmap(file);
  const max = 1024;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

async function renderPhotos(id) {
  const card = await db.getCard(id);
  if (!card) return goList();
  const photos = Array.isArray(card.photos) ? card.photos : [];

  const grid = el('div', { class: 'photo-grid' });
  const fill = () => {
    grid.innerHTML = '';
    if (!photos.length) {
      grid.append(el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
        el('div', { class: 'big-ico' }, ['🖼️']),
        el('div', { class: 'caption' }, ['No photos yet']),
      ]));
    }
    photos.forEach((src, i) => {
      grid.append(el('div', { class: 'photo-cell' }, [
        el('img', { src, alt: `Photo ${i + 1}` }),
        el('button', {
          class: 'photo-del', 'aria-label': 'Delete photo',
          onclick: async () => {
            photos.splice(i, 1);
            await db.putCard({ ...card, photos });
            fill();
          },
        }, ['✕']),
      ]));
    });
  };
  fill();

  const addBtn = el('button', {
    class: 'btn-primary',
    onclick: () => {
      const input = el('input', { type: 'file', accept: 'image/*', multiple: true });
      input.onchange = async () => {
        try {
          for (const f of input.files) photos.push(await shrinkImage(f));
          await db.putCard({ ...card, photos });
          toast(`Added ${input.files.length} photo${input.files.length === 1 ? '' : 's'}`);
          fill();
        } catch (e) { toast('Could not add photo'); console.warn(e); }
      };
      input.click();
    },
  }, ['📷 Add photo']);

  app.append(
    el('div', { class: 'topbar' }, [
      el('button', { class: 'icon-btn back', 'aria-label': 'Back', onclick: () => { state.view = { name: 'detail', id }; render(); } }, ['←']),
      el('h1', {}, ['Photos']),
    ]),
    grid,
    el('div', { class: 'form' }, [addBtn]),
  );
}

/* ---------------- Archived cards ---------------- */
async function renderArchived() {
  const cards = (await db.listCards()).filter((c) => c.archived).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  app.append(
    el('div', { class: 'topbar' }, [
      el('button', { class: 'icon-btn back', 'aria-label': 'Back', onclick: goSettings }, ['←']),
      el('h1', {}, ['Archived cards']),
    ]),
  );
  if (!cards.length) {
    app.append(el('div', { class: 'empty-state' }, [
      el('div', { class: 'big-ico' }, ['🗄️']),
      el('div', { class: 'caption' }, ['No archived cards']),
    ]));
    return;
  }
  for (const c of cards) {
    app.append(el('div', { class: 'row-card' }, [
      el('span', { class: 'arch-dot', style: `background:${c.color}` }),
      el('div', { class: 'row-value' }, [
        el('div', { class: 'row-title' }, [c.name]),
        el('div', { style: 'font-size:13px;color:var(--muted)' }, [c.number || '']),
      ]),
      el('button', {
        onclick: async () => {
          await db.putCard({ ...c, archived: false });
          toast('Card restored');
          render();
        },
      }, ['↩️ Restore']),
      el('button', {
        class: 'danger',
        onclick: async () => {
          if (!confirm(`Permanently delete "${c.name}"? This cannot be undone.`)) return;
          await db.deleteCard(c.id);
          toast('Card deleted permanently');
          render();
        },
      }, ['🗑']),
    ]));
  }
}

function goSettings() { state.tab = 'settings'; state.view = { name: 'settings' }; render(); }

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
async function renderSettings() {
  const header = el('div', { class: 'topbar' }, [el('h1', {}, ['Settings'])]);

  const stored = (await db.getSetting('region')) || 'auto';
  const detected = detectRegion();
  const regionRow = el('div', { class: 'static-row region-row' }, [
    el('span', {}, ['🌏 Region']),
    (() => {
      const sel = el('select', { 'data-testid': 'region-select', class: 'region-select', onchange: async (e) => { await db.putSetting('region', e.target.value); toast(e.target.value === 'auto' ? `Region: auto (${detected})` : `Region: ${e.target.value}`); } },
        REGIONS.map((r) => el('option', { value: r.id, selected: r.id === stored ? '' : null }, [r.id === 'auto' ? `Auto (${detected})` : r.label])));
      return sel;
    })(),
  ]);

  const group = el('div', { class: 'settings-group' }, [
    regionRow,
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
      onclick: () => { state.view = { name: 'archived' }; render(); },
    }, ['🗄 Archived cards']),
    el('button', {
      onclick: async () => {
        if (!confirm('Delete ALL cards? This cannot be undone.')) return;
        await db.clearCards(); toast('All cards deleted'); render();
      },
    }, ['🗑 Delete all data']),
  ]);
  app.append(header, group,
    el('div', { class: 'settings-note' }, [
      `Bonus Point v0.2.0 — offline-first loyalty card wallet.`,
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
    notes: () => renderNotes(v.id),
    photos: () => renderPhotos(v.id),
    archived: () => renderArchived(),
    offers: () => renderOffers(),
    settings: () => renderSettings(),
  };
  Promise.resolve(jobs[v.name] || jobs.list).then((job) => job()).then(() => renderNav());
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
