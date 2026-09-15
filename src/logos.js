/**
 * Brand logos, bundled at build time (src/assets/logos/*.svg) — never fetched at runtime.
 * Monochrome logos are stored as white single-colour glyphs; `logoSrc` tints them to the
 * brand's ink colour so white-background tiles (e.g. ASDA) stay legible.
 * Full-colour marks carry data-fullcolor="1" on their root <svg> and are returned untinted.
 */
const RAW = import.meta.glob('./assets/logos/*.svg', { eager: true, query: '?raw', import: 'default' });

export function hasLogo(id) {
  return Boolean(id && RAW[`./assets/logos/${id}.svg`]);
}

export function logoSrc(id, ink = '#ffffff') {
  if (!id) return null;
  const raw = RAW[`./assets/logos/${id}.svg`];
  if (!raw) return null;
  // Full-colour marks (e.g. Lidl's yellow/blue/red disc) must not be re-tinted.
  if (/data-fullcolor="1"/.test(raw)) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(raw);
  }
  const tinted = raw.replace(/fill="#ffffff"/gi, `fill="${ink}"`);
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(tinted);
}
