import {
  LayoutGrid,
  Briefcase,
  CircleDollarSign,
  Layers,
  UsersRound,
  Building2,
  ListTodo,
  Columns3,
} from "lucide-react";

/**
 * Shared Dashboard tile + side-menu icons (lucide-react).
 * Keep one icon per destination so tiles and nav stay aligned.
 */
export const NAV_ICONS = {
  dashboard: LayoutGrid,
  activeJobs: Briefcase,
  money: CircleDollarSign,
  /** @deprecated alias — prefer money */
  outstanding: CircleDollarSign,
  allJobs: Layers,
  actionItems: ListTodo,
  board: Columns3,
  clients: UsersRound,
  company: Building2,
};
