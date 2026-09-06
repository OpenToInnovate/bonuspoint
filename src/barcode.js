/**
 * Barcode rendering (JsBarcode, bundled) + QR fallback.
 * QR is a tiny dependency-free option: we render a QR via a minimal encoder
 * only if we bundle one — for MVP we use JsBarcode only and note QR as stubbed
 * unless a QR lib is present. To keep "no CDN" we implement QR via 'qrcode-generator'
 * style encoder? Too heavy inline — instead we gate QR behind an optional bundled lib.
 */
import JsBarcode from 'jsbarcode';

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
