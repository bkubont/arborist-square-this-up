import React from "react";
import { Link } from "react-router-dom";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Three labeled money scopes. Each figure links to the records that make it up.
 * @param {{ groups: import("@/lib/jobFilters").moneyGroups extends (...args: any) => infer R ? R : any, loading?: boolean, activeGroup?: string }} props
 */
export default function MoneyGroups({ groups, loading = false, activeGroup = "" }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <GroupCard
        active={activeGroup === "issued"}
        title={groups.issued.label}
        scope={groups.issued.scope}
        figures={[
          { label: "Billed", value: groups.issued.billed, to: "/jobs/outstanding?group=issued" },
          { label: "Applied", value: groups.issued.applied, to: "/jobs/outstanding?group=issued" },
          { label: "Remaining", value: groups.issued.remaining, to: "/jobs/outstanding?group=issued", attention: true },
        ]}
        loading={loading}
      />
      <GroupCard
        active={activeGroup === "deposits"}
        title={groups.deposits.label}
        scope={groups.deposits.scope}
        figures={[
          { label: "Deposits", value: groups.deposits.total, to: "/jobs/outstanding?group=deposits" },
        ]}
        loading={loading}
      />
      <GroupCard
        active={activeGroup === "unbilled"}
        title={groups.unbilled.label}
        scope={groups.unbilled.scope}
        figures={[
          { label: "Quoted", value: groups.unbilled.total, to: "/jobs/outstanding?group=unbilled" },
        ]}
        loading={loading}
      />
    </div>
  );
}

function GroupCard({ title, scope, figures, loading, active }) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3.5",
        active ? "border-primary ring-1 ring-primary/30" : "border-border"
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground">{title}</div>
      <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{scope}</p>
      <div className={cn("mt-2 grid gap-2", figures.length > 1 ? "grid-cols-3" : "grid-cols-1")}>
        {figures.map((figure) => (
          <Link
            key={figure.label}
            to={figure.to}
            className="rounded-lg px-1 py-1 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{figure.label}</div>
            <div
              className={cn(
                "text-base font-bold tabular-nums",
                figure.attention ? "text-foreground" : "text-foreground"
              )}
            >
              {loading ? "…" : money(figure.value)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
