import React, { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Wrench, Plus, LogOut, Menu, X, Building2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/jobs", label: "All Jobs", icon: Wrench },
  { to: "/settings", label: "Company", icon: Building2 },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const NavLink = ({ item }) => {
    const active = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to));
    const Icon = item.icon;
    return (
      <Link
        to={item.to}
        onClick={() => setOpen(false)}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
          active ? "bg-amber-400 text-slate-900" : "text-slate-300 hover:bg-slate-800 hover:text-white"
        )}
      >
        <Icon className="w-5 h-5" />
        {item.label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-40 w-64 bg-slate-900 flex flex-col transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="px-5 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-amber-400 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-slate-900" />
            </div>
            <div>
              <div className="text-white font-bold leading-tight">Jobsite</div>
              <div className="text-slate-400 text-xs leading-tight">Notebook</div>
            </div>
          </div>
          <button className="lg:hidden text-slate-400" onClick={() => setOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-3 pb-3">
          <Button
            className="w-full bg-amber-400 text-slate-900 hover:bg-amber-300 font-semibold"
            onClick={() => navigate("/clients")}
          >
            <Plus className="w-4 h-4 mr-1" /> New Job
          </Button>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {nav.map((item) => (
            <NavLink key={item.to} item={item} />
          ))}
        </nav>

        <div className="p-3 border-t border-slate-800">
          <div className="px-2 pb-2 text-xs text-slate-500 truncate">{user?.email}</div>
          <a href="/api/export" download className="block px-2 py-2 text-sm text-slate-300 hover:text-white">Download backup</a>
          <Button
            variant="ghost"
            className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800"
            onClick={() => logout()}
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center justify-between bg-slate-900 px-4 py-3 sticky top-0 z-20">
          <button className="text-white" onClick={() => setOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>
          <span className="text-white font-bold">Jobsite Notebook</span>
          <div className="w-6" />
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
