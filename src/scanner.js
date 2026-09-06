/**
 * Camera scanning: native BarcodeDetector when available, else ZXing (@zxing/library, bundled).
 * Supported symbologies: EAN-13/8, UPC-A/E, Code 128, Code 39, ITF, QR.
 * startScan(video, onResult) -> stop function.
 */
import { BrowserMultiFormatReader } from '@zxing/library';

const ZXING_MAP = {
  ean_13: 'ean_13', ean_8: 'ean_8', code_128: 'code_128', code_39: 'code_39',
  upc_a: 'upc_a', upc_e: 'upc_e', qr_code: 'qr_code', itf: 'itf',
};

export function nativeDetectorSupported() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
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
  reader.decodeFromVideoDevice(null, video, (result, err) => {
    if (result) {
      onResult({ text: result.getText(), format: result.getBarcodeFormat()?.toString?.() ?? String(result.getBarcodeFormat()), source: 'zxing' });
    } else if (err && !(err.name === 'NotFoundException')) {
      onError(err);
    }
  }).then((controls) => { stop = () => controls.stop(); });
  // Note: assignment above runs async; wrap to ensure latest stop is used.
  return () => { try { stop(); } catch (_) {} };
}
