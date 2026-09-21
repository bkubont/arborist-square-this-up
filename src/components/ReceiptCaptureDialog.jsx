import React, { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayIso } from "@/lib/expenseCategories";
import { toast } from "@/components/ui/use-toast";

const NONE = "__none__";

/**
 * Field-fast receipt capture: photo → amount (optional) → job (optional) → save.
 * Unassigned receipts become Expense inbox items; job-linked also land on the job Receipts tab.
 * @param {{ open: boolean, onOpenChange: (v: boolean) => void, jobs?: any[], onSaved?: () => void, defaultJobId?: string }} props
 */
export default function ReceiptCaptureDialog({
  open,
  onOpenChange,
  jobs = [],
  onSaved,
  defaultJobId = "",
}) {
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [amount, setAmount] = useState("");
  const [jobId, setJobId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhotoUrl("");
    setAmount("");
    setJobId(defaultJobId || "");
  }, [open, defaultJobId]);

  const uploadPhoto = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { file_url } = await api.uploadFile({ file });
      setPhotoUrl(file_url);
    } catch (e) {
      console.error(e);
      toast({ title: "Photo upload failed", variant: "destructive" });
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
    }
  };

  const save = async () => {
    if (!photoUrl) {
      toast({ title: "Capture a receipt photo first", variant: "destructive" });
      return;
    }
    const n = amount === "" ? 0 : Number(amount);
    if (!Number.isFinite(n) || n < 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (jobId) {
        await api.entities.TimelineEntry.create({
          job_id: jobId,
          type: "receipt",
          category: "receipt",
          photo_url: photoUrl,
          amount: n || undefined,
          text: n ? `Receipt ${n}` : "Receipt",
        });
        if (n > 0) {
          await api.entities.Expense.create({
            amount: n,
            date: todayIso(),
            category: "Materials",
            job_id: jobId,
            photo_url: photoUrl,
            note: "From receipt capture",
          });
        }
      } else {
        // Unassigned inbox — Expense holds the photo until linked to a job.
        await api.entities.Expense.create({
          amount: n,
          date: todayIso(),
          category: "Materials",
          photo_url: photoUrl,
          note: "Unassigned receipt",
        });
      }
      onOpenChange(false);
      onSaved?.();
      toast({ title: jobId ? "Receipt saved to job" : "Receipt saved to inbox" });
    } catch (e) {
      console.error(e);
      toast({ title: "Could not save receipt", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan Receipt</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Photo *</Label>
            <div className="flex items-center gap-2 mt-1">
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => cameraRef.current?.click()}>
                <Camera className="w-4 h-4 mr-1" /> Camera
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => libraryRef.current?.click()}>
                <ImageIcon className="w-4 h-4 mr-1" /> Library
              </Button>
            </div>
            {photoUrl ? (
              <img src={photoUrl} alt="Receipt preview" className="mt-2 max-h-40 w-auto rounded border border-border object-cover" />
            ) : (
              <p className="text-sm text-muted-foreground mt-2">Take or choose a receipt photo.</p>
            )}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => uploadPhoto(e.target.files)} />
            <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e.target.files)} />
          </div>
          <div>
            <Label>Amount</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label>Job</Label>
            <Select value={jobId || NONE} onValueChange={(v) => setJobId(v === NONE ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned inbox" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned inbox</SelectItem>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.title || "Untitled"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Leave unassigned to finish later from Receipts.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={busy || !photoUrl}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
