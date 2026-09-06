# Bonus Point 🎟️

An **open, offline-first loyalty-card wallet** for your phone — a free, privacy-respecting
replacement for the classic Stocard experience. No ads. No tracking. No accounts.
Your cards never leave your device.

## Features

- **Cards wallet** — 2-column grid of colored brand tiles, Stocard-style detail view with a
  large scannable barcode and grouped card number.
- **Built-in catalog** of popular chains (Starbucks, CVS, Walgreens, Kroger, IKEA Family,
  REWE, Aldi, Lidl, dm, Metro, …) plus **custom cards** with any name and color.
- **Camera scanning** — native `BarcodeDetector` when available, bundled ZXing fallback.
  Supports EAN-13, EAN-8, UPC-A/E, Code 128, Code 39, ITF and QR.
- **Barcode rendering** via bundled JsBarcode (EAN-13/8, UPC, Code 128, Code 39, ITF-14),
  with a "bright" fullscreen mode for easier scanning at the till.
- **Fully offline PWA** — installable on Android/iOS, service-worker precache, zero runtime
  network requests after first load.
- **Notes, edit, delete**, dark theme, and **JSON export/import** backups.
- **IndexedDB persistence** — no server, no accounts, no analytics. Ever.

## Privacy stance

Bonus Point has no backend. Card data is stored locally in your browser's IndexedDB.
The app makes **no network requests at runtime** (everything is bundled and precached),
contains no analytics, ads, or trackers. Backups are plain JSON you export yourself.

## Development

```bash
npm install
npm run dev        # dev server
npm run build      # production build into dist/
npm run preview    # serve the production build
```

## Stack

- [Vite](https://vitejs.dev) + vanilla JS (no framework)
- [JsBarcode](https://github.com/lindell/JsBarcode) for barcode rendering
- [@zxing/library](https://github.com/zxing-js/library) for camera scanning fallback
- Hand-rolled IndexedDB layer, hand-rolled service worker (precache + cache-first)

## Suggested next milestones

1. **QR fallback rendering** for numbers that don't fit linear barcode formats.
2. Reorder / favorites / archive UI.
3. Front-camera torch & zoom controls (where supported) for scanner.
4. Card category filter & search.
5. Barcode size/format heuristics (auto-pick format from number pattern).
6. Passkey-free encrypted backup option (WebCrypto, passphrase-derived key).

## License

MIT — see LICENSE.
