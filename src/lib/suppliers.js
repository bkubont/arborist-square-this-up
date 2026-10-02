/**
 * Curated vendor suggestions for typeaheads.
 * Arborist-oriented suppliers — free-text override remains allowed in the UI.
 */

/** Popular real supplier names for typeahead. */
export const POPULAR_SUPPLIERS = [
  'Local chip dump',
  'Municipal green waste',
  'Fuel station',
  'Crane rental',
  'Stump grinder rental',
  'Tree care supplier',
  'Nursery / plant stock',
  'PHC chemical supplier',
  'Hardware store',
  'Amazon',
  'Online specialty',
];

/** Category-style labels for typeahead. */
export const CATALOG_SOURCE_LABELS = [
  'Chip dump',
  'Fuel',
  'Crane rental',
  'Equipment rental',
  'Nursery',
  'PHC supplier',
  'Specialty',
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
