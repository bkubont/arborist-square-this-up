/** Common expense categories for Quick Add / Expenses list. Free text still allowed. */
export const EXPENSE_CATEGORIES = [
  "Materials",
  "Fuel",
  "Tools",
  "Subcontractor",
  "Travel",
  "Office",
  "Other",
];

export function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
