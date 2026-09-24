import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CheckSquare, DollarSign, Phone, Plus, Receipt, StickyNote, Wallet } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ExpenseFormDialog from "@/components/ExpenseFormDialog";
import ReceiptCaptureDialog from "@/components/ReceiptCaptureDialog";
import { toast } from "@/components/ui/use-toast";
import { moneyCents } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * What every job card shows beyond its title: the customer's name and phone, the job's running
 * total, and a quick add for that job. Job cards are links, so everything interactive in here
 * stops the click from also opening the job.
 */

/** Clients (for phone numbers) and per-job money summaries, loaded once per list page. */
export function useJobCardData() {
  const [clientsById, setClientsById] = useState(/** @type {Record<string, any>} */ ({}));
  const [summaries, setSummaries] = useState(/** @type {Record<string, any>} */ ({}));

  const reload = useCallback(async () => {
    const [clients, all] = await Promise.all([
      api.entities.Client.list("-created_date", 1000).catch(() => []),
      api.summaries.all().catch(() => ({ jobs: {} })),
    ]);
    setClientsById(Object.fromEntries(clients.map((c) => [c.id, c])));
    setSummaries(all.jobs || {});
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { clientsById, summaries, reload };
}

const JobCardDataContext = createContext(/** @type {null | ReturnType<typeof useJobCardData>} */ (null));

/**
 * Loads clients and summaries once for every job card below it, so nested cards (e.g. Schedule's
 * day/week/agenda views) need no props. Cards outside a provider can pass client/summary directly.
 */
export function JobCardDataProvider({ children }) {
  const data = useJobCardData();
  return <JobCardDataContext.Provider value={data}>{children}</JobCardDataContext.Provider>;
}

/** Swallow a click so the surrounding job card link doesn't also navigate. */
const insideCard = (e) => {
  e.preventDefault();
  e.stopPropagation();
};

/** Customer name + tap-to-call phone. */
export function JobCustomer({ job, client = undefined, className = undefined }) {
  const ctx = useContext(JobCardDataContext);
  client = client ?? ctx?.clientsById[job.client_id];
  const name = client?.name || job.client_name || "—";
  const phone = client?.phone;
  return (
    <div className={cn("text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 min-w-0", className)}>
      <span className="truncate">{name}</span>
      {phone && (
        <span
          role="link"
          tabIndex={0}
          title={`Call ${phone}`}
          onClick={(e) => { insideCard(e); window.location.href = `tel:${phone.replace(/[^\d+]/g, "")}`; }}
          onKeyDown={(e) => { if (e.key === "Enter") { insideCard(e); window.location.href = `tel:${phone.replace(/[^\d+]/g, "")}`; } }}
          className="inline-flex items-center gap-1 text-primary hover:underline whitespace-nowrap cursor-pointer"
        >
          <Phone className="w-3 h-3" aria-hidden="true" />
          {phone}
        </span>
      )}
    </div>
  );
}

/** The job's running total: signed estimate + approved change orders, or the unsigned estimate ("est."). */
export function JobRunningTotal({ job = undefined, summary = undefined, className = undefined }) {
  const ctx = useContext(JobCardDataContext);
  summary = summary ?? (job ? ctx?.summaries[job.id] : undefined);
  if (!summary || summary.running_total_basis === "none") return null;
  const estimate = summary.running_total_basis === "estimate";
  return (
    <div
      className={cn("text-sm font-semibold tabular-nums text-foreground whitespace-nowrap", className)}
      title={estimate ? "Estimate total — not signed yet" : "Signed estimate + approved change orders"}
    >
      {moneyCents(summary.running_total_cents)}
      {estimate && <span className="ml-1 text-[10px] font-medium uppercase text-muted-foreground">est.</span>}
    </div>
  );
}

/**
 * Quick add for one job: task, note, expense, receipt or payment, without opening the job.
 * @param {{ job: any, onSaved?: () => void, className?: string }} props
 */
export function JobQuickAdd({ job, onSaved = undefined, className = undefined }) {
  const ctx = useContext(JobCardDataContext);
  const [mode, setMode] = useState(/** @type {null | "task" | "note" | "payment"} */ (null));
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const open = (next) => {
    setText("");
    setMode(next);
  };

  const done = (title) => {
    toast({ title, description: job.title });
    ctx?.reload();
    onSaved?.();
  };

  const save = async () => {
    const value = text.trim();
    if (!value) return;
    setSaving(true);
    try {
      if (mode === "task") {
        await api.entities.WorkItem.create({ job_id: job.id, description: value });
        done("Task added");
      } else if (mode === "note") {
        await api.entities.TimelineEntry.create({ job_id: job.id, type: "note", text: value, category: "note" });
        done("Note saved");
      } else if (mode === "payment") {
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount <= 0) {
          alert("Enter a positive payment amount.");
          return;
        }
        // Same record the job page's "Log a payment received" writes, so balances agree everywhere.
        await api.entities.TimelineEntry.create({ job_id: job.id, type: "payment_received", text: "Payment received", category: "financial", amount });
        done("Payment recorded");
      }
      setMode(null);
    } catch (e) {
      alert(e?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const titles = { task: "Add task", note: "Add note", payment: "Record payment" };

  return (
    // React events bubble through portals, so this stops clicks in the menu and dialogs from
    // reaching the job card link as well.
    <span className={cn("inline-flex", className)} onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={`Quick add to ${job.title}`}
            title="Quick add"
            onClick={(e) => e.preventDefault()}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="truncate">Add to {job.title}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => open("task")}><CheckSquare className="w-4 h-4" /> Task</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open("note")}><StickyNote className="w-4 h-4" /> Note</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setExpenseOpen(true)}><Wallet className="w-4 h-4" /> Expense</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setReceiptOpen(true)}><Receipt className="w-4 h-4" /> Receipt</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open("payment")}><DollarSign className="w-4 h-4" /> Payment</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!mode} onOpenChange={(next) => { if (!next) setMode(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{mode ? titles[mode] : ""}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2 truncate">{job.title}</p>
          {mode === "note" ? (
            <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Note" />
          ) : (
            <div>
              <Label>{mode === "payment" ? "Amount received" : "Task"}</Label>
              <Input
                autoFocus
                type={mode === "payment" ? "number" : "text"}
                inputMode={mode === "payment" ? "decimal" : undefined}
                min={mode === "payment" ? "0" : undefined}
                step={mode === "payment" ? "0.01" : undefined}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder={mode === "payment" ? "0.00" : "What needs doing?"}
              />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMode(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !text.trim()}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExpenseFormDialog
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        jobs={[job]}
        defaultJobId={job.id}
        onSaved={() => done("Expense saved")}
      />
      <ReceiptCaptureDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        jobs={[job]}
        defaultJobId={job.id}
        onSaved={() => done("Receipt saved")}
      />
    </span>
  );
}
