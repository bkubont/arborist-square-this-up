import React, { useMemo, useState } from "react";
import { DollarSign, TrendingUp, Wallet, Receipt } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { changeOrderNet, computeAuthorizedTotal } from "@/lib/documentMapping";

function Field({ label, value, placeholder, icon: Icon }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 flex items-center gap-1 mb-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </label>
      <Input
        type="number"
        value={value ?? ""}
        placeholder={placeholder}
        className="text-sm bg-slate-50"
        readOnly
        tabIndex={-1}
      />
    </div>
  );
}

/**
 * Job financials are derived rollups — not free-edited on the job.
 * Sources: accepted estimate, invoices, material orders, deposit/payment timeline entries.
 * Record money via Log payment (and Deposit quick action with an amount).
 */
export default function FinancialPanel({ job, documents = [], timeline = [], onLogPayment }) {
  const [pay, setPay] = useState("");

  const rollups = useMemo(() => {
    const estimates = documents.filter((d) => d.entity === "Estimate" && d.status !== "void");
    const accepted =
      estimates.find((e) => e.status === "accepted") ||
      estimates.find((e) => e.accepted_snapshot);
    const hadEstimates = documents.some((d) => d.entity === "Estimate");
    const estimateTotal =
      accepted?.accepted_snapshot?.total ??
      accepted?.total ??
      (hadEstimates ? 0 : job.estimate_amount);

    const approvedCos = documents.filter((d) => d.entity === "ChangeOrder" && d.status === "approved");
    const baseline = Number(accepted?.accepted_snapshot?.total ?? accepted?.total) || 0;
    const authorized =
      accepted || approvedCos.length
        ? computeAuthorizedTotal(baseline, approvedCos)
        : undefined;
    const approvedNet = approvedCos.reduce((sum, co) => sum + changeOrderNet(co), 0);

    const invoices = documents.filter((d) => d.entity === "Invoice" && d.status !== "void");
    const hadInvoices = documents.some((d) => d.entity === "Invoice");
    const invoiced = hadInvoices
      ? invoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0)
      : (job.invoice_amount || 0);

    const materialOrders = documents.filter((d) => d.entity === "MaterialOrder" && d.status !== "void");
    const materialsFromDocs = materialOrders.reduce((sum, mo) => sum + (Number(mo.total) || 0), 0);
    const hadMaterialOrders = documents.some((d) => d.entity === "MaterialOrder");
    const materials = hadMaterialOrders ? materialsFromDocs : (job.materials_cost || 0);

    const activeInvoice = invoices.find((inv) => inv.status !== "void") || null;
    const paymentsLogged = timeline
      .filter((e) => e.type === "payment_received" && e.amount != null)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const depositsLogged = timeline
      .filter((e) => e.type === "deposit_received" && e.amount != null)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    // Legacy job.deposit_amount + timeline deposits (never discard legacy when logging more).
    const deposit = (Number(job.deposit_amount) || 0) + depositsLogged;
    const paid = activeInvoice
      ? (Number(activeInvoice.deposits_applied) || 0) + (Number(activeInvoice.payments_applied) || 0)
      : deposit + paymentsLogged;
    const balance = activeInvoice?.balance_due != null
      ? Math.max(0, Number(activeInvoice.balance_due))
      : Math.max(0, invoiced - paid);

    return {
      estimateTotal,
      authorized,
      approvedNet,
      invoiced,
      materials,
      depositsLogged,
      paymentsLogged,
      deposit,
      paid,
      balance,
      activeInvoiceCount: invoices.length,
      materialOrderCount: materialOrders.length,
      hasAcceptedEstimate: !!accepted,
    };
  }, [documents, timeline, job]);

  const profit = rollups.invoiced - (Number(rollups.materials) || 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-secondary p-2">
          <div className="text-xs text-muted-foreground">Invoiced</div>
          <div className="text-sm font-bold text-foreground">{money(rollups.invoiced)}</div>
        </div>
        <div className="rounded-lg bg-emerald-50 p-2">
          <div className="text-xs text-emerald-600">Paid</div>
          <div className="text-sm font-bold text-emerald-700">{money(rollups.paid)}</div>
        </div>
        <div className="rounded-lg bg-attention-muted p-2">
          <div className="text-xs text-attention-muted-foreground">Balance</div>
          <div className="text-sm font-bold text-attention">{money(rollups.balance)}</div>
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
          value={rollups.estimateTotal}
          placeholder="0"
          icon={Receipt}
        />
        <Field
          label="Invoice rollup"
          value={rollups.invoiced}
          placeholder="0"
          icon={DollarSign}
        />
        <Field
          label="Deposit"
          value={rollups.deposit}
          placeholder="0"
          icon={Wallet}
        />
        <Field
          label="Materials"
          value={rollups.materials}
          placeholder="0"
          icon={TrendingUp}
        />
      </div>

      <div className="text-xs text-slate-500 space-y-0.5">
        <div>Amounts come from documents and logged payments — not edited here.</div>
        {rollups.activeInvoiceCount > 0 && (
          <div>
            From {rollups.activeInvoiceCount} active invoice{rollups.activeInvoiceCount === 1 ? "" : "s"}
            {rollups.paymentsLogged > 0 ? ` · ${money(rollups.paymentsLogged)} logged payments` : ""}
            {rollups.depositsLogged > 0 ? ` · ${money(rollups.depositsLogged)} deposits` : ""}
          </div>
        )}
        {rollups.materialOrderCount > 0 && (
          <div>Materials from {rollups.materialOrderCount} material order{rollups.materialOrderCount === 1 ? "" : "s"}</div>
        )}
        {rollups.approvedNet !== 0 && (
          <div>Approved CO net {money(rollups.approvedNet)}</div>
        )}
        <div>Est. profit (invoiced − materials) {money(profit)}</div>
      </div>

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
