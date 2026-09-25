import React from "react";
import { Link } from "react-router-dom";
import PublicDocLayout from "@/components/PublicDocLayout";
import { PRODUCT_NAME, SUPPORT_EMAIL } from "@/lib/brand";

/** Public support / contact page for store listings and in-app Settings. */
export default function Support() {
  return (
    <PublicDocLayout title="Support">
      <p>
        Need help with {PRODUCT_NAME}? Use the options below. Accounts are invitation-only — if you
        do not have an invite, ask the person who manages access for your business.
      </p>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">Email</h2>
        <p>
          <a className="text-primary font-medium hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className="text-muted-foreground text-sm">
          Include your account email and a short description of the issue. For password resets when
          email delivery is not configured, the account owner can generate a reset link with the
          server account command.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">In the app</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong className="font-medium text-foreground">Web:</strong> Settings — company
            profile, account deletion, and links to this page and the{" "}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </li>
          <li>
            <strong className="font-medium text-foreground">Mobile:</strong> More → Legal &amp;
            support for privacy and support links; account deletion is on the same screen.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">Common requests</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Password reset or locked account</li>
          <li>New invitation for a teammate (owner-managed)</li>
          <li>Account deletion when you cannot sign in</li>
          <li>Bug reports or feature questions</li>
        </ul>
      </section>
    </PublicDocLayout>
  );
}
