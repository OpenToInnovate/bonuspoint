/**
 * Built-in catalog of popular loyalty chains.
 * name, color (brand tile), suggested barcode format for the number style.
 */
export const CATALOG = [
  { id: 'starbucks', name: 'Starbucks', color: '#00704a', format: 'CODE128' },
  { id: 'cvs', name: 'CVS', color: '#cc0000', format: 'CODE128' },
  { id: 'walgreens', name: 'Walgreens', color: '#e31837', format: 'CODE128' },
  { id: 'kroger', name: 'Kroger', color: '#004f9f', format: 'EAN13' },
  { id: 'lowes', name: "Lowe's", color: '#004990', format: 'CODE128' },
  { id: 'ikea', name: 'IKEA Family', color: '#0058a3', format: 'CODE128' },
  { id: 'panera', name: 'Panera', color: '#5d6b2e', format: 'CODE128' },
  { id: 'biglots', name: 'Big Lots', color: '#e4002b', format: 'CODE128' },
  { id: 'samsclub', name: "Sam's Club", color: '#0088cf', format: 'CODE128' },
  { id: 'rewe', name: 'REWE', color: '#cc071e', format: 'CODE128' },
  { id: 'aldi', name: 'Aldi', color: '#1c69d4', format: 'CODE128' },
  { id: 'lidl', name: 'Lidl', color: '#0050aa', format: 'CODE128' },
  { id: 'dm', name: 'dm', color: '#1a3c8f', format: 'CODE128' },
  { id: 'metro', name: 'Metro', color: '#002d72', format: 'CODE128' },
  { id: 'rossmann', name: 'Rossmann', color: '#c8102e', format: 'CODE128' },
  { id: 'carrefour', name: 'Carrefour', color: '#004e9f', format: 'CODE128' },
  { id: 'tesco', name: 'Tesco', color: '#00539f', format: 'CODE128' },
  { id: 'target', name: 'Target', color: '#cc0000', format: 'CODE128' },
  { id: 'h&m', name: 'H&M', color: '#e50010', format: 'CODE128' },
  { id: 'muller', name: 'Müller', color: '#e30613', format: 'CODE128' },
];

/** Renderable barcode formats supported by JsBarcode that we expose. */
export const FORMATS = ['CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39', 'ITF14'];

/** Formats the camera scanner accepts (ZXing + native BarcodeDetector union). */
export const SCAN_FORMATS = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf'];
