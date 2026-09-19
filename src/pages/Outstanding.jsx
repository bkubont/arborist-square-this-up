import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import StatusBadge from "@/components/StatusBadge";
import { money } from "@/lib/format";
import { hasOutstandingBalance, jobBalance } from "@/lib/jobFilters";
import { NAV_ICONS } from "@/lib/navIcons";

const OutstandingIcon = NAV_ICONS.outstanding;

export default function Outstanding() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.entities.Job.list("-updated_date", 300).then((d) => {
      setJobs(d);
      setLoading(false);
    });
  }, []);

  const unpaid = useMemo(() => jobs.filter(hasOutstandingBalance), [jobs]);
  const total = useMemo(() => unpaid.reduce((sum, j) => sum + jobBalance(j), 0), [unpaid]);

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Outstanding</h1>
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading balances…" : `${money(total)} across ${unpaid.length} job${unpaid.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : unpaid.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <OutstandingIcon className="w-12 h-12 mx-auto mb-3 opacity-40" strokeWidth={1.5} />
          <p>No outstanding balances.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {unpaid.map((j) => {
            const balance = jobBalance(j);
            return (
              <Link
                key={j.id}
                to={`/jobs/${j.id}`}
                className="flex items-center gap-3 bg-card rounded-xl border border-border p-4 hover:border-brand transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground truncate">{j.title}</div>
                  <div className="text-sm text-muted-foreground truncate">{j.client_name || "—"}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-attention">{money(balance)}</div>
                  <div className="mt-1 flex justify-end">
                    <StatusBadge status={j.status} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
