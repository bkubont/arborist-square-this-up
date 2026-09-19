import React, { useMemo, useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import TimelineFeed from "@/components/TimelineFeed";
import { composeJobActivity } from "@/lib/jobActivity";

/**
 * Timeline as a button + slide-over (Brittany): full activity feed, not always-on panel.
 */
export default function TimelineButton({ entries = [], documents = [], jobTitle }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");

  const activity = useMemo(
    () => composeJobActivity({ entries, documents }),
    [entries, documents],
  );

  const shown = useMemo(() => {
    if (filter === "all") return activity;
    return activity.filter((e) => {
      if (filter === "document") {
        return e.category === "document"
          || ["document_created", "document_voided", "work_order_created", "estimate_signed", "change_order_signed", "document"].includes(e.type);
      }
      if (filter === "financial") {
        return e.category === "financial"
          || ["deposit_received", "payment_received", "invoice_sent", "estimate_sent", "change_order_sent", "document_voided"].includes(e.type);
      }
      if (filter === "note") {
        return e.category === "note" || e.type === "note" || e.type === "status_change" || e.type === "checklist";
      }
      return e.category === filter;
    });
  }, [activity, filter]);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="shrink-0">
        <History className="w-3.5 h-3.5 mr-1.5" />
        Timeline
        {activity.length > 0 && (
          <span className="ml-1.5 text-[10px] font-semibold text-slate-500 tabular-nums">{activity.length}</span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
          <SheetHeader className="px-6 pt-6 pb-3 border-b border-slate-100 text-left space-y-1">
            <SheetTitle>Timeline</SheetTitle>
            <SheetDescription>
              Full activity for {jobTitle || "this job"} — documents, photos, status, and payments.
            </SheetDescription>
            <div className="pt-2">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All activity</SelectItem>
                  <SelectItem value="document">Documents</SelectItem>
                  <SelectItem value="financial">Financial</SelectItem>
                  <SelectItem value="before">Before photos</SelectItem>
                  <SelectItem value="after">After photos</SelectItem>
                  <SelectItem value="addition">Additions</SelectItem>
                  <SelectItem value="gallery">Gallery</SelectItem>
                  <SelectItem value="receipt">Receipts</SelectItem>
                  <SelectItem value="note">Notes & status</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <TimelineFeed entries={shown} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
