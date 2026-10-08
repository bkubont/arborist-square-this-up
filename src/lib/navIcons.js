import {
  LayoutGrid,
  Briefcase,
  CircleDollarSign,
  Layers,
  UsersRound,
  Building2,
  ListTodo,
  Columns3,
  Archive,
  CalendarDays,
  FileText,
  Receipt,
  Wallet,
  BarChart3,
  Settings,
  Users,
} from "lucide-react";

/**
 * Shared Dashboard tile + side-menu icons (lucide-react).
 * Keep one icon per destination so tiles and nav stay aligned.
 */
export const NAV_ICONS = {
  dashboard: LayoutGrid,
  jobs: Briefcase,
  /** @deprecated alias — prefer jobs */
  activeJobs: Briefcase,
  customers: UsersRound,
  /** @deprecated alias — prefer customers */
  clients: UsersRound,
  schedule: CalendarDays,
  estimates: FileText,
  invoices: CircleDollarSign,
  /** @deprecated alias — prefer invoices */
  money: CircleDollarSign,
  /** @deprecated alias — prefer invoices */
  outstanding: CircleDollarSign,
  expenses: Wallet,
  receipts: Receipt,
  reports: BarChart3,
  settings: Settings,
  team: Users,
  /** @deprecated alias — prefer settings */
  company: Building2,
  allJobs: Layers,
  actionItems: ListTodo,
  board: Columns3,
  archive: Archive,
};
