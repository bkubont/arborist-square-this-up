import {
  LayoutGrid,
  Briefcase,
  CircleDollarSign,
  Layers,
  UsersRound,
  Building2,
} from "lucide-react";

/**
 * Shared Dashboard tile + side-menu icons (lucide-react).
 * Keep one icon per destination so tiles and nav stay aligned.
 */
export const NAV_ICONS = {
  dashboard: LayoutGrid,
  activeJobs: Briefcase,
  outstanding: CircleDollarSign,
  allJobs: Layers,
  clients: UsersRound,
  company: Building2,
};
