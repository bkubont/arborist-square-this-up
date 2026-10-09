import React, { useMemo, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Images, Loader2, Trash2, ImageOff } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Image } from "@/components/ui/image";
import { isPhotoEntry, PHOTO_CATEGORIES, photoCategoryLabel, photoCategoryMeta } from "@/lib/photoCategories";
import { cn } from "@/lib/utils";

/**
 * Compact job photos: camera icon → camera/library → category dropdown.
 * Gallery sheet for viewing (does not dominate the job page).
 */
export default function JobPhotoButton({ jobId, entries = [], onUploaded, onChanged, fieldTrigger = false }) {
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [category, setCategory] = useState("before");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");

  const photos = useMemo(() => (entries || []).filter(isPhotoEntry), [entries]);
  const shown = useMemo(() => {
    if (filter === "all") return photos;
    return photos.filter((p) => p.category === filter);
  }, [photos, filter]);

  const onPickSource = (mode) => {
    setSourceOpen(false);
    // Defer so dialog unmount doesn’t swallow the click
    setTimeout(() => {
      if (mode === "camera") cameraRef.current?.click();
      else libraryRef.current?.click();
    }, 50);
  };

  const onFilesChosen = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setPendingFiles(files);
    setCategory("before");
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
          visibility: meta.key === "before" || meta.key === "after" || meta.key === "work" ? "customer" : "internal",
        });
      }
      setCategoryOpen(false);
      setPendingFiles([]);
      onUploaded?.();
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
    <>
      {fieldTrigger ? (
        <Button
          type="button"
          variant="secondary"
          className="min-h-14 h-auto py-3 px-3 flex flex-col items-center justify-center gap-1 text-xs font-semibold whitespace-normal leading-tight w-full"
          onClick={() => setSourceOpen(true)}
          title="Add photo"
        >
          <Camera className="w-5 h-5 shrink-0" aria-hidden />
          <span>Add photo</span>
        </Button>
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setSourceOpen(true)}
            title="Add photo"
          >
            <Camera className="w-3.5 h-3.5 mr-1.5" />
            Photo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setGalleryOpen(true)}
            title="View photos"
          >
            <Images className="w-3.5 h-3.5 mr-1.5" />
            {photos.length > 0 && (
              <span className="text-[10px] font-semibold text-slate-500 tabular-nums">{photos.length}</span>
            )}
          </Button>
        </>
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

      {/* Step 1: camera vs library */}
      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add photo</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              type="button"
              onClick={() => onPickSource("camera")}
              className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-6 text-sm font-semibold text-slate-800 hover:bg-brand-muted/40 transition-colors"
            >
              <Camera className="w-7 h-7 text-primary" />
              Camera
            </button>
            <button
              type="button"
              onClick={() => onPickSource("library")}
              className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-6 text-sm font-semibold text-slate-800 hover:bg-brand-muted/40 transition-colors"
            >
              <ImageIcon className="w-7 h-7 text-primary" />
              Photos
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Step 2: category */}
      <Dialog open={categoryOpen} onOpenChange={(open) => { if (!busy) { setCategoryOpen(open); if (!open) setPendingFiles([]); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Photo category</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500 -mt-1">
            {pendingFiles.length} file{pendingFiles.length === 1 ? "" : "s"} selected
          </p>
          <div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {PHOTO_CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => { setCategoryOpen(false); setPendingFiles([]); }}>Cancel</Button>
            <Button disabled={busy || !pendingFiles.length} onClick={upload} className="bg-primary text-primary-foreground">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {busy ? "Uploading…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View gallery */}
      <Sheet open={galleryOpen} onOpenChange={setGalleryOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
          <SheetHeader className="px-6 pt-6 pb-3 border-b border-slate-100 text-left space-y-2">
            <SheetTitle>Photos</SheetTitle>
            <SheetDescription>Job photos by category. Add more with the Photo button.</SheetDescription>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {PHOTO_CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {shown.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <ImageOff className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No photos in this category yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {shown.map((p) => (
                  <div key={p.id} className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-square">
                    <Image src={p.photo_url} fittingType="fill" className="w-full h-full" alt={p.text || "photo"} />
                    <div className="absolute bottom-0 inset-x-0 bg-black/55 text-[10px] text-white px-1.5 py-1 truncate">
                      {photoCategoryLabel(p.category)}{p.text ? ` · ${p.text}` : ""}
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(p)}
                      className={cn(
                        "absolute top-1 right-1 bg-black/60 text-white rounded p-1",
                        "opacity-0 group-hover:opacity-100 transition-opacity"
                      )}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
