import React, { useEffect, useRef, useState } from "react";
import { Camera, Check, ClipboardList, Image as ImageIcon, Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Image } from "@/components/ui/image";
import StatusBadge from "@/components/StatusBadge";
import { PUNCH_LIST_SECTIONS } from "../../shared/punchListTemplates.js";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

const sectionHints = Object.fromEntries(PUNCH_LIST_SECTIONS.map((s) => [s.key, s.hint]));

function cloneSections(sections = []) {
  return sections.map((section) => ({
    ...section,
    items: (section.items || []).map((item) => ({ ...item })),
  }));
}

/**
 * Final walkthrough punch list document — sections finish | find | funds.
 * Completing uploads a photo of the filled form to job photos.
 *
 * @param {{ jobId: string, punchList: object | null, onChanged?: () => void, className?: string }} props
 */
export default function PunchListPanel({ jobId, punchList, onChanged, className = "" }) {
  const [sections, setSections] = useState([]);
  const [saving, setSaving] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [completing, setCompleting] = useState(false);
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const saveTimer = useRef(null);

  const completed = punchList?.status === "completed";
  const readOnly = completed;

  useEffect(() => {
    if (punchList?.sections) setSections(cloneSections(punchList.sections));
  }, [punchList?.id, punchList?.sections, punchList?.status]);

  const persist = async (nextSections) => {
    if (!punchList?.id || readOnly) return;
    setSaving(true);
    try {
      await api.entities.PunchList.update(punchList.id, { sections: nextSections });
      await onChanged?.();
    } catch (e) {
      alert(e?.message || "Could not save punch list.");
    } finally {
      setSaving(false);
    }
  };

  const scheduleSave = (nextSections) => {
    setSections(nextSections);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(nextSections), 400);
  };

  const updateItem = (sectionKey, index, patch) => {
    const next = sections.map((section) => {
      if (section.key !== sectionKey) return section;
      const items = section.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
      return { ...section, items };
    });
    scheduleSave(next);
  };

  const addItem = (sectionKey, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next = sections.map((section) => {
      if (section.key !== sectionKey) return section;
      return { ...section, items: [...section.items, { text: trimmed, done: false }] };
    });
    scheduleSave(next);
  };

  const removeItem = (sectionKey, index) => {
    const next = sections.map((section) => {
      if (section.key !== sectionKey) return section;
      return { ...section, items: section.items.filter((_, i) => i !== index) };
    });
    scheduleSave(next);
  };

  const onPickSource = (pick) => {
    setCompleteOpen(false);
    setTimeout(() => {
      if (pick === "camera") cameraRef.current?.click();
      else libraryRef.current?.click();
    }, 50);
  };

  const onFilesChosen = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setPendingFiles(files);
    if (cameraRef.current) cameraRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
  };

  const finishComplete = async () => {
    if (!pendingFiles.length || !punchList?.id) return;
    setCompleting(true);
    try {
      const { file_url } = await api.uploadFile({ file: pendingFiles[0] });
      await api.punchList.complete(punchList.id, { photo_url: file_url });
      setPendingFiles([]);
      await onChanged?.();
    } catch (e) {
      alert(e?.message || "Could not complete punch list.");
    } finally {
      setCompleting(false);
    }
  };

  if (!punchList) {
    return (
      <div className={cn("bg-card rounded-xl border border-border p-4 text-sm text-muted-foreground", className)}>
        Punch list loading…
      </div>
    );
  }

  return (
    <div className={cn("bg-card rounded-xl border border-border p-4", statusCardClass(punchList.status, { entity: "PunchList" }), className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <ClipboardList className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground">{punchList.title || "Final walkthrough"}</h3>
              <StatusBadge status={punchList.status} entity="PunchList" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Punch list · finish | find | funds
              {saving ? " · saving…" : ""}
            </p>
          </div>
        </div>
        {!readOnly && (
          <Button size="sm" className="h-8 text-xs" onClick={() => setCompleteOpen(true)}>
            <Camera className="w-3.5 h-3.5 mr-1" />
            Complete punch list
          </Button>
        )}
      </div>

      {completed && punchList.completed_photo_url && (
        <div className="mb-4 rounded-lg border border-border overflow-hidden">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground px-3 py-2 bg-muted/50 border-b border-border">
            Filled-out punch list (on job photos)
          </div>
          <Image
            src={punchList.completed_photo_url}
            fittingType="contain"
            className="w-full max-h-64 bg-muted"
            alt="Completed punch list"
          />
        </div>
      )}

      <div className="space-y-4">
        {sections.map((section) => (
          <SectionBlock
            key={section.key}
            section={section}
            hint={sectionHints[section.key]}
            readOnly={readOnly}
            onToggle={(index, done) => updateItem(section.key, index, { done })}
            onText={(index, text) => updateItem(section.key, index, { text })}
            onRemove={(index) => removeItem(section.key, index)}
            onAdd={(text) => addItem(section.key, text)}
          />
        ))}
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFilesChosen(e.target.files)} />
      <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFilesChosen(e.target.files)} />

      <Dialog open={completeOpen} onOpenChange={(open) => { if (!completing) setCompleteOpen(open); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Complete punch list</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Take or upload a photo of the filled-out punch list. It will be saved to this job&apos;s Photos tab.
          </p>
          {!pendingFiles.length ? (
            <div className="grid grid-cols-2 gap-3 py-2">
              <button
                type="button"
                onClick={() => onPickSource("camera")}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-6 text-sm font-semibold hover:bg-brand-muted/40 transition-colors"
              >
                <Camera className="w-7 h-7 text-primary" />
                Camera
              </button>
              <button
                type="button"
                onClick={() => onPickSource("library")}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-6 text-sm font-semibold hover:bg-brand-muted/40 transition-colors"
              >
                <ImageIcon className="w-7 h-7 text-primary" />
                Photos
              </button>
            </div>
          ) : (
            <div className="py-2 space-y-3">
              <p className="text-xs text-muted-foreground">{pendingFiles[0]?.name || "Photo selected"}</p>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" disabled={completing} onClick={() => setPendingFiles([])}>Choose again</Button>
                <Button disabled={completing} onClick={finishComplete} className="bg-primary text-primary-foreground">
                  {completing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  {completing ? "Saving…" : "Save to job photos"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionBlock({ section, hint, readOnly, onToggle, onText, onRemove, onAdd }) {
  const [draft, setDraft] = useState("");

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="text-sm font-semibold text-foreground capitalize">{section.label || section.key}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
      <ul className="space-y-1.5">
        {(section.items || []).map((item, index) => (
          <li key={item.id || `${section.key}-${index}`} className="flex items-center gap-2 group">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onToggle(index, !item.done)}
              className={cn(
                "w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors",
                item.done ? "bg-primary border-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50",
                readOnly && "opacity-70 cursor-default"
              )}
              aria-label={item.done ? "Mark not done" : "Mark done"}
            >
              {item.done ? <Check className="w-3 h-3" /> : null}
            </button>
            <Input
              value={item.text}
              disabled={readOnly}
              onChange={(e) => onText(index, e.target.value)}
              className="h-8 text-sm flex-1"
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity"
                aria-label="Remove item"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <form
          className="flex gap-2 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            onAdd(draft);
            setDraft("");
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Add ${section.label?.toLowerCase() || section.key} item…`}
            className="h-8 text-sm flex-1"
          />
          <Button type="submit" variant="outline" size="sm" className="h-8 shrink-0" disabled={!draft.trim()}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </form>
      )}
      {!section.items?.length && readOnly && (
        <p className="text-xs text-muted-foreground mt-1">No items.</p>
      )}
    </div>
  );
}
