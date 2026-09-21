import React from "react";
import { Link } from "react-router-dom";
import { Bell, CircleHelp, LogOut, Menu, User } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { BRAND_ASSETS, PRODUCT_NAME } from "@/lib/brand";
import GlobalSearch from "@/components/GlobalSearch";
import QuickAddMenu from "@/components/QuickAddMenu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Thin permanent top bar — logo, search, Quick Add, notifications, help, company/user.
 */
export default function AppTopBar({ onOpenSidebar, className }) {
  const { user, logout } = useAuth();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 h-12 shrink-0 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 bg-sidebar text-sidebar-foreground border-b border-sidebar-border",
        className
      )}
    >
      <button
        type="button"
        className="lg:hidden text-sidebar-accent-foreground shrink-0 p-1"
        onClick={onOpenSidebar}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <Link to="/" className="flex items-center gap-2 min-w-0 shrink-0">
        <img
          src={BRAND_ASSETS.markLight}
          alt=""
          className="w-7 h-7 rounded-md object-contain bg-black shrink-0"
          width={28}
          height={28}
        />
        <span className="hidden sm:inline text-white font-semibold text-sm truncate tracking-wide">
          {PRODUCT_NAME}
        </span>
      </Link>

      <div className="flex-1 min-w-0 px-1 max-w-xl mx-auto w-full hidden sm:block">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
        <div className="sm:hidden w-28">
          <GlobalSearch />
        </div>

        <QuickAddMenu />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Notifications"
          title="Notifications — coming soon"
          disabled
        >
          <Bell className="w-4 h-4" strokeWidth={1.75} />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Help"
          title="Help — coming soon"
          disabled
        >
          <CircleHelp className="w-4 h-4" strokeWidth={1.75} />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-w-[10rem]"
              aria-label="Account menu"
            >
              <User className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span className="hidden sm:inline truncate text-xs">{user?.email || "Account"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="text-xs text-muted-foreground">Signed in as</div>
              <div className="truncate text-sm font-medium">{user?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">Company settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/api/export" download>
                Download backup
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => logout()}>
              <LogOut className="w-4 h-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
