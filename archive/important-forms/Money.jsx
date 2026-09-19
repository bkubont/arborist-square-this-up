import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, DollarSign, Package } from "lucide-react";
import { api } from "@/api/client";
import { money } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";

export default function Money() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.entities.Job.list("-updated_date", 200).then(setJobs).finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => jobs.reduce((totals, job) => {
    const invoice = Number(job.invoice_amount || 0);
    const paid = Number(job.deposit_amount || 0);
    totals.revenue += invoice;
    totals.paid += paid;
    totals.outstanding += Math.max(0, invoice - paid);
    totals.materials += Number(job.materials_cost || 0);
    return totals;
  }, { revenue: 0, paid: 0, outstanding: 0, materials: 0 }), [jobs]);

  const unpaid = jobs.filter((job) => Number(job.invoice_amount || 0) > Number(job.deposit_amount || 0));

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Money</h1>
        <p className="text-sm text-slate-500">Revenue, materials, and what is still outstanding</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Revenue" value={money(summary.revenue)} icon={DollarSign} tint="bg-emerald-50 text-emerald-600" />
        <Stat label="Received" value={money(summary.paid)} icon={CheckCircle2} tint="bg-blue-50 text-blue-600" />
        <Stat label="Outstanding" value={money(summary.outstanding)} icon={AlertCircle} tint="bg-amber-50 text-amber-600" />
        <Stat label="Materials" value={money(summary.materials)} icon={Package} tint="bg-slate-100 text-slate-600" />
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Needs payment</h2>
          <span className="text-xs text-slate-400">{unpaid.length} jobs</span>
        </div>
        {loading ? <div className="text-sm text-slate-400 py-6">Loading...</div> : unpaid.length ? (
          <div className="divide-y divide-slate-100">
            {unpaid.map((job) => {
              const balance = Math.max(0, Number(job.invoice_amount || 0) - Number(job.deposit_amount || 0));
              return <Link key={job.id} to={`/jobs/${job.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50">
                <div className="min-w-0"><div className="font-semibold text-slate-800 truncate">{job.title}</div><div className="text-xs text-slate-400">{job.client_name || "No client"}</div></div>
                <div className="flex items-center gap-3 shrink-0"><StatusBadge status={job.status} /><span className="font-semibold text-amber-600">{money(balance)}</span></div>
              </Link>;
            })}
          </div>
        ) : <div className="text-sm text-slate-400 py-6">No outstanding job balances.</div>}
      </section>
    </div>
  );
}

function Stat({ label, value, icon: Icon, tint }) {
  return <div className="bg-white rounded-xl border border-slate-200 p-4"><div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${tint}`}><Icon className="w-4 h-4" /></div><div className="text-xs text-slate-500">{label}</div><div className="text-lg font-bold text-slate-900">{value}</div></div>;
}
