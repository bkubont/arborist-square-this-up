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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EXPENSE_CATEGORIES, todayIso } from "@/lib/expenseCategories";
import { toast } from "@/components/ui/use-toast";

const NONE = "__none__";

/**
 * Add / edit expense — amount → category → job → optional receipt photo.
 * @param {{ open: boolean, onOpenChange: (v: boolean) => void, jobs?: any[], expense?: any, onSaved?: (expense: any) => void, defaultJobId?: string }} props
 */
export default function ExpenseFormDialog({
  open,
  onOpenChange,
  jobs = [],
  expense = null,
  onSaved,
  defaultJobId = "",
}) {
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState("Fuel");
  const [vendor, setVendor] = useState("");
  const [note, setNote] = useState("");
  const [jobId, setJobId] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (expense) {
      setAmount(expense.amount != null ? String(expense.amount) : "");
      setDate(expense.date || todayIso());
      setCategory(expense.category || "Fuel");
      setVendor(expense.vendor || "");
      setNote(expense.note || "");
      setJobId(expense.job_id || "");
      setPhotoUrl(expense.photo_url || "");
    } else {
      setAmount("");
      setDate(todayIso());
      setCategory("Fuel");
      setVendor("");
      setNote("");
      setJobId(defaultJobId || "");
      setPhotoUrl("");
    }
  }, [open, expense, defaultJobId]);

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
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        amount: n,
        date: date || todayIso(),
        category: category || "",
        vendor: vendor.trim(),
        note: note.trim(),
        job_id: jobId || "",
        photo_url: photoUrl || undefined,
      };
      let saved;
      const wasUnassigned = expense?.id && !expense.job_id;
      if (expense?.id) {
        saved = await api.entities.Expense.update(expense.id, payload);
      } else {
        saved = await api.entities.Expense.create(payload);
      }
      // Mirror receipt photo onto the job gallery when newly linked (create or assign).
      if (saved.job_id && saved.photo_url && (!expense?.id || wasUnassigned)) {
        await api.entities.TimelineEntry.create({
          job_id: saved.job_id,
          type: "receipt",
          category: "receipt",
          photo_url: saved.photo_url,
          amount: saved.amount || undefined,
          text: saved.vendor || saved.note || saved.category || "Receipt",
        });
      }
      onOpenChange(false);
      onSaved?.(saved);
      toast({ title: expense?.id ? "Expense updated" : "Expense saved" });
    } catch (e) {
      console.error(e);
      toast({ title: "Could not save expense", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{expense?.id ? "Edit Expense" : "Add Expense"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vendor</Label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <Label>Job</Label>
            <Select value={jobId || NONE} onValueChange={(v) => setJobId(v === NONE ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
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
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional" />
          </div>
          <div>
            <Label>Receipt photo</Label>
            <div className="flex items-center gap-2 mt-1">
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => cameraRef.current?.click()}>
                <Camera className="w-4 h-4 mr-1" /> Camera
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => libraryRef.current?.click()}>
                <ImageIcon className="w-4 h-4 mr-1" /> Library
              </Button>
              {photoUrl ? (
                <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setPhotoUrl("")}>
                  Remove
                </button>
              ) : null}
            </div>
            {photoUrl ? (
              <img src={photoUrl} alt="Receipt" className="mt-2 h-24 w-auto rounded border border-border object-cover" />
            ) : null}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => uploadPhoto(e.target.files)} />
            <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e.target.files)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={busy || amount === ""}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
