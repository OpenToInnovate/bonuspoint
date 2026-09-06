/**
 * Camera scanning: native BarcodeDetector when available, else ZXing (@zxing/library, bundled).
 * Supported symbologies: EAN-13/8, UPC-A/E, Code 128, Code 39, ITF, QR.
 * startScan(video, onResult) -> stop function.
 */
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/library';

const ZXING_MAP = {
  ean_13: 'ean_13', ean_8: 'ean_8', code_128: 'code_128', code_39: 'code_39',
  upc_a: 'upc_a', upc_e: 'upc_e', qr_code: 'qr_code', itf: 'itf',
};

export function nativeDetectorSupported() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Map a raw scan symbology to our card storage: `format` (JsBarcode name) and
 * `displayFormat` ('qr' | 'barcode') so the card opens in the scanned pattern.
 */
export function mapScanFormat(rawFormat) {
  const f = String(rawFormat || '').toLowerCase();
  if (f === 'qr_code' || f === 'qr') return { format: 'CODE128', displayFormat: 'qr' };
  const map = {
    ean_13: 'EAN13', ean_8: 'EAN8', upc_a: 'UPC', upc_e: 'UPC',
    code_128: 'CODE128', code_39: 'CODE39', itf: 'ITF14',
  };
  return { format: map[f] || 'CODE128', displayFormat: 'barcode' };
}

/** Decode a barcode/QR from an image File (offline, bundled ZXing). */
export async function decodeImageFile(file) {
  const reader = new BrowserMultiFormatReader();
  const url = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(url);
    return {
      text: result.getText(),
      format: Object.keys(BarcodeFormat).find(
        (k) => BarcodeFormat[k] === result.getBarcodeFormat()
      ) || 'CODE_128',
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function startScan(video, onResult, onError = console.warn) {
  let stop = () => {};

  if (nativeDetectorSupported()) {
    try {
      const formats = (await BarcodeDetector.getSupportedFormats()).filter((f) => ZXING_MAP[f]);
      const detector = new BarcodeDetector({ formats: formats.length ? formats : ['qr_code'] });
      let raf, alive = true;
      const tick = async () => {
        if (!alive) return;
        try {
          if (video.readyState >= 2) {
            const codes = await detector.detect(video);
            if (codes.length) {
              const best = codes[0];
              onResult({ text: best.rawValue, format: best.format, source: 'native' });
              return; // stop scanning after a hit
            }
          }
        } catch (e) { onError(e); }
        raf = requestAnimationFrame(() => setTimeout(tick, 120));
      };
      tick();
      stop = () => { alive = false; cancelAnimationFrame(raf); };
      return stop;
    } catch (e) {
      onError(e); // fall through to ZXing
    }
  }

  const reader = new BrowserMultiFormatReader();
  let lastText = null, lastAt = 0, fired = false;
  reader.decodeFromVideoDevice(null, video, (result, err) => {
    if (fired) return; // latch: at most one onResult per startScan call
    if (result) {
      const text = result.getText();
      const now = Date.now();
      // Cooldown: ignore an identical decode within 3s (detector jitter).
      if (text === lastText && now - lastAt < 3000) return;
      lastText = text; lastAt = now;
      fired = true;
      try { controls?.stop?.(); } catch (_) {} // stop the detection loop immediately
      onResult({ text, format: result.getBarcodeFormat()?.toString?.() ?? String(result.getBarcodeFormat()), source: 'zxing' });
      return;
    }
    if (err && !(err.name === 'NotFoundException')) onError(err);
  }).then((controls) => { stop = () => controls.stop(); });
  // Note: assignment above runs async; wrap to ensure latest stop is used.
  return () => { try { stop(); } catch (_) {} };
}
