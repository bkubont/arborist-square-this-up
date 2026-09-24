import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  JOB_PHASE_ORDER,
  JOB_PHASES,
  defaultStatusForPhase,
  phaseForStatus,
  statusesForPhase,
} from "@/lib/jobStatus";
import { statusColors } from "@/lib/statusColors";

/**
 * Phase-first job status control: pick Lead / Working / Payment, then a status in that phase.
 */
export default function JobPhaseStatusSelect({
  phase,
  status,
  onChange,
  className = undefined,
  triggerClassName = undefined,
  /** Read-only row under the status dropdown (e.g. derived materials status). */
  belowStatus = undefined,
}) {
  const resolvedPhase = phase || phaseForStatus(status) || "lead";
  const resolvedStatus = statusesForPhase(resolvedPhase).includes(status)
    ? status
    : defaultStatusForPhase(resolvedPhase);

  const setPhase = (nextPhase) => {
    const nextStatus =
      nextPhase === resolvedPhase && statusesForPhase(nextPhase).includes(resolvedStatus)
        ? resolvedStatus
        : defaultStatusForPhase(nextPhase);
    onChange?.({ phase: nextPhase, status: nextStatus });
  };

  const setStatus = (nextStatus) => {
    onChange?.({ phase: resolvedPhase, status: nextStatus });
  };

  const current = statusColors(resolvedStatus);

  return (
    <div className={cn("space-y-2", className)}>
      <Tabs value={resolvedPhase} onValueChange={setPhase}>
        <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1 bg-muted/80 p-1">
          {JOB_PHASE_ORDER.map((p) => (
            <TabsTrigger key={p} value={p} className="text-xs sm:text-sm flex-1 min-w-[4.5rem]">
              {JOB_PHASES[p].label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Select value={resolvedStatus} onValueChange={setStatus}>
        <SelectTrigger
          className={cn(
            "border-2 font-medium w-full",
            current.border,
            current.badge,
            triggerClassName
          )}
        >
          <SelectValue>{resolvedStatus}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {statusesForPhase(resolvedPhase).map((s) => {
            const c = statusColors(s);
            return (
              <SelectItem key={s} value={s} className={cn("font-medium", c.select)}>
                <span className="inline-flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", c.swatch)} aria-hidden="true" />
                  {s}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {belowStatus}
    </div>
  );
}
