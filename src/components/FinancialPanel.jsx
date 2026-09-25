import React, { useMemo, useState } from "react";
import { moneyBlockForPhase, overviewFigures } from "../../shared/overviewMoney.js";
import ExpenseFormDialog from "@/components/ExpenseFormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, shortDate } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import { cn } from "@/lib/utils";

const TONE = {
  quote: "bg-secondary text-foreground",
  bill: "bg-secondary text-foreground",
  deposit: "bg-secondary text-foreground",
  collected: "bg-emerald-50 text-emerald-800",
  remaining: "bg-attention-muted text-attention",
};

function MoneyFigure({ label, value, tone }) {
  return (
    <div className={cn("rounded-lg px-3 py-3 text-center", TONE[tone] || TONE.quote)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{money(value)}</div>
    </div>
  );
}

function JobCostList({ job, expenses, onChanged }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const spent = expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  const jobs = [{ id: job.id, title: job.title }];

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (expense) => {
    setEditing(expense);
    setOpen(true);
  };

  return (
    <div className="pt-3 border-t border-border">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs font-medium text-muted-foreground">Job cost</div>
        <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={openNew}>
          Add
        </button>
      </div>
      {expenses.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing spent yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {expenses.map((expense) => (
            <li key={expense.id}>
              <button
                type="button"
                className="w-full flex items-baseline justify-between gap-3 text-left text-sm text-muted-foreground hover:text-foreground"
                onClick={() => openEdit(expense)}
              >
                <span className="min-w-0 truncate">
                  {expense.category || "Expense"}
                  {expense.vendor ? ` · ${expense.vendor}` : ""}
                  <span className="text-xs"> · {shortDate(expense.date || expense.created_date)}</span>
                </span>
                <span className="shrink-0 tabular-nums text-foreground">{money(expense.amount)}</span>
              </button>
              {expense.note ? (
                <p className="text-xs text-muted-foreground truncate pl-0.5">{expense.note}</p>
              ) : null}
            </li>
          ))}
          <li className="flex justify-between text-xs text-muted-foreground pt-1">
            <span>Spent</span>
            <span className="tabular-nums">{money(spent)}</span>
          </li>
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground mt-2">Receipts stay in Photos.</p>
      <ExpenseFormDialog
        open={open}
        onOpenChange={setOpen}
        jobs={jobs}
        expense={editing}
        defaultJobId={job.id}
        onSaved={onChanged}
      />
    </div>
  );
}

/**
 * Phase-aware Overview money. Quote / Collected / Remaining — not an invoice ledger.
 * Lead: quote only. Working: quote, any deposit, job cost. Payment: bill, collected, remaining.
 */
export default function FinancialPanel({
  job,
  documents = [],
  timeline = [],
  expenses = [],
  onLogPayment,
  onExpensesChanged,
}) {
  const [pay, setPay] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const figures = useMemo(
    () => overviewFigures({ job, documents, timeline }),
    [job, documents, timeline],
  );
  const block = useMemo(
    () => moneyBlockForPhase(job?.phase, figures),
    [job?.phase, figures],
  );
  const sortedExpenses = useMemo(
    () => [...expenses].sort((a, b) => String(b.date || b.created_date || "").localeCompare(String(a.date || a.created_date || ""))),
    [expenses],
  );

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <div
        className={cn(
          "grid gap-2",
          block.slots.length >= 3 ? "grid-cols-3" : block.slots.length === 2 ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {block.slots.map((slot) => (
          <MoneyFigure key={slot.key} label={slot.label} value={slot.value} tone={slot.key} />
        ))}
      </div>

      {block.logPayment && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block" htmlFor="overview-payment">
            Add a payment
          </label>
          <div className="flex gap-2">
            <Input
              id="overview-payment"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={pay}
              onChange={(e) => setPay(e.target.value)}
              placeholder="Amount"
              className="text-sm"
            />
            <Select value={payMethod} onValueChange={setPayMethod}>
              <SelectTrigger className="w-32 text-sm" aria-label="Type of payment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500"
              onClick={() => {
                const amount = Number(pay);
                if (!Number.isFinite(amount) || amount <= 0) return;
                onLogPayment?.(amount, payMethod);
                setPay("");
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {block.jobCost && (
        <JobCostList job={job} expenses={sortedExpenses} onChanged={onExpensesChanged} />
      )}
    </div>
  );
}
