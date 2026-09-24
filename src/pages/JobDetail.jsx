import ClientAddress from "@/components/ClientAddress";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { ArrowLeft, Pencil, Phone, StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import JobPhaseStatusSelect from "@/components/JobPhaseStatusSelect";
import { JOB_PHASES } from "@/lib/jobStatus";
import JobPhotoButton from "@/components/JobPhotoButton";
import JobPhotosPanel from "@/components/JobPhotosPanel";
import VoiceRecorder from "@/components/VoiceRecorder";
import JobTasks from "@/components/JobTasks";
import { JobRunningTotal, JobQuickAdd } from "@/components/JobCardInfo";
import FinancialPanel from "@/components/FinancialPanel";
import JobFormDialog from "@/components/JobFormDialog";
import JobDocuments from "@/components/JobDocuments";
import TimelineFeed from "@/components/TimelineFeed";
import { composeJobActivity } from "@/lib/jobActivity";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

const DOC_ENTITIES = ["Estimate", "MaterialOrder", "ChangeOrder", "Invoice"];
const TASK_VIEW_KEY = "jobTasksView";

/** @returns {"list" | "board"} */
function readTaskView() {
  try {
    return localStorage.getItem(TASK_VIEW_KEY) === "list" ? "list" : "board";
  } catch {
    return "board";
  }
}

const JOB_TABS = [
  "overview",
  "tasks",
  "costs",
  "photos",
  "notes",
  "timeline",
];

const LEGACY_TAB_ALIASES = {
  estimate: "overview",
  invoice: "overview",
  money: "overview",
  receipts: "photos",
  activity: "timeline",
};

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [job, setJob] = useState(null);
  const [client, setClient] = useState(null);
  const [entries, setEntries] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [workItems, setWorkItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [editJob, setEditJob] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState("all");
  const [taskView, setTaskView] = useState(readTaskView);

  /** @param {"list" | "board"} next */
  const chooseTaskView = (next) => {
    setTaskView(next);
    try {
      localStorage.setItem(TASK_VIEW_KEY, next);
    } catch {
      /* per-browser convenience only */
    }
  };

  const tabParam = searchParams.get("tab");
  const resolvedTab = LEGACY_TAB_ALIASES[tabParam] || tabParam;
  const activeTab = JOB_TABS.includes(resolvedTab) ? resolvedTab : "overview";

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const load = useCallback(async () => {
    const [j, e, items, money, ...docLists] = await Promise.all([
      api.entities.Job.get(id),
      api.entities.TimelineEntry.filter({ job_id: id }, "-created_date", 500),
      api.entities.WorkItem.filter({ job_id: id }, "-created_date", 500),
      api.summaries.job(id).catch(() => null),
      ...DOC_ENTITIES.map((entity) => api.entities[entity].filter({ job_id: id }, "-created_date", 100)),
    ]);
    setJob(j);
    setEntries(e);
    setWorkItems(items);
    setSummary(money);
    setDocuments(docLists.flatMap((list, i) => list.map((doc) => ({ ...doc, entity: DOC_ENTITIES[i] }))));
    if (j?.client_id) {
      try {
        setClient(await api.entities.Client.get(j.client_id));
      } catch {
        setClient(null);
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const activity = useMemo(
    () => composeJobActivity({ entries, documents }),
    [entries, documents]
  );

  const shownTimeline = useMemo(() => {
    if (timelineFilter === "all") return activity;
    return activity.filter((e) => {
      if (timelineFilter === "document") {
        return (
          e.category === "document" ||
          ["document_created", "document_voided", "work_order_created", "estimate_signed", "change_order_signed", "document"].includes(e.type)
        );
      }
      if (timelineFilter === "financial") {
        return (
          e.category === "financial" ||
          ["deposit_received", "payment_received", "invoice_sent", "estimate_sent", "change_order_sent", "document_voided"].includes(e.type)
        );
      }
      if (timelineFilter === "note") {
        return e.category === "note" || e.type === "note" || e.type === "status_change" || e.type === "checklist";
      }
      return e.category === timelineFilter;
    });
  }, [activity, timelineFilter]);

  const noteEntries = useMemo(
    () =>
      activity.filter(
        (e) => e.type === "note" || e.category === "note" || e.type === "checklist" || e.type === "status_change"
      ),
    [activity]
  );

  const addNote = async () => {
    if (!note.trim()) return;
    await api.entities.TimelineEntry.create({
      job_id: id,
      type: "note",
      text: note.trim(),
      category: "note",
    });
    setNote("");
    load();
  };

  const updateJob = async (patch) => {
    await api.entities.Job.update(id, patch);
    load();
  };

  const changeStatus = async ({ phase, status }) => {
    await api.entities.Job.update(id, { phase, status });
    const phaseLabel = JOB_PHASES[phase]?.label || phase;
    await api.entities.TimelineEntry.create({
      job_id: id,
      type: "status_change",
      text: `Status changed to ${phaseLabel} · ${status}`,
      category: "note",
    });
    load();
  };

  const logPayment = async (amount) => {
    await api.entities.TimelineEntry.create({
      job_id: id,
      type: "payment_received",
      text: "Payment received",
      category: "financial",
      amount,
    });
    load();
  };

  const deleteJob = async () => {
    if (!confirm("Delete this job and all its timeline entries?")) return;
    await api.entities.Job.delete(id);
    navigate("/clients");
  };

  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!job) return <div className="p-8 text-muted-foreground">Job not found.</div>;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditJob(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
          </Button>
          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={deleteJob}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className={cn("bg-card rounded-xl border p-5 mb-4", statusCardClass(job.status))}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-foreground">
                {job.title?.trim() || client?.name || "Job"}
              </h1>
              {job.title?.trim() && client?.name && (
                <span className="text-sm font-normal text-muted-foreground">{client.name}</span>
              )}
              <JobPhotoButton jobId={id} entries={entries} onUploaded={load} onChanged={load} />
            </div>
            {client && (
              <div className="mt-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <Link to={`/clients/${client.id}`} className="text-muted-foreground hover:text-primary">
                    {client.name}
                  </Link>
                  {client.phone && (
                    <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                      {client.phone}
                    </a>
                  )}
                </div>
                <ClientAddress client={client} />
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <JobPhaseStatusSelect
                phase={job.phase}
                status={job.status}
                onChange={changeStatus}
                className="w-full sm:w-64"
              />
              <JobQuickAdd job={job} onSaved={load} />
            </div>
            {summary && summary.running_total_basis !== "none" && (
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Job total</div>
                <JobRunningTotal summary={summary} className="text-lg" />
              </div>
            )}
          </div>
        </div>
        {job.description && <p className="text-sm text-muted-foreground mt-3">{job.description}</p>}
      </div>

      <Tabs value={activeTab} onValueChange={setTab} className="w-full">
        <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1 bg-muted/80 p-1 mb-4">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs sm:text-sm">Tasks</TabsTrigger>
          <TabsTrigger value="costs" className="text-xs sm:text-sm">Costs</TabsTrigger>
          <TabsTrigger value="photos" className="text-xs sm:text-sm">Photos</TabsTrigger>
          <TabsTrigger value="notes" className="text-xs sm:text-sm">Notes</TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs sm:text-sm">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-0">
          <div>
            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Money
            </div>
            <FinancialPanel job={job} documents={documents} timeline={entries} onLogPayment={logPayment} />
          </div>

          <JobDocuments
            jobId={id}
            jobTitle={job.title}
            client={client}
            documents={documents}
            onChanged={load}
            entities={["Estimate"]}
            title="Estimate"
          />

          <JobDocuments
            jobId={id}
            jobTitle={job.title}
            client={client}
            documents={documents}
            onChanged={load}
            entities={["Invoice"]}
            title="Invoice"
            emptyHint="The invoice unlocks once the estimate is signed. One active invoice per job."
          />

          {job.notes ? (
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Job notes
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{job.notes}</p>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="tasks" className="mt-0">
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Tasks</div>
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/60" role="group" aria-label="Task view">
                {/** @type {Array<"list" | "board">} */ (["list", "board"]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={taskView === v}
                    onClick={() => chooseTaskView(v)}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded-md capitalize",
                      taskView === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <JobTasks jobId={id} items={workItems} documents={documents} onChanged={load} view={taskView} />
          </div>
        </TabsContent>

        <TabsContent value="costs" className="space-y-4 mt-0">
          <JobDocuments
            jobId={id}
            jobTitle={job.title}
            client={client}
            documents={documents}
            onChanged={load}
            entities={["MaterialOrder", "ChangeOrder"]}
            title="Materials & change orders"
            emptyHint="Material Orders appear here as needed; Change Orders after the estimate is accepted."
          />
        </TabsContent>

        <TabsContent value="photos" className="space-y-4 mt-0">
          <JobPhotosPanel jobId={id} entries={entries} onChanged={load} mode="receipts" />
          <JobPhotosPanel jobId={id} entries={entries} onChanged={load} mode="photos" />
        </TabsContent>

        <TabsContent value="notes" className="space-y-4 mt-0">
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Add note
            </div>
            <div className="flex gap-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Quick note… (e.g. Customer deciding on mirror)"
                rows={2}
                className="text-sm"
              />
              <Button className="self-stretch" onClick={addNote}>
                <StickyNote className="w-4 h-4" />
              </Button>
            </div>
            <div className="mt-3 pt-3 border-t border-border">
              <VoiceRecorder jobId={id} onTranscribed={load} />
            </div>
          </div>
          {job.notes ? (
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Job notes
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{job.notes}</p>
            </div>
          ) : null}
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Notes & status
            </div>
            {noteEntries.length ? (
              <TimelineFeed entries={noteEntries} />
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No notes yet.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-0">
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Timeline
              </div>
              <Select value={timelineFilter} onValueChange={setTimelineFilter}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All activity</SelectItem>
                  <SelectItem value="document">Documents</SelectItem>
                  <SelectItem value="financial">Financial</SelectItem>
                  <SelectItem value="before">Before photos</SelectItem>
                  <SelectItem value="after">After photos</SelectItem>
                  <SelectItem value="addition">Additions</SelectItem>
                  <SelectItem value="gallery">Gallery</SelectItem>
                  <SelectItem value="receipt">Receipts</SelectItem>
                  <SelectItem value="note">Notes & status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <TimelineFeed entries={shownTimeline} />
          </div>
        </TabsContent>
      </Tabs>

      <JobFormDialog
        open={editJob}
        onOpenChange={setEditJob}
        onSave={async (form) => {
          await updateJob(form);
          setEditJob(false);
        }}
        job={job}
        clients={client ? [client] : []}
      />
    </div>
  );
}
