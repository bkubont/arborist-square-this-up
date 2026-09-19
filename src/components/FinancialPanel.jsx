import React, { useMemo, useState } from "react";
import { DollarSign, TrendingUp, Wallet, Receipt } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { changeOrderNet, computeAuthorizedTotal } from "@/lib/documentMapping";

function Field({ label, value, onChange = undefined, placeholder, icon: Icon, readOnly = false }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 flex items-center gap-1 mb-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </label>
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value ? Number(e.target.value) : undefined)}
        placeholder={placeholder}
        className={`text-sm ${readOnly ? "bg-slate-50" : ""}`}
        readOnly={readOnly}
      />
    </div>
  );
}

/**
 * Job financials driven by Estimate / Invoice / Change Orders + payment timeline,
 * with deposit / materials still editable on the Job.
 */
export default function FinancialPanel({ job, documents = [], timeline = [], onUpdate, onLogPayment }) {
  const [draft, setDraft] = useState(/** @type {Record<string, number>} */ ({}));
  const [pay, setPay] = useState("");

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const save = () => {
    onUpdate({ ...draft });
    setDraft({});
  };

  const rollups = useMemo(() => {
    const estimates = documents.filter((d) => d.entity === "Estimate");
    const accepted =
      estimates.find((e) => e.status === "accepted") ||
      estimates.find((e) => e.accepted_snapshot);
    const estimateTotal =
      accepted?.accepted_snapshot?.total ??
      accepted?.total ??
      job.estimate_amount;

    const approvedCos = documents.filter((d) => d.entity === "ChangeOrder" && d.status === "approved");
    const baseline = Number(accepted?.accepted_snapshot?.total ?? accepted?.total) || 0;
    const authorized =
      accepted || approvedCos.length
        ? computeAuthorizedTotal(baseline, approvedCos)
        : undefined;
    const approvedNet = approvedCos.reduce((sum, co) => sum + changeOrderNet(co), 0);

    const invoices = documents.filter((d) => d.entity === "Invoice" && d.status !== "void");
    const invoiced = invoices.length
      ? invoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0)
      : job.invoice_amount || 0;

    const paymentsLogged = timeline
      .filter((e) => e.type === "payment_received" && e.amount != null)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const deposit = draft.deposit_amount ?? job.deposit_amount ?? 0;
    const paid = (Number(deposit) || 0) + paymentsLogged;
    const balance = Math.max(0, invoiced - paid);

    return {
      estimateTotal,
      authorized,
      approvedNet,
      invoiced,
      paymentsLogged,
      paid,
      balance,
      activeInvoiceCount: invoices.length,
      hasAcceptedEstimate: !!accepted,
    };
  }, [documents, timeline, job, draft.deposit_amount]);

  const materials = draft.materials_cost ?? job.materials_cost ?? 0;
  const profit = rollups.invoiced - (Number(materials) || 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 p-2">
          <div className="text-xs text-slate-500">Invoiced</div>
          <div className="text-sm font-bold text-slate-800">{money(rollups.invoiced)}</div>
        </div>
        <div className="rounded-lg bg-emerald-50 p-2">
          <div className="text-xs text-emerald-600">Paid</div>
          <div className="text-sm font-bold text-emerald-700">{money(rollups.paid)}</div>
        </div>
        <div className="rounded-lg bg-amber-50 p-2">
          <div className="text-xs text-amber-600">Balance</div>
          <div className="text-sm font-bold text-amber-700">{money(rollups.balance)}</div>
        </div>
      </div>

      {rollups.authorized != null && (
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600 flex justify-between gap-2">
          <span>Authorized (estimate + approved COs)</span>
          <span className="font-semibold text-slate-800 tabular-nums">{money(rollups.authorized)}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Estimate"
          value={draft.estimate_amount ?? rollups.estimateTotal}
          onChange={(v) => set("estimate_amount", v)}
          placeholder="0"
          icon={Receipt}
        />
        <Field
          label="Invoice rollup"
          value={rollups.invoiced}
          readOnly
          placeholder="0"
          icon={DollarSign}
        />
        <Field
          label="Deposit"
          value={draft.deposit_amount ?? job.deposit_amount}
          onChange={(v) => set("deposit_amount", v)}
          placeholder="0"
          icon={Wallet}
        />
        <Field
          label="Materials"
          value={draft.materials_cost ?? job.materials_cost}
          onChange={(v) => set("materials_cost", v)}
          placeholder="0"
          icon={TrendingUp}
        />
      </div>

      <div className="text-xs text-slate-500 space-y-0.5">
        {rollups.activeInvoiceCount > 0 && (
          <div>
            From {rollups.activeInvoiceCount} active invoice{rollups.activeInvoiceCount === 1 ? "" : "s"}
            {rollups.paymentsLogged > 0 ? ` · ${money(rollups.paymentsLogged)} logged payments` : ""}
          </div>
        )}
        {rollups.approvedNet !== 0 && (
          <div>Approved CO net {money(rollups.approvedNet)}</div>
        )}
        <div>Est. profit (invoiced − materials) {money(profit)}</div>
      </div>

      <Button size="sm" className="w-full bg-slate-900 hover:bg-slate-800" onClick={save}>
        Save amounts
      </Button>

      <div className="pt-2 border-t border-slate-100">
        <label className="text-xs font-medium text-slate-500 mb-1 block">Log a payment received</label>
        <div className="flex gap-2">
          <Input
            type="number"
            value={pay}
            onChange={(e) => setPay(e.target.value)}
            placeholder="Amount"
            className="text-sm"
          />
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500"
            onClick={() => {
              if (pay) onLogPayment(Number(pay));
              setPay("");
            }}
          >
            Log
          </Button>
        </div>
      </div>
    </div>
  );
}
