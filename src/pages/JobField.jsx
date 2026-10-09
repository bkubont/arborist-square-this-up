import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock,
  FilePlus2,
  Flag,
  Loader2,
  MapPin,
  StickyNote,
  Trees,
} from "lucide-react";
import { api } from "@/api/client";
import TimelineFeed from "@/components/TimelineFeed";
import JobPhotoButton from "@/components/JobPhotoButton";
import PropertyNotesCard from "@/components/PropertyNotesCard";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { composeJobActivity } from "@/lib/jobActivity";
import { cn } from "@/lib/utils";

const DOC_ENTITIES = ["Estimate", "ChangeOrder", "Invoice"];

/**
 * @param {{
 *   icon: React.ComponentType<{ className?: string }>,
 *   label: string,
 *   onClick: () => void,
 *   disabled?: boolean,
 *   variant?: "link" | "secondary" | "default" | "destructive" | "outline" | "ghost",
 *   className?: string,
 * }} props
 */
function ActionButton({ icon: Icon, label, onClick, disabled = false, variant = "secondary", className = "" }) {
  return (
    <Button
      type="button"
      variant={variant}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-14 h-auto py-3 px-3 flex flex-col items-center justify-center gap-1 text-xs font-semibold whitespace-normal leading-tight",
        className,
      )}
    >
      <Icon className="w-5 h-5 shrink-0" aria-hidden />
      <span>{label}</span>
    </Button>
  );
}

/**
 * Phone-first field job screen — visit lifecycle, time clock, photos/notes, timeline.
 */
export default function JobField() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [client, setClient] = useState(null);
  const [property, setProperty] = useState(null);
  const [trees, setTrees] = useState([]);
  const [entries, setEntries] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [timelineFilter, setTimelineFilter] = useState("all"); // all | customer | internal
  const [prompt, setPrompt] = useState(null); // { kind, title, placeholder }
  const [promptText, setPromptText] = useState("");
  const [checklist, setChecklist] = useState(null);
  const [reviewInfo, setReviewInfo] = useState(null);
  const noteRef = useRef(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [j, e, treeRows, times, completion, ...docLists] = await Promise.all([
        api.entities.Job.get(id),
        api.entities.TimelineEntry.filter({ job_id: id }, "-created_date", 500),
        api.entities.TreeInventory.filter({ job_id: id }, "created_date", 200),
        api.field.timeEntries({ job_id: id }),
        api.field.completion(id).catch(() => null),
        ...DOC_ENTITIES.map((entity) => api.entities[entity].filter({ job_id: id }, "-created_date", 50)),
      ]);
      setJob(j);
      setEntries(e);
      setTrees(treeRows);
      setTimeEntries(times);
      setDocuments(docLists.flatMap((list, i) => list.map((doc) => ({ ...doc, entity: DOC_ENTITIES[i] }))));
      if (completion?.checklist) setChecklist(completion.checklist);
      setReviewInfo(completion ? {
        review_status: completion.review_status || j.review_status,
        review_reasons: completion.review_reasons || j.review_reasons,
        review_gate: completion.review_gate,
      } : null);
      if (j?.client_id) {
        try {
          setClient(await api.entities.Client.get(j.client_id));
        } catch {
          setClient(null);
        }
      } else setClient(null);
      if (j?.property_id) {
        try {
          setProperty(await api.entities.Property.get(j.property_id));
        } catch {
          setProperty(null);
        }
      } else setProperty(null);
    } catch (err) {
      setError(err?.message || "Could not load job");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const activity = useMemo(() => composeJobActivity({ entries, documents }), [entries, documents]);

  const filteredActivity = useMemo(() => {
    if (timelineFilter === "all") return activity;
    return activity.filter((e) => {
      /** @type {{ visibility?: string, type?: string }} */
      const row = e;
      const vis = row.visibility
        || (["photo", "estimate_sent", "estimate_signed", "invoice_sent", "payment_received", "deposit_received", "change_order_sent", "change_order_signed"].includes(row.type || "")
          ? "customer"
          : "internal");
      return timelineFilter === "customer" ? vis === "customer" : vis === "internal";
    });
  }, [activity, timelineFilter]);

  const myOpen = useMemo(
    () => timeEntries.find((t) => !t.clock_out) || null,
    [timeEntries],
  );
  const missingFlags = useMemo(
    () => timeEntries.filter((t) => t.missing_clock_out || (t.needs_review && !t.clock_out)),
    [timeEntries],
  );

  const run = async (key, fn) => {
    setBusy(key);
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err?.message || "Action failed");
    } finally {
      setBusy("");
    }
  };

  const openPrompt = (kind, title, placeholder) => {
    setPrompt({ kind, title, placeholder });
    setPromptText("");
  };

  const submitPrompt = async () => {
    if (!prompt) return;
    const text = promptText.trim();
    if (!text && prompt.kind !== "finish" && prompt.kind !== "complete") {
      setError("Add a short description");
      return;
    }
    const kind = prompt.kind;
    setPrompt(null);
    if (kind === "problem") {
      await run("problem", () => api.field.reportProblem(id, { text }));
    } else if (kind === "change") {
      await run("change", () => api.field.requestChange(id, { text }));
    } else if (kind === "note") {
      await run("note", () => api.entities.TimelineEntry.create({
        job_id: id,
        type: "note",
        category: "note",
        visibility: "internal",
        text,
        job_status: job?.status,
      }));
    } else if (kind === "task") {
      await run("task", async () => {
        await api.entities.WorkItem.create({
          job_id: id,
          description: text,
        });
        await api.entities.TimelineEntry.create({
          job_id: id,
          type: "note",
          category: "note",
          visibility: "internal",
          text: `Task added: ${text}`,
          job_status: job?.status,
        });
      });
    } else if (kind === "finish") {
      await run("finish", () => api.field.finishVisit(id, { note: text || undefined }));
    } else if (kind === "complete") {
      await run("complete", () => api.field.completeJob(id, { note: text || undefined }));
    }
  };

  const toggleChecklistItem = async (key, done) => {
    await run("checklist", async () => {
      const updated = await api.field.updateCompletion(id, {
        items: [{ key, done }],
      });
      if (updated?.checklist) setChecklist(updated.checklist);
    });
  };

  if (loading && !job) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center text-muted-foreground text-sm">
        Loading field screen…
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center">
        <p className="text-destructive">{error || "Job not found"}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/today">Back to Today</Link>
        </Button>
      </div>
    );
  }

  const mapsParts = property
    ? [property.address, property.city, property.state, property.zip].filter(Boolean)
    : [];
  const maps = mapsParts.length
    ? `https://maps.google.com/?q=${encodeURIComponent(mapsParts.join(", "))}`
    : null;

  return (
    <div className="max-w-lg mx-auto pb-28">
      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-background/95 backdrop-blur border-b border-border mb-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="min-h-11 px-2">
            <Link to="/today">
              <ArrowLeft className="w-5 h-5" aria-hidden />
              <span className="sr-only">Today</span>
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold truncate leading-tight">{job.title || "Job"}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {client?.name || job.client_name || "Customer"}
            </p>
          </div>
          <StatusBadge status={job.status} />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive mb-3">{error}</p> : null}

      {missingFlags.length > 0 ? (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <span>{missingFlags.length} time entr{missingFlags.length === 1 ? "y" : "ies"} need review (missing clock-out).</span>
        </div>
      ) : null}

      {/* Scope + site */}
      <section className="rounded-xl border border-border bg-card p-4 mb-3 space-y-2">
        {job.description ? (
          <p className="text-sm text-foreground whitespace-pre-wrap">{job.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No description on file.</p>
        )}
        {maps ? (
          <a
            href={maps}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-10"
          >
            <MapPin className="w-4 h-4" aria-hidden />
            {mapsParts.join(", ")}
          </a>
        ) : null}
        {property ? <PropertyNotesCard property={property} compact /> : null}
        {trees.length > 0 ? (
          <div className="pt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Trees className="w-3.5 h-3.5" aria-hidden /> Trees / work areas
            </p>
            <ul className="space-y-1">
              {trees.slice(0, 8).map((t) => (
                <li key={t.id} className="text-sm">
                  <span className="font-medium">{t.label}</span>
                  {t.species ? <span className="text-muted-foreground"> · {t.species}</span> : null}
                  {t.cleanup_notes ? <span className="text-muted-foreground"> — {t.cleanup_notes}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="pt-1">
          <Link to={`/jobs/${id}`} className="text-xs font-medium text-muted-foreground underline">
            Full office job detail
          </Link>
        </div>
      </section>

      {/* Completion checklist (Phase 6) */}
      {checklist?.items?.length ? (
        <section className="rounded-xl border border-border bg-card p-4 mb-4">
          <h2 className="text-sm font-bold mb-2">Completion checklist</h2>
          {job.review_status === "pending" || reviewInfo?.review_status === "pending" ? (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mb-2">
              Pending office review before invoicing
              {(job.review_reasons || reviewInfo?.review_reasons || []).length
                ? ` (${(job.review_reasons || reviewInfo?.review_reasons || []).join(", ")})`
                : ""}
            </p>
          ) : null}
          {job.review_status === "approved" ? (
            <p className="text-xs text-emerald-800 mb-2">Completion review approved — ready to invoice.</p>
          ) : null}
          <ul className="space-y-2">
            {checklist.items.map((item) => (
              <li key={item.key} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={Boolean(item.done)}
                  disabled={Boolean(busy) || job.status === "Completed"}
                  onChange={(e) => toggleChecklistItem(item.key, e.target.checked)}
                  aria-label={item.label}
                />
                <span className={item.done ? "text-muted-foreground line-through" : "text-foreground"}>
                  {item.label}
                  {item.auto ? <span className="text-[10px] uppercase ml-1 text-muted-foreground">auto</span> : null}
                </span>
              </li>
            ))}
          </ul>
          {!checklist.complete && job.status !== "Completed" ? (
            <p className="text-xs text-muted-foreground mt-2">
              Check every item before completing the job (or office can force-complete).
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Primary field actions — large touch targets */}
      <section className="mb-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-0.5">
          Field actions
        </p>
        <div className="grid grid-cols-3 gap-2">
          <ActionButton
            icon={Flag}
            label={job.active_visit ? "Visit live" : "Start visit"}
            disabled={Boolean(busy) || Boolean(job.active_visit)}
            variant={job.active_visit ? "outline" : "default"}
            onClick={() => run("start", () => api.field.startVisit(id))}
          />
          <div className="contents">
            <JobPhotoButton
              jobId={id}
              entries={entries}
              onUploaded={load}
              onChanged={load}
              fieldTrigger
            />
          </div>
          <ActionButton
            icon={StickyNote}
            label="Add note"
            disabled={Boolean(busy)}
            onClick={() => openPrompt("note", "Add note", "What happened on site?")}
          />
          <ActionButton
            icon={ClipboardList}
            label="Add task"
            disabled={Boolean(busy)}
            onClick={() => openPrompt("task", "Add task", "Task title")}
          />
          <ActionButton
            icon={AlertTriangle}
            label="Report problem"
            disabled={Boolean(busy)}
            onClick={() => openPrompt("problem", "Report problem", "Changed conditions, damage, delay…")}
          />
          <ActionButton
            icon={FilePlus2}
            label="Request change"
            disabled={Boolean(busy)}
            onClick={() => openPrompt("change", "Request change", "Describe additional work needed")}
          />
          <ActionButton
            icon={CheckCircle2}
            label="Finish visit"
            disabled={Boolean(busy) || !job.active_visit}
            onClick={() => openPrompt("finish", "Finish visit", "Optional wrap-up note")}
          />
          <ActionButton
            icon={CheckCircle2}
            label="Complete job"
            disabled={Boolean(busy) || job.status === "Completed"}
            variant="default"
            className="col-span-2"
            onClick={() => openPrompt("complete", "Complete job", "Optional completion note")}
          />
        </div>
        {busy ? (
          <p className="mt-2 text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            Working…
          </p>
        ) : null}
      </section>

      {/* Time clock */}
      <section className="rounded-xl border border-border bg-card p-4 mb-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-bold flex items-center gap-1.5">
            <Clock className="w-4 h-4" aria-hidden />
            Time clock
          </h2>
          {myOpen ? (
            <span className="text-xs font-medium text-primary">Clocked in</span>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1 min-h-12"
            disabled={Boolean(busy) || Boolean(myOpen)}
            onClick={() => run("clock-in", () => api.field.clockIn(id, { kind: "work" }))}
          >
            Clock in
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 min-h-12"
            disabled={Boolean(busy) || !myOpen}
            onClick={() => run("clock-out", () => api.field.clockOut(id))}
          >
            Clock out
          </Button>
        </div>
        {timeEntries.length > 0 ? (
          <ul className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
            {timeEntries.slice(0, 8).map((t) => (
              <li key={t.id} className="text-xs text-muted-foreground flex justify-between gap-2">
                <span>
                  {t.kind}
                  {t.needs_review || t.missing_clock_out ? " · needs review" : ""}
                </span>
                <span className="shrink-0">
                  {new Date(t.clock_in).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {t.clock_out
                    ? ` – ${new Date(t.clock_out).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                    : " – open"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">No time recorded yet.</p>
        )}
      </section>

      {/* Timeline */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-bold">Timeline</h2>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            {["all", "customer", "internal"].map((key) => (
              <button
                key={key}
                type="button"
                className={cn(
                  "px-2.5 py-1.5 capitalize",
                  timelineFilter === key ? "bg-muted font-semibold" : "text-muted-foreground",
                )}
                onClick={() => setTimelineFilter(key)}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
        <TimelineFeed entries={filteredActivity} />
      </section>

      <Dialog open={Boolean(prompt)} onOpenChange={(open) => !open && setPrompt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{prompt?.title}</DialogTitle>
          </DialogHeader>
          <Textarea
            ref={noteRef}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder={prompt?.placeholder}
            rows={4}
            className="text-base min-h-[6rem]"
            autoFocus
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setPrompt(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitPrompt} disabled={Boolean(busy)}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
