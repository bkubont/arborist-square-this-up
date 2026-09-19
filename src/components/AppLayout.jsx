import React, { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Square, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRODUCT_NAME } from "@/lib/brand";
import { NAV_ICONS } from "@/lib/navIcons";

/** Expanded side menu — includes Dashboard square destinations + core hubs. */
const nav = [
  { to: "/", label: "Dashboard", icon: NAV_ICONS.dashboard, end: true },
  { to: "/jobs/active", label: "Active Jobs", icon: NAV_ICONS.activeJobs },
  { to: "/jobs/outstanding", label: "Outstanding", icon: NAV_ICONS.outstanding, attention: true },
  { to: "/jobs", label: "All Jobs", icon: NAV_ICONS.allJobs, end: true },
  { to: "/clients", label: "Clients", icon: NAV_ICONS.clients },
  { to: "/settings", label: "Company", icon: NAV_ICONS.company },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const DashboardIcon = NAV_ICONS.dashboard;

  const isActive = (item) => {
    if (item.end) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  };

  const NavLink = ({ item }) => {
    const active = isActive(item);
    const Icon = item.icon;
    return (
      <Link
        to={item.to}
        onClick={() => setOpen(false)}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Icon
          className={cn(
            "w-5 h-5 shrink-0",
            !active && item.attention && "text-attention"
          )}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        {item.label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-page flex">
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform lg:translate-x-0 border-r border-sidebar-border",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="px-5 py-5 flex items-center justify-between">
          <Link to="/" onClick={() => setOpen(false)} className="flex items-center gap-2 min-w-0">
            <div
              className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <Square className="w-5 h-5 text-sidebar-primary-foreground" strokeWidth={2.25} fill="currentColor" fillOpacity={0.2} />
            </div>
            <div className="min-w-0">
              <div className="text-sidebar-accent-foreground font-bold leading-tight truncate">{PRODUCT_NAME}</div>
            </div>
          </Link>
          <button type="button" className="lg:hidden text-sidebar-muted shrink-0" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-3 pb-3">
          <Link
            to="/"
            onClick={() => setOpen(false)}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors",
              location.pathname === "/"
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground"
            )}
          >
            <DashboardIcon className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
            Dashboard
          </Link>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {nav.map((item) => (
            <NavLink key={item.to} item={item} />
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className="px-2 pb-2 text-xs text-sidebar-muted truncate">{user?.email}</div>
          <a href="/api/export" download className="block px-2 py-2 text-sm text-sidebar-foreground hover:text-sidebar-accent-foreground">
            Download backup
          </a>
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"
            onClick={() => logout()}
          >
            <LogOut className="w-4 h-4 mr-2" strokeWidth={1.75} /> Sign out
          </Button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center justify-between bg-sidebar text-sidebar-foreground px-4 py-3 sticky top-0 z-20 border-b border-sidebar-border">
          <button type="button" className="text-sidebar-accent-foreground" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="w-6 h-6" />
          </button>
          <Link to="/" className="text-sidebar-accent-foreground font-bold truncate px-2">
            {PRODUCT_NAME}
          </Link>
          <div className="w-6" />
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
