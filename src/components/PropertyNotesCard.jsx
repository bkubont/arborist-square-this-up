import React from "react";
import { Link } from "react-router-dom";
import ClientAddress from "@/components/ClientAddress";

/**
 * Read-only property access / hazard / parking notes for job and estimate screens.
 * Notes live on the Property so crews never retype them per job.
 */
/** @param {{ property: any, clientId?: string, compact?: boolean }} props */
export default function PropertyNotesCard({ property, clientId, compact = false }) {
  if (!property) return null;

  const blocks = [
    { key: "access_notes", label: "Access" },
    { key: "hazard_notes", label: "Hazards" },
    { key: "parking_notes", label: "Parking / equipment" },
    { key: "pets_notes", label: "Pets" },
    { key: "special_instructions", label: "Special instructions" },
    { key: "notes", label: "Notes" },
  ].filter((b) => String(property[b.key] || "").trim());

  return (
    <div
      className={compact ? "rounded-lg bg-muted/50 px-3 py-2" : "bg-card rounded-xl border border-border p-4"}
      data-testid="property-notes-card"
    >
      {!compact ? (
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Property</div>
            <div className="font-semibold text-foreground mt-0.5">{property.name}</div>
          </div>
          {clientId && (
            <Link to={`/clients/${clientId}`} className="text-xs text-primary hover:underline shrink-0">
              Customer
            </Link>
          )}
        </div>
      ) : (
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Site notes · {property.name}
        </div>
      )}
      {!compact ? (
        <div className="text-sm text-muted-foreground mb-2">
          <ClientAddress client={property} />
        </div>
      ) : null}
      {blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No access or hazard notes on this property yet.</p>
      ) : (
        <dl className="space-y-2 text-sm">
          {blocks.map((b) => (
            <div key={b.key}>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{b.label}</dt>
              <dd className="text-foreground whitespace-pre-wrap">{property[b.key]}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
