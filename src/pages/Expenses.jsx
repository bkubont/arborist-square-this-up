import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Wallet } from "lucide-react";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import ExpenseFormDialog from "@/components/ExpenseFormDialog";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { money, shortDate } from "@/lib/format";
import { NAV_ICONS } from "@/lib/navIcons";

const ExpensesIcon = NAV_ICONS.expenses;

/**
 * Expenses — job-linked and unassigned spend with optional receipt photos.
 */
export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    const [e, j] = await Promise.all([
      api.entities.Expense.list("-created_date", 400),
      api.entities.Job.list("-updated_date", 300),
    ]);
    setExpenses(e);
    setJobs(j);
  }, []);

  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [load]);

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);
  const total = useMemo(
    () => expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [expenses]
  );
  const unassigned = useMemo(() => expenses.filter((e) => !e.job_id).length, [expenses]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (expense) => {
    setEditing(expense);
    setDialogOpen(true);
  };

  const remove = async (expense) => {
    if (!confirm("Delete this expense?")) return;
    await api.entities.Expense.delete(expense.id);
    await load();
  };

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Expenses"
        description={
          loading
            ? "Track spend by category and job"
            : `${expenses.length} expense${expenses.length === 1 ? "" : "s"} · ${money(total)}${unassigned ? ` · ${unassigned} unassigned` : ""}`
        }
        primaryAction={
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> Add Expense
          </Button>
        }
        secondary={
          <Link to="/receipts" className="text-sm font-medium text-primary hover:underline px-2">
            Receipts
          </Link>
        }
      />

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : expenses.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
          <ExpensesIcon className="w-12 h-12 mx-auto mb-3 opacity-40" strokeWidth={1.5} />
          <p className="font-medium text-foreground mb-1">No expenses yet</p>
          <p className="text-sm max-w-sm mx-auto mb-4">
            Log materials, fuel, and other job costs. Link to a job when you know it — or leave unassigned.
          </p>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> Add Expense
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map((expense) => {
            const job = expense.job_id ? jobById[expense.job_id] : null;
            return (
              <div
                key={expense.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors"
              >
                {expense.photo_url ? (
                  <Image src={expense.photo_url} alt="" className="w-14 h-14 rounded-md object-cover border border-border shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-md border border-dashed border-border flex items-center justify-center shrink-0 text-muted-foreground">
                    <Wallet className="w-5 h-5 opacity-50" />
                  </div>
                )}
                <button type="button" className="flex-1 min-w-0 text-left" onClick={() => openEdit(expense)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground truncate">
                        {expense.category || "Expense"}
                        {expense.vendor ? <span className="font-normal text-muted-foreground"> · {expense.vendor}</span> : null}
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {shortDate(expense.date || expense.created_date)}
                        {job ? (
                          <>
                            {" · "}
                            <Link
                              to={`/jobs/${job.id}`}
                              className="text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {job.title}
                            </Link>
                          </>
                        ) : (
                          <span className="text-attention"> · Unassigned</span>
                        )}
                      </div>
                      {expense.note ? <div className="text-xs text-muted-foreground mt-1 truncate">{expense.note}</div> : null}
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-foreground shrink-0">{money(expense.amount)}</div>
                  </div>
                </button>
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground shrink-0" onClick={() => remove(expense)}>
                  Delete
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <ExpenseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        jobs={jobs}
        expense={editing}
        onSaved={() => load()}
      />
    </div>
  );
}
