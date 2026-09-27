import { materialRowForStorage } from "./materialStatus.js";

export {
  collectJobMaterialItems,
  deriveMaterialsStatus,
  jobHasOpenMaterials,
  materialLineOpen,
  materialsForTask,
  taskHasOpenMaterials,
} from "../../shared/jobMaterials.js";

/** Persist job buy-list rows. Blank descriptions are dropped. `task_id` tags a line to a task. */
export function serializeMaterialRows(rows = []) {
  const num = (v) => (v === "" || v == null ? undefined : Number(v));
  return rows
    .filter((m) => String(m?.description || "").trim())
    .map((m) => materialRowForStorage({
      ...m,
      description: String(m.description).trim(),
      qty: num(m.qty),
      unit: m.unit || undefined,
      unit_price: num(m.unit_price),
      notes: m.notes?.trim() || undefined,
      task_id: m.task_id || undefined,
    }));
}

/** Tailwind classes for derived materials status (read-only — not a job status dropdown). */
export function materialsStatusClass(key) {
  switch (key) {
    case "on_hand":
      return "text-emerald-700";
    case "ordered":
    case "pricing":
      return "text-attention-materials-foreground";
    case "needed":
    case "backorder":
    case "unavailable":
    case "waiting":
      return "text-attention-materials-foreground font-medium";
    default:
      return "text-muted-foreground";
  }
}
