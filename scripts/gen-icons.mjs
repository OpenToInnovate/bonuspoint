// One-off icon generator: simple rose tile with a white rounded "card + star" mark.
// Pure Node (zlib) PNG encoder, run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixels /* Uint8Array RGBA rows */) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.set(raw.subarray(0, 0), 0); // noop guard
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function draw(size) {
  const px = new Uint8Array(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };
  const R = 225, G = 29, B = 72; // rose-600
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rounded-corner mask
      const c = size * 0.18;
      const inCorner = (cx, cy) => {
        const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
        return Math.hypot(x - cx, y - cy) > c && x < 0 || false;
      };
      let inside = true;
      const corners = [[c, c], [size - c, c], [c, size - c], [size - c, size - c]];
      for (const [cx, cy] of corners) {
        if ((x < c || x > size - c) && (y < c || y > size - c) && Math.hypot(x - cx, y - cy) > c) inside = false;
      }
      if (!inside) { set(x, y, 0, 0, 0, 0); continue; }
      set(x, y, R, G, B);
      // white rounded "card" with punched hole (ticket look)
      const cx = size / 2, cy = size / 2, w = size * 0.30, h = size * 0.21, rc = size * 0.045;
      const inCard = Math.abs(x - cx) < w && Math.abs(y - cy) < h;
      const hole = Math.hypot(x - cx, y - (cy - h)) < size * 0.035 && false; // decorative skip
      if (inCard && !hole) {
        // round card corners
        let cardInside = true;
        const cc = [[cx - w + rc, cy - h + rc], [cx + w - rc, cy - h + rc], [cx - w + rc, cy + h - rc], [cx + w - rc, cy + h - rc]];
        for (const [qx, qy] of cc) {
          if ((x < cx - w + rc || x > cx + w - rc) && (y < cy - h + rc || y > cy + h - rc) && Math.hypot(x - qx, y - qy) > rc) cardInside = false;
        }
        if (cardInside) set(x, y, 255, 255, 255);
      }
      // white "punch" circle to the right edge of card (ticket notch)
      const nx = cx + w, ny = cy;
      if (Math.hypot(x - nx, y - ny) < size * 0.05) set(x, y, R, G, B);
    }
  }
  return px;
}

mkdirSync('public/icons', { recursive: true });
for (const s of [192, 512]) writeFileSync(`public/icons/icon-${s}.png`, png(s, draw(s)));
console.log('icons written');
