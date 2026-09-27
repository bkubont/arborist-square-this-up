import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MaterialsStatusLine from "@/components/MaterialsStatusLine";
import { JOB_PHASES, headerTracks } from "@/lib/jobStatus";
import { statusColors } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

function TrackSelect({ label, value, statuses, onChange }) {
  const current = value ? statusColors(value) : null;
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <Select value={value || "__none__"} onValueChange={(next) => { if (next !== "__none__") onChange?.(next); }}>
        <SelectTrigger
          className={cn(
            "border-2 font-medium w-full",
            current ? cn(current.border, current.badge) : "border-border",
          )}
          aria-label={label}
        >
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {!value && <SelectItem value="__none__">—</SelectItem>}
          {statuses.map((status) => {
            const colors = statusColors(status);
            return (
              <SelectItem key={status} value={status} className={cn("font-medium", colors.select)}>
                <span className="inline-flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", colors.swatch)} aria-hidden="true" />
                  {status}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Job header info box: Working, derived Materials, Payment.
 * Changing one does not clear the others. Lead lives on the customer profile.
 */
export default function JobHeaderStatuses({
  job,
  client,
  workItems = [],
  materialOrders = [],
  onChange,
  className = "",
}) {
  const tracks = headerTracks(job, client);
  return (
    <div className={cn("space-y-2 w-full sm:w-72", className)}>
      <TrackSelect
        label="Working"
        value={tracks.working}
        statuses={JOB_PHASES.working.statuses}
        onChange={(status) => onChange?.({ track: "working", status })}
      />
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Materials</div>
        <div className="min-h-9 flex items-center rounded-md border border-border bg-muted/40 px-3 py-2">
          <MaterialsStatusLine
            job={job}
            workItems={workItems}
            materialOrders={materialOrders}
            hideLabel
          />
        </div>
      </div>
      <TrackSelect
        label="Payment"
        value={tracks.payment}
        statuses={JOB_PHASES.payment.statuses}
        onChange={(status) => onChange?.({ track: "payment", status })}
      />
    </div>
  );
}
