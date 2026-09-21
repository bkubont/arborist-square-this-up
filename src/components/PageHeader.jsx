import React from "react";
import { cn } from "@/lib/utils";

/**
 * Universal page header: page name + optional description/count + one primary action slot.
 * Secondary actions/filters go in `secondary`.
 * @param {{ title: React.ReactNode, description?: React.ReactNode, primaryAction?: React.ReactNode, secondary?: React.ReactNode, className?: string }} props
 */
export default function PageHeader({ title, description = null, primaryAction = null, secondary = null, className = "" }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground mt-0.5">{description}</p> : null}
      </div>
      {(primaryAction || secondary) && (
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {secondary}
          {primaryAction}
        </div>
      )}
    </div>
  );
}
