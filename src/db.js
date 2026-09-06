/**
 * IndexedDB persistence. No server, no accounts — data never leaves the device.
 * Store: cards { id, name, color, format, number, notes, archived, createdAt, sort }
 */
const DB_NAME = 'bonuspoint';
const DB_VERSION = 2;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cards')) {
        const store = db.createObjectStore('cards', { keyPath: 'id' });
        store.createIndex('archived', 'archived');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings'); // keyed by string, value any
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
      })
  );
}

export const db = {
  listCards: () => tx('cards', 'readonly', (s) => s.getAll()),
  getCard: (id) => tx('cards', 'readonly', (s) => s.get(id)),
  putCard: (card) => tx('cards', 'readwrite', (s) => s.put(card)),
  deleteCard: (id) => tx('cards', 'readwrite', (s) => s.delete(id)),
  clearCards: () => tx('cards', 'readwrite', (s) => s.clear()),

  getSetting: (key) => tx('settings', 'readonly', (s) => s.get(key)),
  putSetting: (key, value) => tx('settings', 'readwrite', (s) => s.put(value, key)),

  /** First active (non-archived) card with the same brand + number, or null.
   * brand matches by catalog logo id when known, else exact name (case-insensitive). */
  async findActiveDuplicate({ name, number, logo = null }) {
    const num = String(number || '').trim().toLowerCase();
    if (!num) return null;
    const nm = String(name || '').trim().toLowerCase();
    const cards = await this.listCards();
    const nameEq = (n) => String(n || '').trim().toLowerCase() === nm;
    return cards.find((c) => !c.archived
      && String(c.number || '').trim().toLowerCase() === num
      && (logo ? c.logo === logo || nameEq(c.name) : nameEq(c.name))) || null;
  },

  /** Groups of 2+ active cards sharing brand + number (surfaced, never auto-deleted). */
  async duplicateGroups() {
    const cards = (await this.listCards()).filter((c) => !c.archived);
    const byKey = new Map();
    for (const c of cards) {
      const key = `${String(c.logo || (c.name || '').trim().toLowerCase())}|${String(c.number || '').trim().toLowerCase()}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(c);
    }
    return [...byKey.values()].filter((g) => g.length > 1);
  },

  async export() {
    const cards = await this.listCards();
    return JSON.stringify({ app: 'bonuspoint', version: 1, exportedAt: new Date().toISOString(), cards }, null, 2);
  },
  async import(json) {
    const data = JSON.parse(json);
    if (data.app !== 'bonuspoint' || !Array.isArray(data.cards)) throw new Error('Not a Bonus Point backup');
    const cards = data.cards.map(normalizeCard).filter(Boolean);
    for (const card of cards) await this.putCard(card);
    return cards.length;
  },
}

/* Defensive normalization for imported backups: a malformed or hand-edited
 * file must never crash the app (missing names/numbers, junk colors, huge
 * photo arrays, wrong types). */
const FORMATS_OK = new Set(['CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39', 'ITF14']);
function normalizeCard(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const hex = (v, fb) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fb);
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const num = (v) => (Number.isFinite(v) ? v : undefined);
  return {
    id: typeof c.id === 'string' && c.id ? c.id.slice(0, 64) : `imp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: str(c.name, 80),
    number: str(c.number, 200),
    format: FORMATS_OK.has(c.format) ? c.format : 'CODE128',
    ...(c.displayFormat === 'qr' || c.displayFormat === 'barcode' ? { displayFormat: c.displayFormat } : {}),
    color: hex(c.color, '#52525b'),
    ink: hex(c.ink, '#ffffff'),
    text: hex(c.text, '#ffffff'),
    logo: typeof c.logo === 'string' ? c.logo.slice(0, 64) : null,
    notes: str(c.notes, 5000),
    photos: Array.isArray(c.photos) ? c.photos.filter((p) => typeof p === 'string').slice(0, 20) : [],
    archived: Boolean(c.archived),
    favorite: Boolean(c.favorite),
    sort: num(c.sort),
    createdAt: num(c.createdAt) ?? Date.now(),
    ...(Number.isFinite(c.lastUsedAt) ? { lastUsedAt: c.lastUsedAt } : {}),
  };
};
