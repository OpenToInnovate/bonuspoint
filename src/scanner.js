/**
 * Camera scanning: native BarcodeDetector when available, else ZXing (@zxing/library, bundled).
 * Supported symbologies: EAN-13/8, UPC-A/E, Code 128, Code 39, ITF, QR, Aztec.
 * startScan(video, onResult) -> stop function.
 */
import {
  BrowserMultiFormatReader, BarcodeFormat, DecodeHintType,
} from '@zxing/library';

const ZXING_MAP = {
  ean_13: 'ean_13', ean_8: 'ean_8', code_128: 'code_128', code_39: 'code_39',
  upc_a: 'upc_a', upc_e: 'upc_e', qr_code: 'qr_code', itf: 'itf', aztec: 'aztec',
  data_matrix: 'data_matrix',
};

/** BarcodeDetector formats supported natively and mapped by us (same set as camera path). */
function nativeFormats(formats) {
  return formats.filter((f) => ZXING_MAP[f]);
}

/** BarcodeDetector name -> ZXing BarcodeFormat enum key. */
const NATIVE_TO_ZXING_KEY = {
  ean_13: 'EAN_13', ean_8: 'EAN_8', upc_a: 'UPC_A', upc_e: 'UPC_E',
  code_128: 'CODE_128', code_39: 'CODE_39', itf: 'ITF',
  qr_code: 'QR_CODE', aztec: 'AZTEC', data_matrix: 'DATA_MATRIX',
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
  if (f === 'aztec') return { format: 'AZTEC', displayFormat: 'aztec' };
  const map = {
    ean_13: 'EAN13', ean_8: 'EAN8', upc_a: 'UPC', upc_e: 'UPC',
    code_128: 'CODE128', code_39: 'CODE39', itf: 'ITF14', data_matrix: 'CODE128',
  };
  return { format: map[f] || 'CODE128', displayFormat: 'barcode' };
}

/** Native BarcodeDetector decode on an ImageBitmap; returns null when nothing found. */
async function decodeImageNative(bitmap, formats) {
  const detector = new BarcodeDetector({ formats: formats.length ? formats : ['qr_code'] });
  const codes = await detector.detect(bitmap);
  if (!codes.length) return null;
  // Prefer the first result, mirroring startScan (codes[0]).
  return { text: codes[0].rawValue, format: codes[0].format, source: 'native' };
}

/** Draw a bitmap to a canvas at a given scale (for the 2x upscale retry). */
function scaledCanvas(bitmap, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Decode a barcode/QR from an image File, mirroring the camera path:
 * native BarcodeDetector first (same format set as startScan), then ZXing
 * with TRY_HARDER + full format hints. Attempts: original, then 2x upscale. */
export async function decodeImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    let bitmap = null;
    try { bitmap = await createImageBitmap(file); } catch (_) { bitmap = null; }

    if (nativeDetectorSupported() && bitmap) {
      const formats = nativeFormats(await BarcodeDetector.getSupportedFormats());
      for (const scale of [1, 2]) {
        try {
          const found = await decodeImageNative(
            scale === 1 ? bitmap : scaledCanvas(bitmap, 2), formats
          );
          if (found) return found;
        } catch (_) { /* try next attempt / fallback */ }
      }
    }

    // ZXing fallback with hints: default hints may skip some symbologies.
    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    const possible = Object.keys(ZXING_MAP)
      .map((f) => BarcodeFormat[NATIVE_TO_ZXING_KEY[f]])
      .filter(Boolean);
    if (possible.length) hints.set(DecodeHintType.POSSIBLE_FORMATS, possible);
    const reader = new BrowserMultiFormatReader(hints);
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
  let controls = null; // declared before use: the decode callback stops the loop
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
  }).then((c) => { controls = c; stop = () => c.stop(); });
  // Note: assignment above runs async; wrap to ensure latest stop is used.
  return () => { try { stop(); } catch (_) {} };
}
