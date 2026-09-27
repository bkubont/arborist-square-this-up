import { todayKey } from "./format.js";

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
  return todayKey();
}
