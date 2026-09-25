import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, DollarSign, Loader2, MessageSquare, Phone } from "lucide-react";
import { api } from "@/api/client";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import { googleMapsUrl } from "@/lib/address";
import { money } from "@/lib/format";
import { jobEstimateRollup } from "@/lib/jobCardRollups";
import { jobBalance } from "@/lib/jobFilters";
import { photoCategoryMeta } from "@/lib/photoCategories";
import { statusCardClass } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

/** Stop drag / card navigation for header action controls. */
function stopCardAction(e) {
  e.preventDefault();
  e.stopPropagation();
}

/**
 * Brittany kanban job card: customer header, optional title, city/phone actions,
 * quick camera + payment, notes, hours + whole-line estimate total.
 */
export default function JobKanbanCard({
  job,
  client,
  estimates = [],
  paymentsLogged = 0,
  depositsLogged = 0,
  activeInvoice = null,
  href,
  dragProvided,
  dragSnapshot,
  saving = false,
  onChanged,
  showStatus = false,
}) {
  const cameraRef = useRef(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [busy, setBusy] = useState(false);

  const customerName = client?.name || job.client_name || "—";
  const city = client?.city?.trim();
  const phone = client?.phone?.trim();
  const mapsUrl = client ? googleMapsUrl(client) : null;
  const phoneDigits = phone ? phone.replace(/[^\d+]/g, "") : "";
  const rollup = jobEstimateRollup(job, estimates);
  const balance = jobBalance(job, paymentsLogged, depositsLogged, activeInvoice);

  const quickPhoto = async (fileList) => {
    const file = fileList?.[0];
    if (!file || !job?.id) return;
    setBusy(true);
    try {
      const meta = photoCategoryMeta("gallery");
      const { file_url } = await api.uploadFile({ file });
      await api.entities.TimelineEntry.create({
        job_id: job.id,
        type: meta.type,
        text: `${meta.label}: ${file.name || "photo"}`,
        photo_url: file_url,
        category: meta.key,
      });
      onChanged?.();
    } catch {
      alert("Photo upload failed. Try again.");
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  const logPayment = async () => {
    const amount = Number(payAmount);
    if (!amount || !job?.id) return;
    setBusy(true);
    try {
      await api.entities.TimelineEntry.create({
        job_id: job.id,
        type: "payment_received",
        text: "Payment received",
        category: "financial",
        amount,
        payment_method: payMethod,
        job_status: job.status || undefined,
      });
      setPayOpen(false);
      setPayAmount("");
      setPayMethod("cash");
      onChanged?.();
    } catch {
      alert("Could not log payment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        ref={dragProvided.innerRef}
        {...dragProvided.draggableProps}
        className={cn(
          "bg-card rounded-lg border shadow-sm flex overflow-hidden",
          statusCardClass(job.status),
          dragSnapshot.isDragging && "shadow-md ring-2 ring-primary/40",
          saving && "opacity-60"
        )}
      >
        <div
          {...dragProvided.dragHandleProps}
          className="w-1.5 shrink-0 cursor-grab active:cursor-grabbing bg-border/60 hover:bg-primary/30 transition-colors"
          title="Drag to move"
          aria-hidden="true"
        />

        <div className="flex-1 min-w-0 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold text-sm text-foreground leading-snug truncate min-w-0">
              {customerName}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                title="Take photo"
                disabled={busy}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80"
                onPointerDown={stopCardAction}
                onClick={(e) => {
                  stopCardAction(e);
                  cameraRef.current?.click();
                }}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                title="Log payment"
                disabled={busy}
                className="p-1 rounded-md text-muted-foreground hover:text-emerald-700 hover:bg-emerald-50"
                onPointerDown={stopCardAction}
                onClick={(e) => {
                  stopCardAction(e);
                  setPayOpen(true);
                }}
              >
                <DollarSign className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {(city || phone) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              {city && mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline truncate max-w-full"
                  onPointerDown={stopCardAction}
                  onClick={stopCardAction}
                >
                  {city}
                </a>
              )}
              {city && !mapsUrl && <span className="text-muted-foreground truncate">{city}</span>}
              {phone && phoneDigits && (
                <span className="inline-flex items-center gap-1">
                  <a
                    href={`tel:${phoneDigits}`}
                    className="inline-flex items-center gap-0.5 text-primary hover:underline"
                    onPointerDown={stopCardAction}
                    onClick={stopCardAction}
                  >
                    <Phone className="w-3 h-3" aria-hidden="true" />
                    {phone}
                  </a>
                  <a
                    href={`sms:${phoneDigits}`}
                    title="Text"
                    className="text-primary hover:underline"
                    onPointerDown={stopCardAction}
                    onClick={stopCardAction}
                  >
                    <MessageSquare className="w-3 h-3" aria-hidden="true" />
                  </a>
                </span>
              )}
            </div>
          )}

          <Link to={href} className="block mt-1.5 rounded-md -mx-1 px-1 py-0.5 hover:bg-muted/50">
            {job.title?.trim() && (
              <div className="text-xs font-medium text-foreground leading-snug line-clamp-2 mb-1">
                {job.title}
              </div>
            )}

            {job.notes?.trim() && (
              <p className="text-[11px] text-muted-foreground line-clamp-2 whitespace-pre-wrap mb-1.5">
                {job.notes}
              </p>
            )}

            {rollup.hasEstimate && (
              <div className="text-[10px] text-muted-foreground space-y-0.5 mb-1.5">
                {rollup.hours > 0 && (
                  <div>
                    <span className="font-medium text-foreground tabular-nums">{rollup.hours.toFixed(1)}</span>
                    <span> hrs</span>
                  </div>
                )}
                <div className="font-semibold text-foreground tabular-nums">
                  Est. {money(rollup.total)}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              {showStatus ? <StatusBadge status={job.status} className="scale-90 origin-left" /> : <span />}
              {balance > 0 && (
                <span className="text-[10px] font-semibold text-attention tabular-nums">{money(balance)}</span>
              )}
            </div>
          </Link>
        </div>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => quickPhoto(e.target.files)}
      />

      <Dialog open={payOpen} onOpenChange={(open) => !busy && setPayOpen(open)}>
        <DialogContent className="max-w-xs" onPointerDownOutside={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Log payment</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{customerName}</p>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Amount"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            autoFocus
          />
          <Select value={payMethod} onValueChange={setPayMethod}>
            <SelectTrigger aria-label="Type of payment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((method) => (
                <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button
              disabled={busy || !payAmount}
              className="bg-emerald-600 hover:bg-emerald-500"
              onClick={logPayment}
            >
              {busy ? "Saving…" : "Log"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
