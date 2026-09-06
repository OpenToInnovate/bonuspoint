/**
 * Bonus Point — app shell & views (vanilla JS, hash-less view switching).
 */
import { db } from './db.js';
import { CATALOG, FORMATS, REGION_LABELS, identityOf } from './catalog.js';
import { logoSrc, hasLogo } from './logos.js';
import { regionMatches } from './region.js';
import { renderBarcode, renderQR, resetCanvas, displayMode, groupNumber } from './barcode.js';
import { startScan, mapScanFormat, decodeImageFile } from './scanner.js';
import { detectRegion, REGIONS } from './region.js';
import './styles.css';

let app = document.getElementById('app'); // views append here; render() swaps hosts
let toastTimer = null;
let activeCleanup = null; // e.g. camera teardown for the scan view

/* First character safe for surrogate pairs (emoji / unicode names). */
const firstChar = (s) => [...String(s || '?').trim()][0] || '?';

const state = {
  tab: 'cards',          // cards | offers | settings
  view: { name: 'list' } // { name, ...params }
};

/* UI-only state (not persisted cards) */
let searchQuery = '';
let showAllRegions = false; // add-card "Show all regions" toggle

/* History integration: every view change pushes a history entry so the
 * browser / Android hardware back button walks the view stack instead of
 * exiting the app. */
const TAB_OF_VIEW = { list: 'cards', offers: 'offers', settings: 'settings' };
function navigate(view, { replace = false } = {}) {
  if (TAB_OF_VIEW[view.name]) state.tab = TAB_OF_VIEW[view.name];
  state.view = view;
  const entry = { view, tab: state.tab };
  if (replace) history.replaceState(entry, '');
  else history.pushState(entry, '');
  render();
}

window.addEventListener('popstate', (e) => {
  const s = e.state;
  state.view = s?.view?.name ? s.view : { name: 'list' };
  state.tab = s?.tab || TAB_OF_VIEW[state.view.name] || 'cards';
  render();
});

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
  return el('button', { class: state.tab === tab && viewIsTabLevel() ? 'active' : '', onclick: () => navigate({ name: tab === 'cards' ? 'list' : tab }) }, [
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
    el('button', { class: 'icon-btn', 'aria-label': 'Add card', onclick: () => navigate({ name: 'add' }) }, ['+']),
  ]);

  const search = el('input', {
    class: 'search-bar', type: 'search', placeholder: 'Search cards', 'aria-label': 'Search cards',
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
      onclick: () => navigate({ name: 'detail', id: c.id }),
    }, [el('span', {}, [firstChar(c.name)])]));
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
    if (!visible.length) {
      grid.append(el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
        el('div', { class: 'caption', style: 'padding:24px 0' }, ['No cards match your search']),
      ]));
    }
    grid.append(el('button', {
      class: 'card-tile add-tile', 'aria-label': 'Add card',
      onclick: () => navigate({ name: 'add' }),
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
    // First run: hide search/chips/sort chrome — a clean, welcoming empty state.
    search.remove(); chipsWrap.remove(); sectionHead.remove();
    frag.append(el('div', { class: 'empty-state' }, [
      el('div', { class: 'big-ico' }, ['🎟️']),
      el('div', { style: 'font-weight:700;font-size:18px' }, ['Welcome to Bonus Point']),
      el('div', { class: 'caption', style: 'padding:8px 12px' },
        ['Add your loyalty cards once — they live on this device and work offline.']),
      el('button', { class: 'btn-red', onclick: () => navigate({ name: 'add' }) }, ['Add your first card']),
    ]));
    app.append(frag);
    return;
  }
  enableDragReorder(grid, sortCards(all, 'custom'));
  app.append(frag);
}

function listTile(c) {
  const tile = el('button', {
    class: 'card-tile', style: `background:${c.color || '#52525b'}`, 'data-card-id': c.id,
    onclick: () => { if (suppressClick) return; state.view = { name: 'detail', id: c.id }; render(); },
  }, [
    logoImg(c.logo, c.ink) || el('div', { class: 'tile-letter', style: `color:${c.text || '#fff'}` }, [firstChar(c.name)]),
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
    // Always release the click guard — a long-press with no drop must not
    // leave subsequent taps dead.
    setTimeout(() => { suppressClick = false; }, 0);
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
  if (!card) return navigate({ name: 'list' }, { replace: true });

  // Opening the barcode view counts as a use — drives recents + Recently used sort.
  if (!card.lastUsedAt || Date.now() - card.lastUsedAt > 60_000) {
    card.lastUsedAt = Date.now();
    await db.putCard(card);
  }

  const ink = card.ink || '#ffffff';
  const faceColor = card.color || '#52525b';
  // Backfill legacy cards saved before the logo field existed: if the card name
  // matches a catalog preset, adopt its logo id permanently.
  if (!card.logo) {
    const preset = CATALOG.find((c) => c.name.toLowerCase() === (card.name || '').trim().toLowerCase());
    if (preset && hasLogo(preset.id)) {
      card.logo = preset.id;
      db.putCard({ ...card, logo: preset.id });
    }
  }
  const header = el('div', { class: 'topbar detail-topbar' }, [
    el('button', { class: 'icon-btn back', 'aria-label': 'Back', onclick: () => navigate({ name: 'list' }) }, ['←']),
    el('h1', {}, [card.name]),
  ]);

  const face = el('div', { class: 'card-face detail-face' }, [
    el('div', { class: 'face-strip', style: `background:${faceColor}` }, [
      el('span', { class: 'face-logo', style: `background:${faceColor}` }, [logoImg(card.logo, ink) || letterFallback(card.name, ink)]),
      el('span', { class: 'face-title', style: `color:${card.text || '#fff'}` }, [card.name]),
      el('span', { class: 'face-pill' }, ['Details']),
    ]),
    el('div', { class: 'face-body' }, [
      el('canvas', { id: 'barcode-canvas' }),
      el('div', { class: `card-number${(card.number || '').length > 24 ? ' long' : ''}` }, [groupNumber(card.number || '—')]),
    ]),
  ]);

  const canvas = face.querySelector('canvas');
  const renderCode = async () => {
    const m = displayMode(card);
    canvas.classList.toggle('qr', m === 'qr');
    canvas.classList.toggle('barcode', m !== 'qr');
    resetCanvas(canvas); // wipe previous render's attributes/inline styles
    const ok = m === 'qr'
      ? await renderQR(canvas, card.number || '', { width: 320 })
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
        onclick: () => navigate({ name: 'detail', id: c.id }),
      }, [el('div', { style: `font-weight:700;font-size:11px;text-align:center;word-break:break-word;color:${c.text || '#fff'}` }, [c.name])]));
    }
    container.append(el('div', { class: 'manage-head' }, ['Next card']), strip);
  }

  app.append(container);
}

function editCard(card) { navigate({ name: 'edit', id: card.id }); }

function goList() { navigate({ name: 'list' }, { replace: true }); }

/* Bundled brand logo (imported at build time from src/assets/logos — never fetched at runtime). */
function logoImg(id, ink = '#ffffff') {
  const src = logoSrc(id, ink);
  if (!src) return null;
  return el('img', { class: 'tile-logo', src, alt: '', draggable: 'false' });
}

/* Fallback when a card carries no preset logo: first letter of the brand name
 * inside the already-colored .face-logo circle, tinted to the card's ink. */
function letterFallback(name, ink = '#ffffff') {
  const letter = (name || '?').trim().charAt(0).toUpperCase();
  return el('span', { class: 'face-logo-letter', style: `color:${ink}` }, [letter]);
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
        onclick: () => navigate({ name: 'number', catalogId: item.id }),
      }, [
        logoImg(item.id, item.ink),
        el('div', { class: 'tile-name', style: `text-align:center;font-size:12px;color:${item.text || '#fff'}` }, [item.name]),
      ]));
    }
    grid.append(el('button', {
      class: 'card-tile', style: 'background:#52525b',
      onclick: () => navigate({ name: 'number', catalogId: null }),
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
  let format = preset?.format || 'CODE128';
  let displayFormat = null; // set from scan result; manual entry keeps the format heuristic
  let stopScan = null;

  const header = el('div', { class: 'topbar scan-header' }, [
    el('button', { class: 'icon-btn back', 'aria-label': 'Back', onclick: () => { stopVideo(); navigate({ name: 'add' }); } }, ['←']),
    el('div', { class: 'scan-title' }, [
      preset ? el('span', { class: 'scan-brand' }, [preset.name]) : null,
      el('h1', {}, ['Scan barcode']),
    ]),
  ]);

  const video = el('video', { id: 'scanner-video', autoplay: true, playsinline: true, muted: true });
  const viewfinder = el('div', { class: 'viewfinder' }, [video, el('div', { class: 'scan-frame' })]);
  const hint = el('div', { class: 'scan-hint' }, ['Point the camera at the barcode or QR code']);

  const nameInput = el('input', { type: 'text', placeholder: 'e.g. My pharmacy card', value: preset?.name || '' });
  const numInput = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'Card number' });
  const colorRow = el('div', { class: 'color-row' });
  const COLORS = ['#e11d48', '#00704a', '#004f9f', '#cc0000', '#5d6b2e', '#0088cf', '#1a3c8f', '#002d72', '#e50010', '#52525b'];
  for (const c of COLORS) {
    const dot = el('button', { class: `color-dot${c === color ? ' selected' : ''}`, style: `background:${c}`, onclick: () => { color = c; colorRow.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('selected')); dot.classList.add('selected'); } });
    colorRow.append(dot);
  }
  const formatSelect = el('select', { onchange: (e) => { format = e.target.value; displayFormat = null; } },
    FORMATS.map((f) => el('option', { value: f, selected: f === format ? '' : null }, [f])));

  const save = async ({ name, number, format: fmt, displayFormat: disp }) => {
    const cardName = (name || '').trim();
    const cardNumber = (number || '').trim();
    if (!cardName) return toast('Please enter a card name');
    if (!cardNumber) return toast('Please enter or scan a card number');
    const card = {
      id: uid(), name: cardName, color, ink, text, format: fmt, number: cardNumber,
      notes: '', photos: [], archived: false, favorite: false,
      sort: (await db.listCards()).length, createdAt: Date.now(), logo: preset?.id || null,
    };
    if (disp) card.displayFormat = disp; // scanned pattern wins
    await db.putCard(card);
    stopVideo();
    activeCleanup = null;
    navigate({ name: 'detail', justAdded: true, id: card.id }, { replace: true });
  };

  const onScan = ({ text, format: rawFormat }) => {
    const mapped = mapScanFormat(rawFormat);
    save({
      name: preset?.name || nameInput.value.trim() || 'Custom card',
      number: text,
      format: mapped.format,
      displayFormat: mapped.displayFormat,
    });
  };

  const startScanner = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      hint.textContent = 'Camera unavailable — enter the number manually below.';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      await video.play();
      stopScan = await startScan(video, onScan, (err) => {
        hint.textContent = 'Scanner error — enter the number manually';
        console.warn(err);
      });
      video._stream = stream;
    } catch (e) {
      hint.textContent = 'Camera unavailable — enter the number manually below.';
      console.warn(e);
    }
  };
  const stopVideo = () => { video._stream?.getTracks().forEach((t) => t.stop()); stopScan?.(); };

  const manualForm = el('form', {
    class: 'form scan-form', style: 'display:none',
    onsubmit: (e) => { e.preventDefault(); save({ name: nameInput.value, number: numInput.value, format, displayFormat }); },
  }, [
    !preset ? el('div', { class: 'field' }, [el('label', {}, ['Name']), nameInput]) : null,
    el('div', { class: 'field' }, [el('label', {}, ['Card number']), numInput]),
    !preset ? el('div', { class: 'field' }, [el('label', {}, ['Color']), colorRow]) : null,
    el('div', { class: 'field' }, [el('label', {}, ['Barcode format']), formatSelect]),
    el('button', { class: 'btn-primary', type: 'submit' }, ['Save card']),
  ]);

  const manualRow = el('button', {
    class: 'scan-row', onclick: () => {
      manualForm.style.display = manualForm.style.display === 'none' ? '' : 'none';
      if (manualForm.style.display !== 'none') numInput.focus();
    },
  }, [el('span', { class: 'scan-row-ico' }, ['✏️']), el('span', { class: 'scan-row-label' }, ['Enter card number manually']), el('span', { class: 'chev' }, ['›'])]);

  const uploadRow = el('button', {
    class: 'scan-row', onclick: () => {
      const input = el('input', { type: 'file', accept: 'image/*' });
      input.onchange = async () => {
        try {
          hint.textContent = 'Reading image…';
          const { text, format: rawFormat } = await decodeImageFile(input.files[0]);
          onScan({ text, format: rawFormat, source: 'image' });
        } catch (e) {
          hint.textContent = 'No code found in that image — try the camera or manual entry.';
          console.warn(e);
        }
      };
      input.click();
    },
  }, [el('span', { class: 'scan-row-ico' }, ['🖼️']), el('span', { class: 'scan-row-label' }, ['Upload image of card']), el('span', { class: 'chev' }, ['›'])]);

  app.append(header, viewfinder, hint,
    el('div', { class: 'scan-actions' }, [manualRow, uploadRow]),
    manualForm);

  activeCleanup = stopVideo; // render() stops the camera when this view is left
  startScanner();
  window.addEventListener('pagehide', stopVideo, { once: true });
}

/* ---------------- Edit / notes ---------------- */
async function renderEdit(id) {
  const card = await db.getCard(id);
  if (!card) return goList();
  const header = el('div', { class: 'topbar' }, [
    el('button', { class: 'icon-btn back', 'aria-label': 'Back', onclick: () => navigate({ name: 'detail', id }) }, ['←']),
    el('h1', {}, ['Edit card']),
  ]);
  const nameInput = el('input', { type: 'text', value: card.name, 'aria-label': 'Card name' });
  const numInput = el('input', { type: 'text', value: card.number, 'aria-label': 'Card number' });
  const formatSelect = el('select', { 'aria-label': 'Barcode format' }, FORMATS.map((f) => el('option', { value: f, selected: f === card.format ? '' : null }, [f])));
  app.append(header, el('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); save(); } }, [
    el('div', { class: 'field' }, [el('label', {}, ['Name']), nameInput]),
    el('div', { class: 'field' }, [el('label', {}, ['Card number']), numInput]),
    el('div', { class: 'field' }, [el('label', {}, ['Barcode format']), formatSelect]),
    el('button', { class: 'btn-primary', type: 'submit' }, ['Save']),
  ]));
  async function save() {
    if (!numInput.value.trim()) return toast('Please enter a card number');
    await db.putCard({ ...card, name: nameInput.value.trim() || card.name, number: numInput.value.trim(), format: formatSelect.value });
    toast('Saved');
    navigate({ name: 'detail', id }, { replace: true });
  }
}

/* ---------------- Notes ---------------- */
async function renderNotes(id) {
  const card = await db.getCard(id);
  if (!card) return goList();
  const area = el('textarea', { rows: 6, placeholder: 'Notes (e.g. membership terms, expiry)' }, [card.notes || ''].filter(Boolean).join(''));
  app.append(
    el('div', { class: 'topbar' }, [
      el('button', { class: 'icon-btn back', 'aria-label': 'Back', onclick: () => navigate({ name: 'detail', id }) }, ['←']),
      el('h1', {}, ['Notes']),
    ]),
    el('div', { class: 'form' }, [
      el('div', { class: 'field' }, [area]),
      el('button', {
        class: 'btn-primary',
        onclick: async () => {
          await db.putCard({ ...card, notes: area.value });
          toast('Notes saved');
          navigate({ name: 'detail', id }, { replace: true });
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
            if (!confirm('Delete this photo?')) return;
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
      el('button', { class: 'icon-btn back', 'aria-label': 'Back', onclick: () => navigate({ name: 'detail', id }) }, ['←']),
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
        class: 'danger', 'aria-label': `Delete ${c.name} permanently`,
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
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
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
      'aria-label': 'Toggle dark theme',
      onclick: () => {
        document.body.classList.toggle('dark');
        localStorage.setItem('bp-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
        updateThemeColorMeta();
        render();
      },
    }, [`🌙 Dark theme: ${document.body.classList.contains('dark') ? 'On' : 'Off'}`]),
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
      `Bonus Point v${__APP_VERSION__} — offline-first loyalty card wallet.`,
      el('br'), 'No accounts. No ads. No tracking. Your cards never leave this device.',
    ]));
}

/* ---------------- Router ---------------- */
let renderGen = 0;
function render() {
  const gen = ++renderGen;
  activeCleanup?.(); // e.g. stop the camera when leaving the scan view
  activeCleanup = null;
  const v = state.view;
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
  // Build into a detached host so a superseded render can never append a
  // stale view to the live DOM (double-tap / rapid navigation).
  const host = document.createElement('div');
  app = host;
  Promise.resolve(jobs[v.name] || jobs.list)
    .then((job) => job())
    .then(() => {
      if (gen !== renderGen) return;
      renderNav();
      swapIn(host);
    })
    .catch((e) => {
      console.error(e);
      if (gen !== renderGen) return;
      host.innerHTML = '';
      host.append(el('div', { class: 'empty-state' }, [
        el('div', { class: 'big-ico' }, ['⚠️']),
        el('div', { style: 'font-weight:700;font-size:18px' }, ['Something went wrong']),
        el('button', { class: 'btn-red', onclick: () => navigate({ name: 'list' }, { replace: true }) }, ['Back to my cards']),
      ]));
      renderNav();
      swapIn(host);
    });
}

function swapIn(host) {
  const live = document.getElementById('app');
  live.innerHTML = '';
  live.append(host);
}

// Init theme: persisted choice wins, else follow the system preference.
if (localStorage.getItem('bp-theme') === 'dark'
  || (!localStorage.getItem('bp-theme') && window.matchMedia?.('(prefers-color-scheme: dark)').matches)) {
  document.body.classList.add('dark');
}
function updateThemeColorMeta() {
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', document.body.classList.contains('dark') ? '#101012' : '#e11d48');
}
updateThemeColorMeta();

/* Service worker + lightweight "update available" prompt. */
function showUpdateBanner() {
  if (document.querySelector('.sw-update')) return;
  document.body.append(el('button', { class: 'sw-update', onclick: () => location.reload() },
    ['🔄 Update available — tap to refresh']));
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
        });
      });
    } catch (e) { console.warn('SW registration failed', e); }
  });
}

history.replaceState({ view: state.view, tab: state.tab }, '');
render();
