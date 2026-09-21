import React, { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "@/lib/navConfig";
import AppTopBar from "@/components/AppTopBar";

export default function AppLayout() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

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
          "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="truncate">{item.label}</span>
        {item.placeholder && !active ? (
          <span className="ml-auto text-[10px] uppercase tracking-wide text-sidebar-muted">Soon</span>
        ) : null}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <AppTopBar onOpenSidebar={() => setOpen(true)} />

      <div className="flex flex-1 min-h-0">
        <aside
          className={cn(
            "fixed lg:static inset-y-0 top-12 lg:top-0 left-0 z-40 w-56 bg-sidebar text-sidebar-foreground flex flex-col transition-transform lg:translate-x-0 border-r border-sidebar-border lg:h-[calc(100vh-3rem)]",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="lg:hidden flex items-center justify-end px-3 py-2 border-b border-sidebar-border">
            <button
              type="button"
              className="text-sidebar-muted"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
            {NAV_GROUPS.map((group) => (
              <div key={group.id}>
                {group.label ? (
                  <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
                    {group.label}
                  </div>
                ) : null}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink key={item.to} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {open && (
          <div className="fixed inset-0 top-12 bg-black/50 z-30 lg:hidden" onClick={() => setOpen(false)} />
        )}

        <main className="flex-1 overflow-y-auto min-h-0 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
