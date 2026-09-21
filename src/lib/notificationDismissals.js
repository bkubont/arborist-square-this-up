/**
 * Client-local dismissals for attention notifications.
 * No server preference store exists yet — keyed by account user id / email.
 * Fingerprint (detail) so changed items reappear after dismiss.
 */

const STORAGE_PREFIX = "stu.notifications.dismissed.";

function storage() {
  try {
    if (typeof globalThis !== "undefined" && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    /* private mode / denied */
  }
  return null;
}

function storageKey(accountKey) {
  return `${STORAGE_PREFIX}${accountKey || "anon"}`;
}

/**
 * @param {string} accountKey
 * @returns {Record<string, string>}
 */
export function loadDismissals(accountKey) {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(storageKey(accountKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {string} accountKey
 * @param {Record<string, string>} map
 */
export function saveDismissals(accountKey, map) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(storageKey(accountKey), JSON.stringify(map));
  } catch {
    /* quota / private mode — ignore */
  }
}

/**
 * @param {{ id: string, detail?: string }} item
 * @param {Record<string, string>} dismissed
 */
export function isDismissed(item, dismissed) {
  if (!item?.id || !dismissed) return false;
  const fp = dismissed[item.id];
  if (fp == null) return false;
  return fp === String(item.detail ?? "");
}

/**
 * @template {{ id: string, detail?: string }} T
 * @param {T[]} items
 * @param {Record<string, string>} dismissed
 * @returns {T[]}
 */
export function filterDismissed(items, dismissed) {
  return (items || []).filter((item) => !isDismissed(item, dismissed));
}

/**
 * @param {string} accountKey
 * @param {{ id: string, detail?: string }} item
 * @returns {Record<string, string>}
 */
export function dismissItem(accountKey, item) {
  const next = { ...loadDismissals(accountKey), [item.id]: String(item.detail ?? "") };
  saveDismissals(accountKey, next);
  return next;
}

/**
 * @param {string} accountKey
 * @returns {Record<string, string>}
 */
export function clearDismissals(accountKey) {
  saveDismissals(accountKey, {});
  return {};
}
