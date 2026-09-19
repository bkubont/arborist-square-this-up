import React, { useRef, useState } from "react";
import { Camera, Receipt, Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { cn } from "@/lib/utils";

// onUploaded(entry) called after timeline entry created
export default function PhotoUploader({ jobId, category, type, onUploaded }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        const { file_url } = await api.uploadFile({ file });
        await api.entities.TimelineEntry.create({
          job_id: jobId,
          type,
          text: "",
          photo_url: file_url,
          category,
        });
        onUploaded?.();
      }
    } catch (e) {
      console.error(e);
      alert("Upload failed. Try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const isReceipt = category === "receipt";

  return (
    <>
      <button
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed py-4 px-2 transition-colors flex-1 min-w-0",
          isReceipt
            ? "border-attention bg-attention-muted text-attention-muted-foreground hover:opacity-90"
            : "border-brand bg-brand-muted text-brand-muted-foreground hover:opacity-90",
          busy && "opacity-50"
        )}
      >
        {busy ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          <>
            {isReceipt ? <Receipt className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
            <span className="text-xs font-semibold">{isReceipt ? "Add Receipt" : "Add Photo"}</span>
          </>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture={isReceipt ? undefined : "environment"}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(Array.from(e.target.files))}
      />
    </>
  );
}