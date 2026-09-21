import React from "react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

/**
 * Consistent shell for destinations that exist in the design guide IA
 * but do not have product backends yet (Schedule, Expenses, Receipts, Reports).
 */
export default function PlaceholderPage({ title, description, icon: Icon }) {
  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <PageHeader
        title={title}
        description={description || "Coming soon"}
        secondary={
          <Link to="/" className="text-sm font-medium text-primary hover:underline px-2">
            Dashboard
          </Link>
        }
      />
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center">
        {Icon ? <Icon className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" strokeWidth={1.5} aria-hidden="true" /> : null}
        <p className="text-foreground font-medium mb-1">{title} is on the roadmap</p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
          This destination is part of the Square This Up shell. The full module is not built yet — existing
          job documents and workflows are unchanged.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
