import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileText, Briefcase, Wallet, Receipt, UserPlus, StickyNote } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import JobFormDialog from "@/components/JobFormDialog";
import ClientFormDialog from "@/components/ClientFormDialog";
import ExpenseFormDialog from "@/components/ExpenseFormDialog";
import ReceiptCaptureDialog from "@/components/ReceiptCaptureDialog";
import { toast } from "@/components/ui/use-toast";

/**
 * Persistent Quick Add — Estimate / Job / Expense / Receipt / Customer / Note.
 */
export default function QuickAddMenu() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [jobDialog, setJobDialog] = useState(false);
  const [clientDialog, setClientDialog] = useState(false);
  const [estimatePick, setEstimatePick] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [noteJobId, setNoteJobId] = useState("");
  const [noteText, setNoteText] = useState("");
  const [estimateJobId, setEstimateJobId] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLists = async () => {
    const [c, j] = await Promise.all([
      api.entities.Client.list("-created_date", 200),
      api.entities.Job.list("-updated_date", 200),
    ]);
    setClients(c);
    setJobs(j);
  };

  useEffect(() => {
    loadLists().catch(() => {});
  }, []);

  const saveJob = async (form) => {
    const created = await api.entities.Job.create(form);
    setJobDialog(false);
    navigate(`/jobs/${created.id}`);
  };

  const saveClient = async (form) => {
    const created = await api.entities.Client.create(form);
    setClientDialog(false);
    navigate(`/clients/${created.id}`);
  };

  const goEstimate = () => {
    if (!estimateJobId) return;
    setEstimatePick(false);
    navigate(`/jobs/${estimateJobId}`);
    toast({
      title: "Open Documents on the job",
      description: "Create or open the estimate from the job’s Documents section.",
    });
  };

  const saveNote = async () => {
    if (!noteJobId || !noteText.trim()) return;
    setSaving(true);
    try {
      await api.entities.TimelineEntry.create({
        job_id: noteJobId,
        type: "note",
        text: noteText.trim(),
        category: "note",
      });
      setNoteOpen(false);
      setNoteText("");
      setNoteJobId("");
      navigate(`/jobs/${noteJobId}`);
      toast({ title: "Note saved" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
          >
            <Plus className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
            <span className="hidden sm:inline">Quick Add</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Quick Add</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              loadLists().then(() => {
                setEstimateJobId("");
                setEstimatePick(true);
              });
            }}
          >
            <FileText className="w-4 h-4" /> Estimate
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              loadLists().then(() => setJobDialog(true));
            }}
          >
            <Briefcase className="w-4 h-4" /> Job
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              loadLists().then(() => setExpenseOpen(true));
            }}
          >
            <Wallet className="w-4 h-4" /> Expense
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              loadLists().then(() => setReceiptOpen(true));
            }}
          >
            <Receipt className="w-4 h-4" /> Receipt
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setClientDialog(true)}>
            <UserPlus className="w-4 h-4" /> Customer
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              loadLists().then(() => {
                setNoteJobId("");
                setNoteText("");
                setNoteOpen(true);
              });
            }}
          >
            <StickyNote className="w-4 h-4" /> Note
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <JobFormDialog open={jobDialog} onOpenChange={setJobDialog} onSave={saveJob} clients={clients} />
      <ClientFormDialog open={clientDialog} onOpenChange={setClientDialog} onSave={saveClient} />
      <ExpenseFormDialog
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        jobs={jobs}
        onSaved={(saved) => {
          if (saved?.job_id) navigate(`/jobs/${saved.job_id}`);
          else navigate("/expenses");
        }}
      />
      <ReceiptCaptureDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        jobs={jobs}
        onSaved={() => navigate("/receipts")}
      />

      <Dialog open={estimatePick} onOpenChange={setEstimatePick}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Estimate</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Estimates belong on a job. Pick a job, then create or open the estimate from Documents.
          </p>
          <div>
            <Label>Job</Label>
            <Select value={estimateJobId} onValueChange={setEstimateJobId}>
              <SelectTrigger>
                <SelectValue placeholder={jobs.length ? "Select job" : "No jobs yet"} />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.title || "Untitled"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEstimatePick(false)}>
              Cancel
            </Button>
            <Button onClick={goEstimate} disabled={!estimateJobId} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Job</Label>
              <Select value={noteJobId} onValueChange={setNoteJobId}>
                <SelectTrigger>
                  <SelectValue placeholder={jobs.length ? "Select job" : "No jobs yet"} />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.title || "Untitled"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Note</Label>
              <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} placeholder="Field note…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveNote}
              disabled={saving || !noteJobId || !noteText.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
