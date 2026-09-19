/** Photo / media categories on a job (Brittany Photos redesign). */
export const PHOTO_CATEGORIES = [
  { key: "before", label: "Before", type: "photo" },
  { key: "after", label: "After", type: "photo" },
  { key: "addition", label: "Addition", type: "photo" },
  { key: "note", label: "Note", type: "photo" },
  { key: "receipt", label: "Receipt", type: "receipt" },
  { key: "gallery", label: "Gallery", type: "photo" },
];

export const PHOTO_CATEGORY_KEYS = PHOTO_CATEGORIES.map((c) => c.key);

/** Entries that belong in the job photo gallery / camera flow. */
export function isPhotoEntry(entry) {
  return Boolean(entry?.photo_url && PHOTO_CATEGORY_KEYS.includes(entry.category));
}

export function photoCategoryLabel(key) {
  return PHOTO_CATEGORIES.find((c) => c.key === key)?.label || key;
}

export function photoCategoryMeta(key) {
  return PHOTO_CATEGORIES.find((c) => c.key === key) || { key, label: key, type: "photo" };
}
