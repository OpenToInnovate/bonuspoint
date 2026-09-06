/**
 * Code rendering: linear barcodes via JsBarcode, QR via `qrcode` — both bundled locally.
 */
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

/** Render `number` as a barcode into `canvas`. Returns true on success. */
export function renderBarcode(canvas, number, format = 'CODE128') {
  try {
    JsBarcode(canvas, number, {
      format,
      width: 2,
      height: 90,
      displayValue: false,
      margin: 8,
      background: '#ffffff',
      lineColor: '#111111',
    });
    return true;
  } catch (e) {
    console.warn('barcode render failed', e);
    return false;
  }
}

/** Render `number` as a QR code into `canvas`. Returns true on success. */
export async function renderQR(canvas, text) {
  try {
    await QRCode.toCanvas(canvas, text, {
      width: 260,
      margin: 2,
      color: { dark: '#111111', light: '#ffffff' },
    });
    return true;
  } catch (e) {
    console.warn('qr render failed', e);
    return false;
  }
}

/** Heuristic: alphanumeric or very long numeric codes scan better as QR. */
export function isQRish(number) {
  if (!number) return false;
  if (!/^\d+$/.test(number)) return true; // contains letters/symbols -> QR
  return number.length > 18; // very long numeric -> QR
}

/** Resolve the effective display mode for a card ('qr' | 'barcode'). */
export function displayMode(card) {
  if (card.displayFormat === 'qr') return 'qr';
  if (card.displayFormat === 'barcode') return 'barcode';
  return isQRish(card.number || '') ? 'qr' : 'barcode';
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
