import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Search, X } from "lucide-react";
import { api } from "@/api/client";
import { cn } from "@/lib/utils";

/**
 * Client-side global search over jobs and customers (no dedicated search API yet).
 */
export default function GlobalSearch({ className, onNavigate }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open || loaded) return;
    Promise.all([
      api.entities.Job.list("-updated_date", 200),
      api.entities.Client.list("-updated_date", 200),
    ])
      .then(([j, c]) => {
        setJobs(j);
        setClients(c);
      })
      .finally(() => setLoaded(true));
  }, [open, loaded]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const jobHits =
    q.length < 1
      ? []
      : jobs
          .filter(
            (j) =>
              (j.title || "").toLowerCase().includes(q) ||
              (j.job_number || "").toLowerCase().includes(q) ||
              (j.status || "").toLowerCase().includes(q)
          )
          .slice(0, 6);
  const clientHits =
    q.length < 1
      ? []
      : clients
          .filter(
            (c) =>
              (c.name || "").toLowerCase().includes(q) ||
              (c.email || "").toLowerCase().includes(q) ||
              (c.phone || "").toLowerCase().includes(q)
          )
          .slice(0, 6);
  const hasResults = jobHits.length > 0 || clientHits.length > 0;

  const go = () => {
    setOpen(false);
    setQuery("");
    onNavigate?.();
  };

  return (
    <div ref={rootRef} className={cn("relative w-full max-w-md", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-sidebar-muted pointer-events-none" strokeWidth={1.75} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search jobs & customers…"
          className="w-full h-8 rounded-md border border-sidebar-border bg-sidebar-accent/60 pl-8 pr-8 text-sm text-sidebar-foreground placeholder:text-sidebar-muted focus:outline-none focus:ring-1 focus:ring-sidebar-ring"
          aria-label="Search jobs and customers"
        />
        {query ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-sidebar-muted hover:text-sidebar-foreground"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>
      {open && q.length >= 1 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-md overflow-hidden">
          {!loaded ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Loading…</p>
          ) : !hasResults ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matches</p>
          ) : (
            <div className="max-h-72 overflow-y-auto py-1">
              {jobHits.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Jobs</div>
                  {jobHits.map((j) => (
                    <Link
                      key={j.id}
                      to={`/jobs/${j.id}`}
                      onClick={go}
                      className="block px-3 py-2 text-sm hover:bg-accent truncate"
                    >
                      <span className="font-medium">{j.title || "Untitled"}</span>
                      {j.status ? <span className="text-muted-foreground ml-2">{j.status}</span> : null}
                    </Link>
                  ))}
                </div>
              )}
              {clientHits.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customers</div>
                  {clientHits.map((c) => (
                    <Link
                      key={c.id}
                      to={`/clients/${c.id}`}
                      onClick={go}
                      className="block px-3 py-2 text-sm hover:bg-accent truncate"
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
