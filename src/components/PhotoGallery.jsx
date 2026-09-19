import React, { useRef, useState } from "react";
import { Camera, Loader2, Trash2, ImageOff, FileText } from "lucide-react";
import { api } from "@/api/client";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "before", label: "Before", tint: "border-border bg-secondary text-secondary-foreground", accept: "image/*", type: "photo" },
  { key: "after", label: "After", tint: "border-emerald-300 bg-emerald-50 text-emerald-700", accept: "image/*", type: "photo" },
  { key: "receipt", label: "Receipts", tint: "border-attention bg-attention-muted text-attention-muted-foreground", accept: "image/*", type: "receipt" },
  { key: "document", label: "Documents", tint: "border-brand bg-brand-muted text-brand-muted-foreground", accept: "image/*", type: "document", icon: FileText },
];

export default function PhotoGallery({ jobId, entries, onUploaded, onChanged }) {
  const fileRefs = useRef({});
  const [busy, setBusy] = useState(null);

  const photos = entries.filter(
    (e) => e.photo_url && ["before", "after", "receipt", "document"].includes(e.category)
  );

  const handleFiles = async (category, type, files) => {
    if (!files?.length) return;
    setBusy(category);
    try {
      for (const file of files) {
        const { file_url } = await api.uploadFile({ file });
        await api.entities.TimelineEntry.create({
          job_id: jobId,
          type,
          text: type === "document" ? (file.name || "Document uploaded") : type === "receipt" ? (file.name || "Receipt uploaded") : `Photo added (${category})`,
          photo_url: file_url,
          category,
        });
      }
      onUploaded?.();
    } catch (e) {
      console.error(e);
      alert("Upload failed. Try again.");
    } finally {
      setBusy(null);
      if (fileRefs.current[category]) fileRefs.current[category].value = "";
    }
  };

  const remove = async (entry) => {
    if (!confirm("Delete this photo?")) return;
    await api.entities.TimelineEntry.delete(entry.id);
    onChanged?.();
  };

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {SECTIONS.map((sec) => {
        const items = photos.filter((p) => p.category === sec.key);
        return (
          <div key={sec.key} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-700">{sec.label}</span>
              <span className="text-xs text-slate-400">{items.length}</span>
            </div>
            <button
              disabled={busy === sec.key}
              onClick={() => fileRefs.current[sec.key]?.click()}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed py-3 text-xs font-semibold transition-colors mb-2 hover:opacity-80",
                sec.tint,
                busy === sec.key && "opacity-50"
              )}
            >
              {busy === sec.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              Add {sec.label}
            </button>
            <input
              ref={(el) => (fileRefs.current[sec.key] = el)}
              type="file"
              accept={sec.accept}
              capture={sec.key === "receipt" || sec.key === "document" ? undefined : "environment"}
              multiple
              className="hidden"
              onChange={(e) =>
                handleFiles(sec.key, sec.type, Array.from(e.target.files))
              }
            />
            <div className="grid grid-cols-2 gap-1.5">
              {items.length === 0 ? (
                <div className="col-span-2 text-center py-5 text-slate-300">
                  <ImageOff className="w-5 h-5 mx-auto" />
                </div>
              ) : (
                items.map((p) => (
                  <div
                    key={p.id}
                    className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-square"
                  >
                    <Image src={p.photo_url} fittingType="fill" className="w-full h-full" alt={sec.label} />
                    {p.text && (
                      <div className="absolute bottom-0 inset-x-0 bg-black/55 text-[10px] text-white px-1 py-0.5 truncate">
                        {p.text}
                      </div>
                    )}
                    <button
                      onClick={() => remove(p)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
