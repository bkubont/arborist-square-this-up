export { collectJobMaterialItems, deriveMaterialsStatus } from "../../shared/jobMaterials.js";

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
