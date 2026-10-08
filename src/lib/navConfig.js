import { NAV_ICONS } from "@/lib/navIcons";

/**
 * Application shell sidebar — groups from Square This Up Application Design Guide.
 */
export const NAV_GROUPS = [
  {
    id: "home",
    label: null,
    items: [{ to: "/", label: "Dashboard", icon: NAV_ICONS.dashboard, end: true }],
  },
  {
    id: "work",
    label: "Work",
    items: [
      { to: "/today", label: "Today", icon: NAV_ICONS.today },
      { to: "/jobs/active", label: "Jobs", icon: NAV_ICONS.jobs },
      { to: "/jobs/board", label: "Board", icon: NAV_ICONS.board },
      { to: "/jobs/ready-to-schedule", label: "Ready to Schedule", icon: NAV_ICONS.schedule },
      { to: "/jobs/archive", label: "Archive", icon: NAV_ICONS.archive },
      { to: "/clients", label: "Customers", icon: NAV_ICONS.customers },
      { to: "/schedule", label: "Schedule", icon: NAV_ICONS.schedule },
    ],
  },
  {
    id: "money",
    label: "Money",
    items: [
      { to: "/estimates", label: "Estimates", icon: NAV_ICONS.estimates },
      { to: "/jobs/outstanding", label: "Invoices", icon: NAV_ICONS.invoices },
      { to: "/expenses", label: "Expenses", icon: NAV_ICONS.expenses },
      { to: "/receipts", label: "Receipts", icon: NAV_ICONS.receipts },
    ],
  },
  {
    id: "business",
    label: "Business",
    items: [{ to: "/reports", label: "Reports", icon: NAV_ICONS.reports }],
  },
  {
    id: "system",
    label: "System",
    items: [
      { to: "/team", label: "Team", icon: NAV_ICONS.team },
      { to: "/settings", label: "Settings", icon: NAV_ICONS.settings },
    ],
  },
];

/** Deep-link destinations kept working but not in primary sidebar groups. */
export const SECONDARY_DESTINATIONS = [
  { to: "/jobs", label: "All Jobs", end: true },
  { to: "/jobs/archive", label: "Archive" },
  { to: "/jobs/action-items", label: "Action items" },
];
