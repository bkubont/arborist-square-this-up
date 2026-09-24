import React from "react";
import { deriveMaterialsStatus, materialsStatusClass } from "@/lib/jobMaterials";
import { cn } from "@/lib/utils";

/**
 * Read-only materials status derived from the job materials list — not a second dropdown.
 */
export default function MaterialsStatusLine({ job, workItems = [], materialOrders = [], className }) {
  const status = deriveMaterialsStatus({ job, workItems, materialOrders });
  return (
    <div className={cn("text-xs", className)}>
      <span className="text-muted-foreground">Materials · </span>
      <span className={cn(materialsStatusClass(status.key))}>{status.label}</span>
    </div>
  );
}
