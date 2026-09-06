/**
 * Offline region detection — no network, no geolocation API.
 * Maps the device IANA time zone + navigator.languages to a support region
 * (GB | US | CA | JP | EU | ALL). Detection is a guess; Settings offers overrides.
 */

export const REGIONS = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'GB', label: 'United Kingdom' },
  { id: 'US', label: 'United States' },
  { id: 'CA', label: 'Canada' },
  { id: 'JP', label: 'Japan' },
  { id: 'ALL', label: 'All regions' },
];

// IANA timezone prefix -> region (checked with startsWith, most specific first).
const TZ_MAP = [
  ['Europe/London', 'GB'], ['Europe/Belfast', 'GB'], ['Europe/Guernsey', 'GB'],
  ['Europe/Isle_of_Man', 'GB'], ['Europe/Jersey', 'GB'],
  ['America/Toronto', 'CA'], ['America/Vancouver', 'CA'], ['America/Montreal', 'CA'],
  ['America/Edmonton', 'CA'], ['America/Winnipeg', 'CA'], ['America/Halifax', 'CA'],
  ['America/St_Johns', 'CA'], ['America/Regina', 'CA'], ['America/Yellowknife', 'CA'],
  ['America/Iqaluit', 'CA'], ['America/Whitehorse', 'CA'],
  ['Asia/Tokyo', 'JP'], ['Japan', 'JP'],
  // US zones (specific names first; bare America/New_York etc. below)
  ['US/', 'US'],
  ['America/New_York', 'US'], ['America/Chicago', 'US'], ['America/Denver', 'US'],
  ['America/Los_Angeles', 'US'], ['America/Phoenix', 'US'], ['America/Anchorage', 'US'],
  ['Pacific/Honolulu', 'US'], ['America/Detroit', 'US'], ['America/Boise', 'US'],
  ['America/Indiana/', 'US'], ['America/North_Dakota/', 'US'], ['America/Kentucky/', 'US'],
  ['America/Puerto_Rico', 'US'], ['America/Adak', 'US'], ['America/Juneau', 'US'],
  ['America/Nome', 'US'], ['America/Sitka', 'US'], ['America/Metlakatla', 'US'],
  ['America/Yakutat', 'US'],
  // Remaining European zones (GB ones are matched above) -> EU bucket
  ['Europe/', 'EU'],
];

// Language subtag -> region fallback (used when timezone is unmapped/unknown).
const LANG_MAP = {
  'en-gb': 'GB', 'gd': 'GB', 'cy': 'GB', 'en-ie': 'GB',
  'en-us': 'US', 'es-us': 'US',
  'en-ca': 'CA', 'fr-ca': 'CA',
  'ja': 'JP', 'ja-jp': 'JP',
  'de': 'EU', 'fr': 'EU', 'it': 'EU', 'es': 'EU', 'nl': 'EU', 'pl': 'EU', 'pt': 'EU',
};

function tzRegion() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (!tz) return null;
    for (const [prefix, region] of TZ_MAP) if (tz.startsWith(prefix)) return region;
    // US zones not individually listed: fall back on offset heuristics is overkill —
    // treat any remaining US/* as US.
    if (tz.startsWith('US/')) return 'US';
    return null;
  } catch { return null; }
}

function langRegion() {
  const KNOWN = new Set(['GB', 'US', 'CA', 'JP']);
  for (const tag of navigator.languages || [navigator.language || '']) {
    if (!tag) continue;
    const lower = String(tag).toLowerCase();
    if (LANG_MAP[lower]) return LANG_MAP[lower];
    const parts = lower.split('-');
    if (parts.length > 1 && KNOWN.has(parts[1].toUpperCase())) return parts[1].toUpperCase();
    const base = parts[0];
    if (LANG_MAP[base]) return LANG_MAP[base];
  }
  return null;
}

/**
 * Detect region with a sensible fallback chain:
 * timezone match -> language match -> 'ALL' (show everything).
 */
export function detectRegion() {
  return tzRegion() || langRegion() || 'ALL';
}

/** Region ids a catalog entry must intersect with for region id `selected`. */
export function regionMatches(entryRegions, selected) {
  if (selected === 'ALL' || selected === 'auto') return true;
  return (entryRegions || []).includes(selected);
}
