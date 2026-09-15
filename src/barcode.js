/**
 * Code rendering: linear barcodes via JsBarcode, QR via `qrcode` — both bundled locally.
 */
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { AztecEncoder } from '@zxing/library';

/** Render `number` as a barcode into `canvas`. Returns true on success.
 *  `opts.scale` renders at an integer multiple (default 2) so the canvas stays
 *  crisp on high-DPI screens and scanners read it easily. */
export function renderBarcode(canvas, number, format = 'CODE128', opts = {}) {
  const scale = Math.max(1, Math.min(4, opts.scale || 2));
  try {
    JsBarcode(canvas, number, {
      format,
      width: 2 * scale,
      height: (opts.height || 90) * scale / 2,
      displayValue: false,
      margin: 8 * scale,
      background: '#ffffff',
      lineColor: '#111111',
    });
    return true;
  } catch (e) {
    console.warn('barcode render failed', e);
    return false;
  }
}

/** Reset a canvas fully (attributes + inline styles) so a previous render's
 *  dimensions never leak into the next (e.g. barcode -> QR toggle). */
export function resetCanvas(canvas) {
  canvas.removeAttribute('style');
  canvas.width = 0;
  canvas.height = 0;
}

/** Render `number` as a QR code into `canvas`. Returns true on success.
 *  Default width 320 keeps the QR readable while fitting the card face; CSS
 *  (`canvas.qr`) enforces a square box around whatever intrinsic size is used. */
export async function renderQR(canvas, text, opts = {}) {
  const width = opts.width || 320;
  try {
    await QRCode.toCanvas(canvas, text, {
      width,
      margin: 2,
      color: { dark: '#111111', light: '#ffffff' },
    });
    return true;
  } catch (e) {
    console.warn('qr render failed', e);
    return false;
  }
}

/** Pure Aztec matrix generation (testable without a canvas). Uses the raw
 *  encoder directly — AztecCodeWriter's integer scaling chokes on symbols
 *  larger than the requested canvas. */
export function aztecMatrix(text) {
  const code = AztecEncoder.encode(
    Buffer.from(String(text), 'latin1'),
    AztecEncoder.DEFAULT_EC_PERCENT,
    AztecEncoder.DEFAULT_AZTEC_LAYERS,
  );
  const m = code.getMatrix();
  const width = m.getWidth(), height = m.getHeight();
  return { width, height, get: (x, y) => m.get(x, y) };
}

/** Render `text` as an Aztec code into `canvas`. Returns true on success. */
export function renderAztec(canvas, text, opts = {}) {
  try {
    const m = aztecMatrix(text);
    const scale = Math.max(3, Math.floor((opts.width || 320) / m.width));
    const size = m.width * scale;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#111111';
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        if (m.get(x, y)) ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    return true;
  } catch (e) {
    console.warn('aztec render failed', e);
    return false;
  }
}

/** Heuristic: alphanumeric codes scan better as QR. Long pure-numeric codes
 *  stay linear — many loyalty numbers are 16-22 digits (Code 128 reads them
 *  fine and scanners accept them). */
export function isQRish(number) {
  if (!number) return false;
  return !/^\d+$/.test(number); // contains letters/symbols -> QR
}

/** GS1 check-digit validation (EAN-13 / EAN-8 / ITF-14 all share the mod-10
 *  scheme: weights 3,1,3,1… from the rightmost data digit). */
export function gs1CheckValid(digits) {
  if (!/^\d{2,}$/.test(digits)) return false;
  const data = digits.slice(0, -1).split('').reverse();
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += Number(data[i]) * (i % 2 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(digits.slice(-1));
}

/** Pure-numeric/payload heuristic -> concrete code format.
 *  12/13 digits -> EAN-13 (check-digit test for 13); 14 digits -> ITF-14 with
 *  Code 128 fallback when the check digit fails; 8 digits -> EAN-8 likewise.
 *  19+ digit numbers stay linear (Code 128) — never auto-QR. QR only for
 *  clearly alphanumeric-2D content (URLs, mixed text payloads). */
export function heuristicCode(number) {
  const n = String(number || '');
  if (!n) return 'CODE128';
  if (/^\d+$/.test(n)) {
    if (n.length === 12) return 'EAN13'; // JsBarcode computes the check digit
    if (n.length === 13) return gs1CheckValid(n) ? 'EAN13' : 'CODE128';
    if (n.length === 14) return gs1CheckValid(n) ? 'ITF14' : 'CODE128';
    if (n.length === 8) return gs1CheckValid(n) ? 'EAN8' : 'CODE128';
    return 'CODE128';
  }
  return isQRish(n) ? 'qr' : 'CODE128';
}

const HINTS = new Set(['aztec', 'qr', 'code39', 'code128']);
const LINEAR_EXPLICIT = new Set(['EAN13', 'EAN8', 'UPC', 'CODE39', 'ITF14']);

/** Resolve the effective code format for a card. Precedence:
 *  1. stored card state — an explicit displayFormat, an AZTEC format, or a
 *     deliberately chosen linear format (EAN13/CODE39/…; plain CODE128 is
 *     treated as the neutral default rather than a deliberate choice);
 *  2. catalog `code` hint on the card's preset (tesco=aztec, lidl=qr, …);
 *  3. heuristic (heuristicCode above). */
export function resolveCode(card, catalogEntry = null) {
  if (card.displayFormat === 'aztec') return 'aztec';
  if (card.displayFormat === 'qr') return 'qr';
  if (card.displayFormat === 'barcode') {
    return LINEAR_EXPLICIT.has(card.format) ? card.format : 'CODE128';
  }
  const stored = String(card.format || '').toUpperCase();
  if (stored === 'AZTEC') return 'aztec';
  if (LINEAR_EXPLICIT.has(stored)) return stored;
  const hint = String(catalogEntry?.code || '').toLowerCase();
  if (HINTS.has(hint)) return hint === 'code39' ? 'CODE39' : hint === 'code128' ? 'CODE128' : hint;
  return heuristicCode(card.number || '');
}

/** Resolve the effective display mode for a card ('aztec' | 'qr' | 'barcode'). */
export function displayMode(card, catalogEntry = null) {
  const code = resolveCode(card, catalogEntry);
  return code === 'aztec' ? 'aztec' : code === 'qr' ? 'qr' : 'barcode';
}

/** Per-format dispatch: render `value` into `canvas` as the given code format
 *  ('aztec' | 'qr' | any JsBarcode format). Returns true on success; the QR
 *  branch is async, so callers should await this. */
export function renderCode(canvas, format, value, opts = {}) {
  if (format === 'aztec') return renderAztec(canvas, value, opts);
  if (format === 'qr') return renderQR(canvas, value, opts);
  return renderBarcode(canvas, value, format || 'CODE128', opts);
}

/** "123 456 789 0" style grouping for display. */
export function groupNumber(number) {
  const digits = number.replace(/\D/g, '');
  if (!digits || digits.length !== number.length) return number; // non-numeric: show as-is
  if (digits.length <= 4) return digits;
  const groups = [];
  const head = digits.length % 3;
  let i = 0;
  if (head) { groups.push(digits.slice(0, head)); i = head; }
  for (; i < digits.length; i += 3) groups.push(digits.slice(i, i + 3));
  // ensure trailing group isn't a lone digit if we can rebalance: keep simple
  return groups.join(' ');
}
