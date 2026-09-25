/** Dollar amount from a number (mirrors src/lib/format.js money). */
export function money(n: number | string | null | undefined): string {
  const value = Number(n) || 0;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Integer cents → display dollars. */
export function moneyCents(cents: number | null | undefined): string {
  return money((Number(cents) || 0) / 100);
}

export function shortDate(d: string | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d.includes('T') ? d : `${d}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export { ACTIVE_JOB_STATUSES } from '@/lib/jobStatus';
