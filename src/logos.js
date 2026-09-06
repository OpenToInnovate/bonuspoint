/**
 * Brand logos, bundled at build time (src/assets/logos/*.svg) — never fetched at runtime.
 * Logos are stored as white single-colour glyphs; `logoSrc` tints them to the
 * brand's ink colour so white-background tiles (e.g. ASDA) stay legible.
 */
const RAW = import.meta.glob('./assets/logos/*.svg', { eager: true, query: '?raw', import: 'default' });

export function hasLogo(id) {
  return Boolean(id && RAW[`./assets/logos/${id}.svg`]);
}

export function logoSrc(id, ink = '#ffffff') {
  if (!id) return null;
  const raw = RAW[`./assets/logos/${id}.svg`];
  if (!raw) return null;
  const tinted = raw.replace(/fill="#ffffff"/gi, `fill="${ink}"`);
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(tinted);
}
