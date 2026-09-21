import React, { useMemo, useRef, useState } from "react";
import { Camera, Image as ImageIcon, ImageOff, Loader2, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Image } from "@/components/ui/image";
import { isPhotoEntry, PHOTO_CATEGORIES, photoCategoryLabel, photoCategoryMeta } from "@/lib/photoCategories";
import { cn } from "@/lib/utils";
import { shortDate } from "@/lib/format";

/**
 * Inline job photos / receipts panel for job detail tabs.
 * @param {{ jobId: string, entries?: any[], onChanged?: () => void, mode?: "photos" | "receipts", emptyHint?: string }} props
 */
export default function JobPhotosPanel({
  jobId,
  entries = [],
  onChanged,
  mode = "photos",
  emptyHint = null,
}) {
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [category, setCategory] = useState(mode === "receipts" ? "receipt" : "before");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState(mode === "receipts" ? "receipt" : "all");

  const photos = useMemo(() => {
    const all = (entries || []).filter(isPhotoEntry);
    if (mode === "receipts") {
      return all.filter(
        (p) => p.category === "receipt" || p.type === "receipt" || p.related_material_order_id
      );
    }
    return all.filter((p) => p.category !== "receipt");
  }, [entries, mode]);

  const shown = useMemo(() => {
    if (mode === "receipts") return photos;
    if (filter === "all") return photos;
    return photos.filter((p) => p.category === filter);
  }, [photos, filter, mode]);

  const categoryOptions =
    mode === "receipts"
      ? PHOTO_CATEGORIES.filter((c) => c.key === "receipt")
      : PHOTO_CATEGORIES.filter((c) => c.key !== "receipt");

  const onPickSource = (pick) => {
    setSourceOpen(false);
    setTimeout(() => {
      if (pick === "camera") cameraRef.current?.click();
      else libraryRef.current?.click();
    }, 50);
  };

  const onFilesChosen = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setPendingFiles(files);
    setCategory(mode === "receipts" ? "receipt" : "before");
    setCategoryOpen(true);
    if (cameraRef.current) cameraRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
  };

  const upload = async () => {
    if (!pendingFiles.length || !jobId) return;
    const meta = photoCategoryMeta(category);
    setBusy(true);
    try {
      for (const file of pendingFiles) {
        const { file_url } = await api.uploadFile({ file });
        await api.entities.TimelineEntry.create({
          job_id: jobId,
          type: meta.type,
          text: `${meta.label}: ${file.name || "photo"}`,
          photo_url: file_url,
          category: meta.key,
        });
      }
      setCategoryOpen(false);
      setPendingFiles([]);
      onChanged?.();
    } catch (e) {
      console.error(e);
      alert("Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry) => {
    if (!confirm("Delete this photo?")) return;
    await api.entities.TimelineEntry.delete(entry.id);
    onChanged?.();
  };

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {mode === "receipts" ? "Receipts" : "Photos"}
          {photos.length > 0 ? (
            <span className="ml-2 text-xs font-semibold normal-case text-muted-foreground tabular-nums">
              {photos.length}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {mode === "photos" && (
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All photos</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button type="button" size="sm" variant="outline" onClick={() => setSourceOpen(true)}>
            <Camera className="w-3.5 h-3.5 mr-1.5" />
            {mode === "receipts" ? "Add receipt" : "Add photo"}
          </Button>
        </div>
      </div>

      {mode === "receipts" && (
        <p className="text-xs text-muted-foreground">
          Job receipt photos and Material Order receipt attachments. Global expense capture is not built yet.
        </p>
      )}

      {shown.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-lg">
          <ImageOff className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">
            {emptyHint ||
              (mode === "receipts"
                ? "No receipts on this job yet. Add a receipt photo, or attach one from a Material Order."
                : "No photos yet.")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {shown.map((p) => (
            <div key={p.id} className="relative group rounded-lg overflow-hidden border border-border aspect-square bg-muted">
              <Image src={p.photo_url} fittingType="fill" className="w-full h-full" alt={p.text || "photo"} />
              <div className="absolute bottom-0 inset-x-0 bg-black/55 text-[10px] text-white px-1.5 py-1 truncate">
                {photoCategoryLabel(p.category)}
                {p.related_material_order_id ? " · MO" : ""}
                {p.created_date ? ` · ${shortDate(p.created_date)}` : ""}
              </div>
              <button
                type="button"
                onClick={() => remove(p)}
                className={cn(
                  "absolute top-1 right-1 bg-black/60 text-white rounded p-1",
                  "opacity-0 group-hover:opacity-100 transition-opacity"
                )}
                aria-label="Delete photo"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFilesChosen(e.target.files)}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onFilesChosen(e.target.files)}
      />

      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{mode === "receipts" ? "Add receipt" : "Add photo"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              type="button"
              onClick={() => onPickSource("camera")}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-6 text-sm font-semibold hover:bg-brand-muted/40 transition-colors"
            >
              <Camera className="w-7 h-7 text-primary" />
              Camera
            </button>
            <button
              type="button"
              onClick={() => onPickSource("library")}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-6 text-sm font-semibold hover:bg-brand-muted/40 transition-colors"
            >
              <ImageIcon className="w-7 h-7 text-primary" />
              Library
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={categoryOpen}
        onOpenChange={(open) => {
          if (!busy) {
            setCategoryOpen(open);
            if (!open) setPendingFiles([]);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{mode === "receipts" ? "Save receipt" : "Photo category"}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            {pendingFiles.length} file{pendingFiles.length === 1 ? "" : "s"} selected
          </p>
          {mode === "photos" && (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setCategoryOpen(false);
                setPendingFiles([]);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !pendingFiles.length}
              onClick={upload}
              className="bg-primary text-primary-foreground"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {busy ? "Uploading…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
