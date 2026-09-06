/**
 * Built-in catalog of popular loyalty chains, tagged by region.
 * regions: array of 'GB' | 'US' | 'CA' | 'JP' | 'EU'.
 * European (non-UK) legacy entries stay in the 'EU' bucket — shown under
 * "All regions" and as auto-detected fallback for unmapped locales.
 */
export const CATALOG = [
  // ---------- United Kingdom ----------
  { id: 'tesco', name: 'Tesco Clubcard', color: '#00539f', format: 'CODE128', regions: ['GB'] },
  { id: 'sainsburys', name: "Sainsbury's Nectar", color: 'linear-gradient(90deg,#ff6a13,#f37021)', format: 'CODE128', regions: ['GB'] },
  { id: 'nectar', name: 'Nectar', color: '#6e2585', format: 'CODE128', regions: ['GB'] },
  { id: 'boots', name: 'Boots Advantage', color: '#0d3a97', format: 'CODE128', regions: ['GB'] },
  { id: 'asda', name: 'ASDA Rewards', color: '#67b346', format: 'CODE128', regions: ['GB'] },
  { id: 'morrisons', name: 'Morrisons More', color: '#f5a800', format: 'CODE128', regions: ['GB'] },
  { id: 'waitrose', name: 'Waitrose & Partners', color: '#3f7a3f', format: 'CODE128', regions: ['GB'] },
  { id: 'lidl-gb', name: 'Lidl Plus', color: '#0050aa', format: 'CODE128', regions: ['GB'] },
  { id: 'costa', name: 'Costa Coffee Club', color: '#d5352c', format: 'CODE128', regions: ['GB'] },
  { id: 'greggs', name: 'Greggs Rewards', color: '#005eb8', format: 'CODE128', regions: ['GB'] },
  { id: 'ikea', name: 'IKEA Family', color: '#0058a3', format: 'CODE128', regions: ['GB', 'CA', 'EU'] },
  { id: 'superdrug', name: 'Superdrug', color: '#e4002b', format: 'CODE128', regions: ['GB'] },
  { id: 'holland-barrett', name: 'Holland & Barrett', color: '#00693e', format: 'CODE128', regions: ['GB'] },
  { id: 'jd-sports', name: 'JD Sports', color: '#000000', format: 'CODE128', regions: ['GB'] },
  { id: 'argos', name: 'Argos', color: '#d12732', format: 'CODE128', regions: ['GB'] },

  // ---------- United States ----------
  { id: 'starbucks', name: 'Starbucks', color: '#00704a', format: 'CODE128', regions: ['US', 'CA'] },
  { id: 'cvs', name: 'CVS ExtraCare', color: '#cc0000', format: 'CODE128', regions: ['US'] },
  { id: 'walgreens', name: 'Walgreens Balance Rewards', color: '#e31837', format: 'CODE128', regions: ['US'] },
  { id: 'kroger', name: 'Kroger', color: '#004f9f', format: 'EAN13', regions: ['US'] },
  { id: 'target', name: 'Target Circle', color: '#cc0000', format: 'CODE128', regions: ['US'] },
  { id: 'lowes', name: "Lowe's", color: '#004990', format: 'CODE128', regions: ['US'] },
  { id: 'panera', name: 'Panera', color: '#5d6b2e', format: 'CODE128', regions: ['US'] },
  { id: 'biglots', name: 'Big Lots', color: '#e4002b', format: 'CODE128', regions: ['US'] },
  { id: 'samsclub', name: "Sam's Club", color: '#0088cf', format: 'CODE128', regions: ['US'] },
  { id: 'rei', name: 'REI Co-op', color: '#5c6f3f', format: 'CODE128', regions: ['US'] },
  { id: 'sephora', name: 'Sephora', color: '#000000', format: 'CODE128', regions: ['US', 'CA'] },
  { id: 'bestbuy', name: 'Best Buy', color: '#003b64', format: 'CODE128', regions: ['US'] },
  { id: 'dunkin', name: "Dunkin'", color: '#ff671f', format: 'CODE128', regions: ['US'] },
  { id: 'dominos', name: "Domino's", color: '#006491', format: 'CODE128', regions: ['US'] },
  { id: 'traderjoes', name: 'Trader Joe’s', color: '#a02c2c', format: 'CODE128', regions: ['US'] },

  // ---------- Canada ----------
  { id: 'pcoptimum', name: 'PC Optimum', color: '#e01a4f', format: 'CODE128', regions: ['CA'] },
  { id: 'canadiantire', name: 'Canadian Tire Triangle', color: '#d6001c', format: 'CODE128', regions: ['CA'] },
  { id: 'timhortons', name: 'Tim Hortons', color: '#c8102e', format: 'CODE128', regions: ['CA'] },
  { id: 'rexall', name: 'Rexall Be Well', color: '#e31837', format: 'CODE128', regions: ['CA'] },
  { id: 'sobeys', name: 'Sobeys', color: '#ed1c24', format: 'CODE128', regions: ['CA'] },
  { id: 'safeway-ca', name: 'Safeway', color: '#0a6b3d', format: 'CODE128', regions: ['CA'] },
  { id: 'sportchek', name: 'Sport Chek', color: '#003da5', format: 'CODE128', regions: ['CA'] },

  // ---------- Japan ----------
  { id: 'rakuten', name: 'Rakuten Points (楽天ポイント)', color: '#bf0000', format: 'CODE128', regions: ['JP'] },
  { id: 'ponta', name: 'Ponta (ポンタ)', color: '#f08300', format: 'CODE128', regions: ['JP'] },
  { id: 'dpoint', name: 'dポイント (ドコモ)', color: '#cc0000', format: 'CODE128', regions: ['JP'] },
  { id: 'tpoint', name: 'Tポイント', color: '#f39700', format: 'CODE128', regions: ['JP'] },
  { id: 'famipay', name: 'FamiPay (ファミペイ)', color: '#007c3e', format: 'CODE128', regions: ['JP'] },
  { id: 'lawson', name: 'Lawson Ponta (ローソン)', color: '#007bb7', format: 'CODE128', regions: ['JP'] },
  { id: 'nanaco', name: '7-Eleven nanaco (nanaco)', color: '#00a54f', format: 'CODE128', regions: ['JP'] },
  { id: 'starbucks-jp', name: 'Starbucks Japan', color: '#00704a', format: 'CODE128', regions: ['JP'] },
  { id: 'biccamera', name: 'Bic Camera (ビックカメラ)', color: '#f6a800', format: 'CODE128', regions: ['JP'] },
  { id: 'yodobashi', name: 'Yodobashi (ヨドバシ)', color: '#005eb8', format: 'CODE128', regions: ['JP'] },
  { id: 'muji', name: 'MUJI (無印良品)', color: '#7f0019', format: 'CODE128', regions: ['JP'] },

  // ---------- EU (legacy entries kept for existing users) ----------
  { id: 'rewe', name: 'REWE', color: '#cc071e', format: 'CODE128', regions: ['EU'] },
  { id: 'aldi', name: 'Aldi', color: '#1c69d4', format: 'CODE128', regions: ['EU'] },
  { id: 'lidl', name: 'Lidl', color: '#0050aa', format: 'CODE128', regions: ['EU'] },
  { id: 'dm', name: 'dm', color: '#1a3c8f', format: 'CODE128', regions: ['EU'] },
  { id: 'metro', name: 'Metro', color: '#002d72', format: 'CODE128', regions: ['EU'] },
  { id: 'rossmann', name: 'Rossmann', color: '#c8102e', format: 'CODE128', regions: ['EU'] },
  { id: 'carrefour', name: 'Carrefour', color: '#004e9f', format: 'CODE128', regions: ['EU'] },
  { id: 'h&m', name: 'H&M', color: '#e50010', format: 'CODE128', regions: ['EU'] },
  { id: 'muller', name: 'Müller', color: '#e30613', format: 'CODE128', regions: ['EU'] },
];

/** Region labels for the add-card header / settings. */
export const REGION_LABELS = {
  GB: 'United Kingdom', US: 'United States', CA: 'Canada', JP: 'Japan', EU: 'Europe', ALL: 'All regions',
};

/** Renderable barcode formats supported by JsBarcode that we expose. */
export const FORMATS = ['CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39', 'ITF14'];

/** Formats the camera scanner accepts (ZXing + native BarcodeDetector union). */
export const SCAN_FORMATS = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf'];
