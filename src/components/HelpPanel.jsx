import React, { useState } from "react";
import { Link } from "react-router-dom";
import { CircleHelp } from "lucide-react";
import BrokenSquareMark from "@/components/BrokenSquareMark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PRODUCT_NAME } from "@/lib/brand";

const SECTIONS = [
  {
    title: "Dashboard",
    body: "Start here for situational awareness — Needs Attention, summary money, active jobs, and recent activity.",
    to: "/",
    linkLabel: "Open Dashboard",
  },
  {
    title: "Jobs & customers",
    body: "Jobs is the hub for each tree-service job. Customers is the directory. Use the Board for status columns (access, weather, utility blockers). Open a job to manage tree inventory, estimates, and crew tasks.",
    to: "/jobs/active",
    linkLabel: "Open Jobs",
  },
  {
    title: "Documents on a job",
    body: "One Estimate and one Invoice per job. Accept the estimate before invoicing. Scope add-ons cover crane day, extra haul, or stump grind after the estimate is accepted. Service presets in Settings speed up estimate line items.",
    to: "/estimates",
    linkLabel: "Estimates",
  },
  {
    title: "Tree inventory",
    body: "On each job Overview, log trees (species, DBH, condition, location, recommended work). Inventory is the field record that feeds estimates and crew planning.",
    to: "/jobs/active",
    linkLabel: "Open Jobs",
  },
  {
    title: "Today & field",
    body: "Today lists ordered jobs for the crew with equipment and site instructions. Open the field screen to start/finish a visit, clock time, add photos, report problems, or complete the job.",
    to: "/today",
    linkLabel: "Open Today",
  },
  {
    title: "Schedule",
    body: "Day, week, and agenda views from job start dates. Jump into a job from a chip.",
    to: "/schedule",
    linkLabel: "Open Schedule",
  },
  {
    title: "Expenses & receipts",
    body: "Log fuel, disposal, crane rental, and PHC spend under Expenses. Capture receipt photos under Receipts — unassigned photos land in an inbox until you attach a job.",
    to: "/receipts",
    linkLabel: "Receipts inbox",
  },
  {
    title: "Reports",
    body: "Read-only money and status trends. Use Reports for decisions — deeper analysis stays off the Dashboard.",
    to: "/reports",
    linkLabel: "Open Reports",
  },
  {
    title: "Quick Add",
    body: "The + control in the top bar starts a job, expense, receipt, or customer from almost anywhere.",
  },
  {
    title: "Accounts",
    body: "Registration is invitation-only. Ask your company admin for an invite link — there is no public self-serve signup.",
    to: "/settings",
    linkLabel: "Company settings",
  },
];

/**
 * In-app field-oriented help from the top-bar help control (no external Zendesk).
 */
export default function HelpPanel() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Help"
          title="Help"
        >
          <CircleHelp className="w-4 h-4" strokeWidth={1.75} />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border text-left space-y-2">
          <div className="flex items-center gap-2">
            <BrokenSquareMark state="open" size={16} tone="brand" />
            <SheetTitle className="text-brand">Help</SheetTitle>
          </div>
          <SheetDescription>
            Short field guide for {PRODUCT_NAME} — where things live and what to do next.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {SECTIONS.map((section) => (
            <section key={section.title} className="space-y-1.5">
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{section.body}</p>
              {section.to ? (
                <Link
                  to={section.to}
                  onClick={() => setOpen(false)}
                  className="inline-block text-xs font-semibold text-primary hover:underline pt-0.5"
                >
                  {section.linkLabel} →
                </Link>
              ) : null}
            </section>
          ))}

          <section className="pt-2 border-t border-border space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">System health</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              If something looks offline, check the API health endpoint for a quick ok signal.
            </p>
            <a
              href="/api/health"
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs font-semibold text-primary hover:underline"
            >
              Open /api/health →
            </a>
          </section>
        </div>

        <div className="px-6 py-3 border-t border-border text-[11px] text-muted-foreground">
          Brand blue <span className="font-mono text-brand">#0504AA</span> · gold for attention only
        </div>
      </SheetContent>
    </Sheet>
  );
}
