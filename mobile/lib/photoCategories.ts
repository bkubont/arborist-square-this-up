/** Photo categories on a job (mirrors src/lib/photoCategories.js). */
export const PHOTO_CATEGORIES = [
  { key: 'before', label: 'Before', type: 'photo' },
  { key: 'after', label: 'After', type: 'photo' },
  { key: 'addition', label: 'Addition', type: 'photo' },
  { key: 'note', label: 'Note', type: 'photo' },
  { key: 'receipt', label: 'Receipt', type: 'receipt' },
  { key: 'gallery', label: 'Gallery', type: 'photo' },
] as const;

export type PhotoCategoryKey = (typeof PHOTO_CATEGORIES)[number]['key'];

const KEYS = new Set(PHOTO_CATEGORIES.map(c => c.key));

export function isPhotoEntry(entry: { photo_url?: string; category?: string } | null | undefined) {
  return Boolean(entry?.photo_url && entry.category && KEYS.has(entry.category as PhotoCategoryKey));
}

export function photoCategoryMeta(key: string) {
  return PHOTO_CATEGORIES.find(c => c.key === key) || { key, label: key, type: 'photo' as const };
}
