import { todayKey } from "./format.js";

/** Common expense categories for Quick Add / Expenses list. Free text still allowed. */
export const EXPENSE_CATEGORIES = [
  "Fuel",
  "Disposal / chip dump",
  "Crane rental",
  "Equipment rental",
  "Chemicals / PHC",
  "Supplies",
  "Travel",
  "Office",
  "Other",
];

export function todayIso() {
  return todayKey();
}
