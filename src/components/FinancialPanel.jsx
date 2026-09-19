import React, { useState } from "react";
import { DollarSign, TrendingUp, Wallet, Receipt } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";

function Field({ label, value, onChange, placeholder, icon: Icon }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 flex items-center gap-1 mb-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </label>
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        placeholder={placeholder}
        className="text-sm"
      />
    </div>
  );
}

export default function FinancialPanel({ job, onUpdate, onLogPayment }) {
  const [draft, setDraft] = useState(/** @type {Record<string, number>} */ ({}));
  const [pay, setPay] = useState("");

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const save = () => {
    onUpdate({ ...draft });
    setDraft({});
  };

  const invoice = job.invoice_amount || 0;
  const paid = (job.deposit_amount || 0) + (job.payments_total || 0);
  const balance = invoice - paid;
  const profit = invoice - (job.materials_cost || 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 p-2">
          <div className="text-xs text-slate-500">Invoiced</div>
          <div className="text-sm font-bold text-slate-800">{money(invoice)}</div>
        </div>
        <div className="rounded-lg bg-emerald-50 p-2">
          <div className="text-xs text-emerald-600">Paid</div>
          <div className="text-sm font-bold text-emerald-700">{money(paid)}</div>
        </div>
        <div className="rounded-lg bg-amber-50 p-2">
          <div className="text-xs text-amber-600">Balance</div>
          <div className="text-sm font-bold text-amber-700">{money(Math.max(0, balance))}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Estimate" value={draft.estimate_amount ?? job.estimate_amount} onChange={(v) => set("estimate_amount", v)} placeholder="0" icon={Receipt} />
        <Field label="Invoice" value={draft.invoice_amount ?? job.invoice_amount} onChange={(v) => set("invoice_amount", v)} placeholder="0" icon={DollarSign} />
        <Field label="Deposit" value={draft.deposit_amount ?? job.deposit_amount} onChange={(v) => set("deposit_amount", v)} placeholder="0" icon={Wallet} />
        <Field label="Materials" value={draft.materials_cost ?? job.materials_cost} onChange={(v) => set("materials_cost", v)} placeholder="0" icon={TrendingUp} />
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