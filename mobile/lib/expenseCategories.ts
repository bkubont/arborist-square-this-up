export const EXPENSE_CATEGORIES = [
  'Materials',
  'Labor',
  'Equipment',
  'Travel',
  'Subcontractor',
  'Other',
] as const;

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
