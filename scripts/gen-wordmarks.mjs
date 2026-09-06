// One-off brand wordmark generator for catalog brands missing from simple-icons
// (simple-icons removed most retail brands via trademark takedowns; see README note).
// Generates bold, full-width wordmark SVGs (white, tintable via logos.js).
// Run: node scripts/gen-wordmarks.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'logos');

// Per-brand wordmark styling. textLength forces the wordmark to span ~92% of the
// 240-wide viewBox so logos dominate the tile at any rendered size.
const BRANDS = {
  aldi:          { text: 'ALDI' },
  bestbuy:       { text: 'BEST BUY', size: 40 },
  biccamera:     { text: 'BIC CAMERA', size: 36 },
  biglots:       { text: 'BIG LOTS', size: 38 },
  cafenero:      { text: 'CAFFÈ NERO', size: 36 },
  canadiantire:  { text: 'CANADIAN TIRE', size: 34 },
  costa:         { text: 'COSTA', spacing: 8 },
  cvs:           { text: 'CVS', spacing: 10 },
  dominos:       { text: "DOMINO'S", size: 38 },
  dpoint:        { text: 'd POINT', size: 42 },
  dunkin:        { text: "DUNKIN'", size: 40 },
  famipay:       { text: 'FamiPay', size: 42 },
  'holland-barrett': { text: 'HOLLAND & BARRETT', size: 28 },
  'jd-sports':   { text: 'JD', spacing: 4 },
  greggs:        { text: 'GREGGS', size: 40 },
  kroger:        { text: 'KROGER', spacing: 4 },
  lawson:        { text: 'LAWSON', spacing: 6 },
  lowes:         { text: "Lowe's", size: 44 },
  muji:          { text: 'MUJI', spacing: 10 },
  nanaco:        { text: 'nanaco', size: 44 },
  nandos:        { text: "NANDO'S", size: 38 },
  nectar:        { text: 'NECTAR', spacing: 6 },
  panera:        { text: 'Panera', size: 46 },
  pcoptimum:     { text: 'PC OPTIMUM', size: 36 },
  ponta:         { text: 'ponta', size: 46 },
  pret:          { text: 'PRET', spacing: 8 },
  rei:           { text: 'REI', spacing: 8 },
  rexall:        { text: 'Rexall', size: 44 },
  'safeway-ca':  { text: 'SAFEWAY', size: 38 },
  sainsburys:    { text: "Sainsbury's", size: 36 },
  sephora:       { text: 'SEPHORA', spacing: 6 },
  sobeys:        { text: 'SOBEYS', spacing: 6 },
  sportchek:     { text: 'SPORT CHEK', size: 36 },
  superdrug:     { text: 'SUPERDRUG', size: 36 },
  timhortons:    { text: 'Tim Hortons', size: 36 },
  tpoint:        { text: 'T POINT', size: 40 },
  traderjoes:    { text: "TRADER JOE'S", size: 32 },
  wagamama:      { text: 'wagamama', size: 40 },
  waitrose:      { text: 'Waitrose', size: 42 },
  walgreens:     { text: 'Walgreens', size: 40 },
  yodobashi:     { text: 'YODOBASHI', size: 36 },
};

for (const [id, { text, size = 44, spacing = 0 }] of Object.entries(BRANDS)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 90" fill="#ffffff" role="img"><title>${text}</title><text x="120" y="64" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${size}" letter-spacing="${spacing}" textLength="220" lengthAdjust="spacingAndGlyphs" fill="#ffffff">${text}</text></svg>\n`;
  writeFileSync(join(dir, `${id}.svg`), svg);
}
console.log(`Wrote ${Object.keys(BRANDS).length} wordmarks.`);
