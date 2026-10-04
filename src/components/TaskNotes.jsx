import React, { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { shortDate } from "@/lib/format";
import { taskStatusLabel } from "@/lib/tasks";
import { statusColors } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

/**
 * Card notes, oldest first. Each is tinted with the status stamped when the note was written, so
 * the color survives column moves. Used on task cards and job board cards.
 *
 * @param {{ notes?: Array<{ id: string, text: string, status?: string, created_at?: string }>, onRemove?: (id: string) => void, className?: string, formatLabel?: (status: string) => string, testId?: string, fallbackStatus?: string }} props
 */
export function NoteList({
  notes = [],
  onRemove = undefined,
  className = undefined,
  formatLabel = taskStatusLabel,
  testId = "task-note",
  fallbackStatus = "plan",
}) {
  if (!notes.length) return null;
  return (
    <ul className={cn("space-y-1", className)}>
      {notes.map((note) => {
        const status = note.status || fallbackStatus;
        const colors = statusColors(status);
        return (
          <li
            key={note.id}
            data-testid={testId}
            data-note-status={note.status || ""}
            className={cn("group/note flex items-start gap-1.5 rounded-md border px-2 py-1 text-xs", colors.badge)}
          >
            <span className={cn("mt-1 w-1.5 h-1.5 rounded-full shrink-0", colors.swatch)} aria-hidden="true" />
            <span className="flex-1 min-w-0">
              <span className="whitespace-pre-wrap break-words">{note.text}</span>
              <span className="block text-[10px] opacity-70">
                {formatLabel(status)}{note.created_at ? ` · ${shortDate(note.created_at)}` : ""}
              </span>
            </span>
            {onRemove && (
              <button
                type="button"
                aria-label="Remove note"
                onClick={(e) => { e.stopPropagation(); onRemove(note.id); }}
                className="p-0.5 opacity-50 hover:opacity-100 shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Notes plus the always-there "Add a note…" box, as shown on a task card or list row. Clicks and
 * typing stay inside, so they never open the task or start a board drag.
 *
 * @param {{ item: any, focus?: boolean, onAdd: (text: string) => void, onRemove: (id: string) => void, disabled?: boolean, className?: string }} props
 */
export default function TaskNotes({ item, focus = false, onAdd, onRemove, disabled = false, className = undefined }) {
  const [text, setText] = useState("");
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  // After a move into a status that needs a reason, focus the box — once the dropdown / drag has
  // handed focus back, and again after the list re-sorts (moving a focused field blurs it).
  useEffect(() => {
    if (!focus) return undefined;
    const timer = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, [focus, item.status]);

  const submit = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onAdd(value);
    setText("");
  };

  return (
    <div className={cn("space-y-1", className)} onClick={(e) => e.stopPropagation()}>
      <NoteList notes={item.status_notes || []} onRemove={onRemove} />
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Add a note…"
          aria-label="Add a note"
          className="flex-1 min-w-0 px-2 py-1 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
        />
        <button type="button" onClick={submit} aria-label="Save note" disabled={disabled || !text.trim()} className="p-1 text-slate-400 hover:text-primary disabled:opacity-40">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
