import React from "react";
import { Image as ImageIcon, Receipt, FileText, DollarSign, StickyNote, CheckSquare, RefreshCw, PenLine, Wrench, Send, PlusCircle, Ban } from "lucide-react";
import { Image } from "@/components/ui/image";
import { dateTime, money, timeAgo } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/paymentMethods";
import { statusColors } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

const ICONS = {
  note: StickyNote,
  photo: ImageIcon,
  receipt: Receipt,
  document: FileText,
  estimate_sent: Send,
  estimate_signed: PenLine,
  deposit_received: DollarSign,
  invoice_sent: Send,
  payment_received: DollarSign,
  status_change: RefreshCw,
  checklist: CheckSquare,
  work_order_created: Wrench,
  change_order_sent: Send,
  change_order_signed: PenLine,
  document_created: PlusCircle,
  document_voided: Ban,
};

const TINT = {
  note: "bg-secondary text-muted-foreground",
  photo: "bg-brand-muted text-brand-muted-foreground",
  receipt: "bg-attention-muted text-attention-muted-foreground",
  document: "bg-brand-muted text-brand-muted-foreground",
  estimate_sent: "bg-attention-approval-muted text-attention-approval-foreground",
  estimate_signed: "bg-emerald-100 text-emerald-700",
  deposit_received: "bg-emerald-100 text-emerald-700",
  invoice_sent: "bg-attention-payment-muted text-attention-payment-foreground",
  payment_received: "bg-emerald-100 text-emerald-700",
  status_change: "bg-sky-100 text-sky-700",
  checklist: "bg-brand-muted text-brand-muted-foreground",
  work_order_created: "bg-sky-100 text-sky-700",
  change_order_sent: "bg-attention-approval-muted text-attention-approval-foreground",
  change_order_signed: "bg-emerald-100 text-emerald-700",
  document_created: "bg-slate-100 text-slate-700",
  document_voided: "bg-red-50 text-red-700",
};

const LABELS = {
  note: "Note",
  photo: "Photo",
  receipt: "Receipt",
  document: "Document",
  estimate_sent: "Estimate sent",
  estimate_signed: "Estimate signed",
  deposit_received: "Deposit received",
  invoice_sent: "Invoice sent",
  payment_received: "Payment received",
  status_change: "Status change",
  checklist: "Checklist",
  work_order_created: "Work order created",
  change_order_sent: "Change order sent",
  change_order_signed: "Change order signed",
  document_created: "Document created",
  document_voided: "Document voided",
};

function statusOnEntry(entry) {
  if (entry?.job_status) return entry.job_status;
  const match = /^Status changed to .* · (.+?)(?:\s+\(|$)/.exec(entry?.text || "");
  return match?.[1] || "";
}

/** @param {{ entries: Array<{ id: string, at?: string, created_date?: string, type: string, text?: string, amount?: number, photo_url?: string, payment_method?: string, job_status?: string }> }} props */
export default function TimelineFeed({ entries }) {
  if (!entries?.length) {
    return (
      <div className="text-center py-12 text-slate-400">
        <StickyNote className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No activity yet. Upload a photo, add a note, or create a document.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((e) => {
        const Icon = ICONS[e.type] || StickyNote;
        const at = e.at || e.created_date;
        const status = statusOnEntry(e);
        const colors = status ? statusColors(status) : null;
        const method = paymentMethodLabel(e.payment_method);
        return (
          <div key={e.id} className="flex gap-3">
            <div className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border",
              colors ? colors.badge : (TINT[e.type] || TINT.note),
            )}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 pb-4 border-b border-slate-100 last:border-0">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">
                  {LABELS[e.type] || String(e.type || "note").replace(/_/g, " ")}
                  {method ? <span className="font-normal text-muted-foreground"> · {method}</span> : null}
                </span>
                <div className="text-right shrink-0">
                  <div className="text-xs text-slate-600 whitespace-nowrap" title={at || undefined}>
                    {dateTime(at)}
                  </div>
                  <div className="text-[10px] text-slate-400">{timeAgo(at)}</div>
                </div>
              </div>
              {e.text && <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{e.text}</p>}
              {e.amount != null && (
                <p className="text-sm font-semibold text-emerald-600 mt-0.5">{money(e.amount)}</p>
              )}
              {e.photo_url && (
                <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 max-w-xs">
                  <Image src={e.photo_url} fittingType="fill" className="w-full h-40" alt={e.text || "photo"} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
