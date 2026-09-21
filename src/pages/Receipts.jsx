import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Inbox } from "lucide-react";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import ReceiptCaptureDialog from "@/components/ReceiptCaptureDialog";
import ExpenseFormDialog from "@/components/ExpenseFormDialog";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { isPhotoEntry } from "@/lib/photoCategories";
import { money, shortDate } from "@/lib/format";
import { NAV_ICONS } from "@/lib/navIcons";

const ReceiptsIcon = NAV_ICONS.receipts;

function isReceiptEntry(entry) {
  return (
    isPhotoEntry(entry) &&
    (entry.category === "receipt" || entry.type === "receipt" || entry.related_material_order_id)
  );
}

/**
 * Receipts — unassigned inbox (Expense photos) + by-job gallery/MO receipts.
 */
export default function Receipts() {
  const [timeline, setTimeline] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [assignExpense, setAssignExpense] = useState(null);

  const load = useCallback(async () => {
    const [tl, e, j] = await Promise.all([
      api.entities.TimelineEntry.list("-created_date", 500),
      api.entities.Expense.list("-created_date", 400),
      api.entities.Job.list("-updated_date", 300),
    ]);
    setTimeline(tl);
    setExpenses(e);
    setJobs(j);
  }, []);

  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [load]);

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);

  const inbox = useMemo(
    () => expenses.filter((e) => e.photo_url && !e.job_id),
    [expenses]
  );

  const jobReceipts = useMemo(() => {
    const fromTimeline = timeline.filter(isReceiptEntry).map((e) => ({
      kind: "timeline",
      id: e.id,
      photo_url: e.photo_url,
      amount: e.amount,
      text: e.text,
      job_id: e.job_id,
      mo: Boolean(e.related_material_order_id),
      date: e.created_date,
    }));
    const timelineUrls = new Set(fromTimeline.map((r) => r.photo_url).filter(Boolean));
    const fromExpenses = expenses
      .filter((e) => e.photo_url && e.job_id && !timelineUrls.has(e.photo_url))
      .map((e) => ({
        kind: "expense",
        id: e.id,
        photo_url: e.photo_url,
        amount: e.amount,
        text: e.vendor || e.note || e.category,
        job_id: e.job_id,
        mo: false,
        date: e.date || e.created_date,
      }));
    return [...fromTimeline, ...fromExpenses].sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
    );
  }, [timeline, expenses]);

  const byJob = useMemo(() => {
    const map = new Map();
    for (const r of jobReceipts) {
      if (!map.has(r.job_id)) map.set(r.job_id, []);
      map.get(r.job_id).push(r);
    }
    return [...map.entries()].map(([jobId, items]) => ({
      job: jobById[jobId],
      jobId,
      items,
    }));
  }, [jobReceipts, jobById]);

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Receipts"
        description={
          loading
            ? "Capture inbox and job receipts"
            : `${inbox.length} unassigned · ${jobReceipts.length} on jobs`
        }
        primaryAction={
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setCaptureOpen(true)}>
            <Camera className="w-4 h-4 mr-1" /> Scan Receipt
          </Button>
        }
        secondary={
          <Link to="/expenses" className="text-sm font-medium text-primary hover:underline px-2">
            Expenses
          </Link>
        }
      />

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
              <Inbox className="w-4 h-4" /> Unassigned inbox
            </h2>
            {inbox.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-xl">
                <ReceiptsIcon className="w-10 h-10 mx-auto mb-2 opacity-40" strokeWidth={1.5} />
                <p className="text-sm">No unassigned receipts. Capture one without a job to park it here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {inbox.map((expense) => (
                  <button
                    key={expense.id}
                    type="button"
                    onClick={() => setAssignExpense(expense)}
                    className="rounded-xl border border-border bg-card overflow-hidden text-left hover:border-primary/40 transition-colors"
                  >
                    <Image src={expense.photo_url} alt="" className="w-full aspect-square object-cover" />
                    <div className="p-2">
                      <div className="text-sm font-semibold tabular-nums">{money(expense.amount)}</div>
                      <div className="text-xs text-attention">Tap to assign job</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">By job</h2>
            {byJob.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-xl">
                <p className="text-sm">No job receipts yet. Scan a receipt and pick a job, or upload from a Material Order.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {byJob.map(({ job, jobId, items }) => (
                  <div key={jobId}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Link to={`/jobs/${jobId}?tab=receipts`} className="font-semibold text-foreground hover:text-primary">
                        {job?.title || "Job"}
                      </Link>
                      <span className="text-xs text-muted-foreground">{items.length}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {items.map((item) => (
                        <Link
                          key={`${item.kind}-${item.id}`}
                          to={`/jobs/${jobId}?tab=receipts`}
                          className="rounded-lg border border-border overflow-hidden hover:border-primary/40 transition-colors"
                        >
                          <Image src={item.photo_url} alt="" className="w-full aspect-square object-cover" />
                          <div className="p-1.5 text-[11px] text-muted-foreground truncate">
                            {item.mo ? "MO · " : ""}
                            {item.amount != null ? money(item.amount) : shortDate(item.date)}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <ReceiptCaptureDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        jobs={jobs}
        onSaved={() => load()}
      />

      <ExpenseFormDialog
        open={Boolean(assignExpense)}
        onOpenChange={(v) => {
          if (!v) setAssignExpense(null);
        }}
        jobs={jobs}
        expense={assignExpense}
        onSaved={async () => {
          setAssignExpense(null);
          await load();
        }}
      />
    </div>
  );
}
