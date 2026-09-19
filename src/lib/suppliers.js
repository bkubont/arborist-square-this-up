/**
 * Curated Material Order suppliers — seed + catalog preferred_source labels only.
 * No organic “remember what I typed” history. Free-text override remains allowed in the UI.
 */

/** Popular real supplier names for typeahead. */
export const POPULAR_SUPPLIERS = [
  'Home Depot',
  "Lowe's",
  'Menards',
  'Ace Hardware',
  'Ferguson',
  'ABC Supply',
  'Grainger',
  'Amazon',
  'Sherwin-Williams',
  'Floor & Decor',
  'Local lumberyard',
  'Local plumbing supply',
  'Local electrical supply',
  'Specialty glass shop',
  'Online specialty',
];

/** Category-style labels from Materials_Master `preferred_source` (catalog seed). */
export const CATALOG_SOURCE_LABELS = [
  'Big-box',
  'Big-box / plumbing supply',
  'Big-box / specialty',
  'Big-box / online',
  'Big-box / lumberyard',
  'Specialty',
  'Specialty / Big-box',
  'Specialty / glass shop',
  'Lumberyard / Big-box',
];

/** Deduped list used by supplier typeahead. */
export const SUPPLIER_SUGGESTIONS = [...new Set([...POPULAR_SUPPLIERS, ...CATALOG_SOURCE_LABELS])];

/**
 * Filter curated suppliers by typed query (substring, case-insensitive).
 * Does not invent names or learn from prior free-text entries.
 */
export function filterSupplierSuggestions(query = '', { limit = 8 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const max = Math.min(Math.max(Number(limit) || 8, 1), 20);
  if (!q) return SUPPLIER_SUGGESTIONS.slice(0, max);
  const scored = [];
  for (const name of SUPPLIER_SUGGESTIONS) {
    const lower = name.toLowerCase();
    if (!lower.includes(q)) continue;
    const score = lower.startsWith(q) ? 0 : 1;
    scored.push({ name, score });
  }
  scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  return scored.slice(0, max).map((row) => row.name);
}
