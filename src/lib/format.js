export const money = (n) =>
  n ? `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

/** Integer cents (Payment, WorkItem amounts) → "$1,234.50". */
export const moneyCents = (cents) => money((Number(cents) || 0) / 100);

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a calendar day string with no time (`YYYY-MM-DD`). */
export function isDateOnlyString(value) {
  return typeof value === "string" && DATE_ONLY_RE.test(value.trim());
}

/**
 * Local calendar day at noon.
 * `YYYY-MM-DD` is that calendar day (not UTC midnight, which is the previous evening in the US).
 * Timestamps and Date values use the local calendar day of that instant.
 * @param {string | number | Date | null | undefined} value
 * @returns {Date | null}
 */
export function parseDateOnly(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
  }
  const raw = String(value).trim();
  const only = raw.match(DATE_ONLY_RE);
  if (only) {
    const year = Number(only[1]);
    const month = Number(only[2]);
    const day = Number(only[3]);
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) return null;
  return new Date(instant.getFullYear(), instant.getMonth(), instant.getDate(), 12, 0, 0, 0);
}

/**
 * `YYYY-MM-DD` for a calendar day.
 * Date-only strings are returned unchanged. Timestamps use the local calendar day.
 * @param {string | number | Date | null | undefined} value
 */
export function dateKey(value) {
  if (isDateOnlyString(value)) return String(value).trim();
  const date = value instanceof Date ? value : parseDateOnly(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Local calendar day for "today" (or a supplied instant). */
export function todayKey(now = new Date()) {
  return dateKey(now);
}

/**
 * Add calendar days to a date-only key. Noon-local so DST does not skip a day.
 * @param {string | Date} key
 * @param {number} days
 */
export function addCalendarDays(key, days) {
  const date = parseDateOnly(key);
  if (!date) return "";
  date.setDate(date.getDate() + (Number(days) || 0));
  return dateKey(date);
}

export const shortDate = (d) => {
  if (!d) return "—";
  const date = parseDateOnly(d);
  if (!date) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** Full date + time for activity feed (uses record timestamps). */
export const dateTime = (d) => {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const timeAgo = (d) => {
  if (!d) return "";
  const date = isDateOnlyString(d) ? parseDateOnly(d) : new Date(d);
  if (!date || Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return shortDate(d);
};
