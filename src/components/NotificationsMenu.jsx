import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, Inbox, X } from "lucide-react";
import { api } from "@/api/client";
import BrokenSquareMark, { BrokenSquareEmpty } from "@/components/BrokenSquareMark";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/AuthContext";
import { buildAttentionItems } from "@/lib/attentionItems";
import { isWorkingJob } from "@/lib/jobFilters";
import { addCalendarDays, todayKey } from "@/lib/format";
import {
  clearDismissals,
  dismissItem,
  filterDismissed,
  loadDismissals,
} from "@/lib/notificationDismissals";
import { cn } from "@/lib/utils";

/**
 * Top-bar notifications — actionable attention signals from account data.
 */
export default function NotificationsMenu() {
  const { user } = useAuth();
  const accountKey = user?.id || user?.email || "anon";
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [changeOrders, setChangeOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [dismissed, setDismissed] = useState(() => loadDismissals(accountKey));

  useEffect(() => {
    setDismissed(loadDismissals(accountKey));
  }, [accountKey]);

  const refresh = useCallback(() => {
    setLoading(true);
    return Promise.all([
      api.entities.Job.listAll("-updated_date"),
      api.entities.Estimate.list("-updated_date", 300),
      api.entities.ChangeOrder.list("-updated_date", 300),
      api.entities.Invoice.list("-updated_date", 300),
      api.entities.Expense.list("-created_date", 400),
    ])
      .then(([j, e, c, inv, ex]) => {
        setJobs(j.filter(isWorkingJob));
        setEstimates(e);
        setChangeOrders(c);
        setInvoices(inv);
        setExpenses(ex);
        setLoaded(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) return undefined;
    refresh();
    return undefined;
  }, [open, refresh]);

  const today = todayKey();
  const tomorrow = useMemo(() => addCalendarDays(today, 1), [today]);

  const allItems = useMemo(
    () =>
      buildAttentionItems({
        jobs,
        estimates,
        changeOrders,
        invoices,
        expenses,
        today,
        tomorrow,
      }),
    [jobs, estimates, changeOrders, invoices, expenses, today, tomorrow]
  );

  const visible = useMemo(() => filterDismissed(allItems, dismissed), [allItems, dismissed]);
  const unreadCount = loaded ? visible.length : 0;

  const onDismiss = (item, event) => {
    event.preventDefault();
    event.stopPropagation();
    setDismissed(dismissItem(accountKey, item));
  };

  const onClearAll = () => {
    setDismissed(clearDismissals(accountKey));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label={
            unreadCount > 0 ? `Notifications, ${unreadCount} pending` : "Notifications"
          }
          title="Notifications"
        >
          <Bell className="w-4 h-4" strokeWidth={1.75} />
          {unreadCount > 0 ? (
            <span
              className="absolute top-1 right-1 min-w-[0.5rem] h-2 px-0.5 rounded-sm bg-[hsl(var(--brand))] ring-2 ring-sidebar"
              aria-hidden="true"
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(100vw-1.5rem,22rem)] p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <BrokenSquareMark
              state={visible.length === 0 && loaded ? "closed" : "open"}
              size={14}
              tone={visible.length === 0 && loaded ? "gold" : "brand"}
            />
            <h2 className="text-sm font-semibold text-foreground truncate">Notifications</h2>
          </div>
          {Object.keys(dismissed).length > 0 ? (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] font-medium text-primary hover:underline shrink-0"
            >
              Restore dismissed
            </button>
          ) : null}
        </div>

        <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
          {loading && !loaded ? (
            <div className="px-3 py-8 text-sm text-muted-foreground flex items-center justify-center gap-2">
              <BrokenSquareMark state="open" size={14} tone="muted" className="opacity-50 animate-pulse" />
              Loading…
            </div>
          ) : visible.length === 0 ? (
            <BrokenSquareEmpty title="All squared up" state="closed" className="py-10 px-4">
              Nothing needs attention right now.
            </BrokenSquareEmpty>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:bg-muted/50",
                      item.tone === "payment" && "bg-attention-payment-muted/15",
                      item.tone === "receipt" && "bg-attention-muted/15",
                      item.tone === "attention" && "bg-attention-muted/10"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 w-7 h-7 rounded-md flex items-center justify-center shrink-0",
                        item.tone === "payment"
                          ? "bg-attention-payment-muted text-attention-payment-foreground"
                          : "bg-attention-muted text-attention-muted-foreground"
                      )}
                    >
                      {item.tone === "receipt" ? (
                        <Inbox className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                      ) : (
                        <Bell className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-foreground truncate">
                        {item.title}
                      </span>
                      <span
                        className={cn(
                          "block text-xs mt-0.5 truncate",
                          item.tone === "payment" ? "text-attention-payment" : "text-attention"
                        )}
                      >
                        {item.detail}
                      </span>
                      {item.cta ? (
                        <span className="block text-[11px] font-semibold text-primary mt-1">
                          {item.cta}
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => onDismiss(item, e)}
                      className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                      aria-label={`Dismiss ${item.title}`}
                      title="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-muted/20">
          <Link
            to="/jobs/action-items"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            <Check className="w-3 h-3" strokeWidth={2} />
            Needs Attention
          </Link>
          <Link
            to="/receipts"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Receipts
          </Link>
          <Link
            to="/"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Dashboard
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
