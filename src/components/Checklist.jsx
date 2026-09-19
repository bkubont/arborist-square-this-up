import React, { useState } from "react";
import { Plus, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * @param {{ items: Array<{text: string, done: boolean}>, onChange: (next: Array, summary?: string) => void }} props
 */
export default function Checklist({ items, onChange }) {
  const [text, setText] = useState("");

  const toggle = (i) => {
    const it = items[i];
    const next = items.map((row, idx) => (idx === i ? { ...row, done: !row.done } : row));
    onChange(next, `${it.done ? "Unchecked" : "Checked"}: ${it.text}`);
  };

  const add = () => {
    if (!text.trim()) return;
    const label = text.trim();
    onChange([...(items || []), { text: label, done: false }], `Added checklist item: ${label}`);
    setText("");
  };

  const remove = (i) => {
    const it = items[i];
    onChange(items.filter((_, idx) => idx !== i), `Removed checklist item: ${it.text}`);
  };

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a task…"
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          onClick={add}
          className="px-3 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-1.5">
        {(!items || items.length === 0) && (
          <p className="text-sm text-slate-400 py-2">No tasks yet.</p>
        )}
        {items?.map((it, i) => (
          <div key={i} className="flex items-center gap-2 group">
            <button
              onClick={() => toggle(i)}
              className={cn(
                "w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                it.done ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-slate-400"
              )}
            >
              {it.done && <Check className="w-4 h-4 text-white" />}
            </button>
            <span
              className={cn(
                "flex-1 text-sm",
                it.done ? "line-through text-slate-400" : "text-slate-700"
              )}
            >
              {it.text}
            </span>
            <button
              onClick={() => remove(i)}
              className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
