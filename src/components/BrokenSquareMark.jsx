import React from "react";
import { cn } from "@/lib/utils";

/**
 * Broken-square motif — logo geometry as a small UI cue (not the full mark).
 * Open corner = unfinished; closed = squared up. Use sparingly in chrome / empty / progress.
 *
 * @param {{
 *   state?: "open" | "closed",
 *   size?: number,
 *   className?: string,
 *   tone?: "brand" | "muted" | "gold",
 *   "aria-hidden"?: boolean | "true" | "false",
 *   title?: string,
 * }} props
 */
export default function BrokenSquareMark({
  state = "open",
  size = 16,
  className,
  tone = "brand",
  title,
  ...rest
}) {
  const stroke =
    tone === "gold" ? "hsl(var(--attention))" : tone === "muted" ? "currentColor" : "hsl(var(--brand))";
  const closed = state === "closed";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {/* Outer square — gap at top-right when open */}
      <path
        d={
          closed
            ? "M5 5h14v14H5z"
            : "M5 5h10M5 5v14h14V11"
        }
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      {/* Closing corner accent — gold only when closed (rare emphasis) */}
      {closed ? (
        <path
          d="M15 5h4v4"
          stroke="hsl(var(--attention))"
          strokeWidth={2}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      ) : (
        <path
          d="M17 5h2v2"
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="square"
          opacity={0.45}
        />
      )}
    </svg>
  );
}

/**
 * Compact empty-state block using the broken-square motif.
 * @param {{
 *   title?: React.ReactNode,
 *   children?: React.ReactNode,
 *   state?: "open" | "closed",
 *   className?: string,
 *   action?: React.ReactNode,
 * }} props
 */
export function BrokenSquareEmpty({
  title,
  children,
  state = "open",
  className = "",
  action = null,
}) {
  return (
    <div
      className={cn(
        "text-center py-12 px-4 text-muted-foreground border border-dashed border-border rounded-xl",
        className
      )}
    >
      <BrokenSquareMark state={/** @type {"open" | "closed"} */ (state)} size={36} tone="muted" className="mx-auto mb-3 opacity-50" />
      {title ? <p className="font-medium text-foreground mb-1">{title}</p> : null}
      {children ? <div className="text-sm max-w-sm mx-auto">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
