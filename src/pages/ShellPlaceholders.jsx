import React from "react";
import PlaceholderPage from "@/pages/PlaceholderPage";
import { NAV_ICONS } from "@/lib/navIcons";

export function SchedulePage() {
  return (
    <PlaceholderPage
      title="Schedule"
      description="Day / week / agenda views tied to jobs"
      icon={NAV_ICONS.schedule}
    />
  );
}

export function ExpensesPage() {
  return (
    <PlaceholderPage
      title="Expenses"
      description="Track spend by category, vendor, and job"
      icon={NAV_ICONS.expenses}
    />
  );
}

export function ReceiptsPage() {
  return (
    <PlaceholderPage
      title="Receipts"
      description="Capture inbox for receipts awaiting a job"
      icon={NAV_ICONS.receipts}
    />
  );
}

export function ReportsPage() {
  return (
    <PlaceholderPage
      title="Reports"
      description="Decision-useful trends across jobs and money"
      icon={NAV_ICONS.reports}
    />
  );
}
