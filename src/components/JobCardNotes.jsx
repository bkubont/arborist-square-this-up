import React, { useState } from "react";
import { Plus } from "lucide-react";
import { NoteList } from "@/components/TaskNotes";
import { cn } from "@/lib/utils";

/**
 * Multi-note box on a job board card — same idea as task status_notes. Each note keeps the color
 * of the job status it was written under after the card moves columns. The card grows with notes.
 *
 * @param {{
 *   job: { id: string, status?: string, status_notes?: Array<{ id: string, text: string, status?: string, created_at?: string }> },
 *   onAdd: (text: string) => void | Promise<void>,
 *   onRemove: (noteId: string) => void | Promise<void>,
 *   disabled?: boolean,
 *   className?: string,
 * }} props
 */
export default function JobCardNotes({ job, onAdd, onRemove, disabled = false, className = undefined }) {
  const [text, setText] = useState("");

  const submit = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onAdd(value);
    setText("");
  };

  return (
    <div
      data-testid="job-card-notes"
      className={cn("space-y-1", className)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <NoteList
        notes={job.status_notes || []}
        onRemove={onRemove}
        formatLabel={(status) => status || "Note"}
        testId="job-card-note"
        fallbackStatus={job.status || "Estimate sent"}
      />
      <div className="flex items-center gap-1">
        <input
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Add a note…"
          aria-label="Add a note"
          disabled={disabled}
          className="flex-1 min-w-0 px-2 py-1 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
        />
        <button
          type="button"
          onClick={submit}
          aria-label="Save note"
          disabled={disabled || !text.trim()}
          className="p-1 text-slate-400 hover:text-primary disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
