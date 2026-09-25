/** Calendar helpers for Schedule (mirrors src/pages/Schedule.jsx). */

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDay(key: string): Date {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function startOfWeek(fromDate: Date): Date {
  const date = new Date(fromDate);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

export function addDays(date: Date, n: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + n);
  return next;
}

export function isArchivedJob(job: { status?: string; archived_at?: string } | null | undefined): boolean {
  if (job?.status === 'Completed') return false;
  if (job?.archived_at) return true;
  return job?.status === 'Paid' || job?.status === 'Declined' || job?.status === 'Cancelled';
}
