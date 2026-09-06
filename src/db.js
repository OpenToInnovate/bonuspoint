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

  async export() {
    const cards = await this.listCards();
    return JSON.stringify({ app: 'bonuspoint', version: 1, exportedAt: new Date().toISOString(), cards }, null, 2);
  },
  async import(json) {
    const data = JSON.parse(json);
    if (data.app !== 'bonuspoint' || !Array.isArray(data.cards)) throw new Error('Not a Bonus Point backup');
    for (const card of data.cards) await this.putCard(card);
    return data.cards.length;
  },
};
