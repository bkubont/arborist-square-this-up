import React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Form label with a red/brand asterisk for required fields.
 * Do not put the words "optional" or "required" in the visible label text.
 * @param {{ htmlFor?: string, required?: boolean, className?: string, children?: import('react').ReactNode } & Record<string, unknown>} props
 */
export default function FieldLabel({ htmlFor, required = false, className, children, ...props }) {
  return (
    <Label htmlFor={htmlFor} className={cn(className)} {...props}>
      {children}
      {required ? (
        <>
          <span className="text-destructive ml-0.5 font-semibold" aria-hidden="true">*</span>
          <span className="sr-only"> required</span>
        </>
      ) : null}
    </Label>
  );
}
