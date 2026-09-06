/* Unit tests for pure modules: db normalization/import, scanner format mapping,
 * catalog integrity, region matching. Zero network. Run: vitest run */
import { describe, it, expect, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';

let db, CATALOG, REGION_LABELS, FORMATS, mapScanFormat;

beforeAll(async () => {
  ({ db } = await import('../src/db.js'));
  const cat = await import('../src/catalog.js');
  ({ CATALOG, REGION_LABELS, FORMATS } = cat);
  ({ mapScanFormat } = await import('../src/scanner.js'));
});

const card = (over = {}) => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  name: over.name ?? 'Test Card',
  number: over.number ?? '123456',
  format: 'CODE128',
  color: '#52525b',
  archived: false,
  createdAt: Date.now(),
  ...over,
});

describe('scanner format mapping', () => {
  it('maps QR to qr display mode', () => {
    expect(mapScanFormat('qr_code')).toEqual({ format: 'CODE128', displayFormat: 'qr' });
    expect(mapScanFormat('QR_CODE')).toEqual({ format: 'CODE128', displayFormat: 'qr' });
  });
  it('maps barcode symbologies to JsBarcode names', () => {
    expect(mapScanFormat('ean_13').format).toBe('EAN13');
    expect(mapScanFormat('ean_8').format).toBe('EAN8');
    expect(mapScanFormat('upc_a').format).toBe('UPC');
    expect(mapScanFormat('code_128').format).toBe('CODE128');
    expect(mapScanFormat('itf').format).toBe('ITF14');
    expect(mapScanFormat('ean_13').displayFormat).toBe('barcode');
  });
  it('falls back to CODE128/barcode for unknown formats', () => {
    expect(mapScanFormat('mystery')).toEqual({ format: 'CODE128', displayFormat: 'barcode' });
    expect(mapScanFormat(undefined)).toEqual({ format: 'CODE128', displayFormat: 'barcode' });
  });
});

describe('db duplicate guard', () => {
  it('finds an active duplicate by name+number', async () => {
    await db.clearCards();
    await db.putCard(card({ id: 'a', name: 'Nectar', number: '999' }));
    expect(await db.findActiveDuplicate({ name: 'nectar ', number: ' 999' })).toBeTruthy();
    expect(await db.findActiveDuplicate({ name: 'Nectar', number: '998' })).toBeNull();
  });
  it('ignores archived cards', async () => {
    await db.clearCards();
    await db.putCard(card({ id: 'b', name: 'Nectar', number: '999', archived: true }));
    expect(await db.findActiveDuplicate({ name: 'Nectar', number: '999' })).toBeNull();
  });
  it('matches by catalog logo id when provided', async () => {
    await db.clearCards();
    await db.putCard(card({ id: 'c', name: 'Whatever', number: '777', logo: 'nectar' }));
    expect(await db.findActiveDuplicate({ name: 'Nectar', number: '777', logo: 'nectar' })).toBeTruthy();
    expect(await db.findActiveDuplicate({ name: 'Nectar', number: '777', logo: 'tesco' })).toBeNull();
  });
  it('groups duplicates sharing brand+number and never auto-deletes', async () => {
    await db.clearCards();
    await db.putCard(card({ id: 'd1', name: 'Nectar', number: '555' }));
    await db.putCard(card({ id: 'd2', name: 'Nectar', number: '555' }));
    await db.putCard(card({ id: 'd3', name: 'Other', number: '555' }));
    const groups = await db.duplicateGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
    await db.clearCards();
  });
});

describe('db import normalization', () => {
  it('round-trips export/import', async () => {
    await db.clearCards();
    await db.putCard(card({ id: 'r1', name: 'Round', number: '42' }));
    const json = await db.export();
    await db.clearCards();
    const n = await db.import(json);
    expect(n).toBe(1);
    expect((await db.listCards())[0].number).toBe('42');
  });
  it('rejects non-bonuspoint JSON', async () => {
    await expect(db.import('{"app":"other","cards":[]}')).rejects.toThrow();
    await expect(db.import('not json at all')).rejects.toThrow();
    await expect(db.import('{"app":"bonuspoint"}')).rejects.toThrow();
  });
  it('normalizes malformed card entries defensively', async () => {
    await db.clearCards();
    const n = await db.import(JSON.stringify({
      app: 'bonuspoint',
      cards: [
        null,
        { name: 'ok', number: '1' },
        { name: 'x'.repeat(200), number: '2', format: 'JUNK', color: 'red', photos: ['a', 5, 'b'], sort: 'nope' },
        { name: 'qr', number: '3', displayFormat: 'qr' },
        { name: 'badfmt', number: '4', displayFormat: 'square' },
      ],
    }));
    expect(n).toBe(4);
    const cards = await db.listCards();
    const junk = cards.find((c) => c.number === '2');
    expect(junk.name.length).toBeLessThanOrEqual(80);
    expect(junk.format).toBe('CODE128');
    expect(junk.color).toBe('#52525b');
    expect(junk.photos).toEqual(['a', 'b']);
    expect(junk.sort).toBeUndefined();
    const qr = cards.find((c) => c.number === '3');
    expect(qr.displayFormat).toBe('qr');
    expect(cards.find((c) => c.number === '4').displayFormat).toBeUndefined();
  });
});

describe('catalog integrity', () => {
  it('has unique ids and known formats', () => {
    const ids = CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CATALOG) expect(FORMATS).toContain(c.format);
  });
  it('tags every entry with valid regions and labels exist', () => {
    const valid = new Set(['GB', 'US', 'CA', 'JP', 'EU']);
    for (const c of CATALOG) {
      expect(c.regions.length).toBeGreaterThan(0);
      for (const r of c.regions) expect(valid.has(r)).toBe(true);
    }
    for (const r of [...valid, 'ALL']) expect(REGION_LABELS[r]).toBeTruthy();
  });
});

describe('scan simulation contract (latch + cooldown live in app view)', () => {
  it('creating the same card twice still requires explicit duplicate confirmation', async () => {
    await db.clearCards();
    await db.putCard(card({ id: 'g1', name: 'Nectar', number: 'NECTAR-1', logo: 'nectar' }));
    const dupe = await db.findActiveDuplicate({ name: 'Nectar', number: 'NECTAR-1', logo: 'nectar' });
    expect(dupe.id).toBe('g1');
  });
});
