import React from "react";
import { Link } from "react-router-dom";
import PublicDocLayout from "@/components/PublicDocLayout";
import { PRODUCT_NAME, PRODUCT_EDITION, SUPPORT_EMAIL } from "@/lib/brand";

/**
 * Public Privacy Policy for store listings and in-app Settings.
 * Plain-language description of this product — not a legal review.
 */
export default function Privacy() {
  const updated = "September 25, 2026";

  return (
    <PublicDocLayout title="Privacy Policy">
      <p className="text-muted-foreground text-sm">
        Last updated: {updated}. This page describes how {PRODUCT_NAME} handles information in the
        web and mobile apps. It is not legal advice.
      </p>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">Who we are</h2>
        <p>
          {PRODUCT_NAME} ({PRODUCT_EDITION.toLowerCase()}) is a job tracker for tree-service and
          arborist businesses. Accounts are invitation-only; there is no public self-registration.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">What we store</h2>
        <p>When you use an invited account, we store data you enter or upload, including:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Account email and a hashed password (we do not store plaintext passwords)</li>
          <li>Session tokens so you can stay signed in</li>
          <li>Company profile details (name, address, phone, email, website, defaults)</li>
          <li>Customers/clients, jobs, tree inventory, tasks, timeline notes, estimates, change orders, invoices, expenses, and related records</li>
          <li>Photos and other files you upload (served only to the account owner; they are not public URLs)</li>
          <li>
            Optional customer email or phone when you send estimate or change-order sign links
          </li>
        </ul>
        <p>
          Business data belongs to the signed-in account. Accounts do not share clients, jobs, or
          photos with each other.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">How we use it</h2>
        <p>We use this information to run the product for you: authentication, job tracking, documents, photo storage, backups you download, and customer e-sign links you choose to send.</p>
        <p>
          We do not sell your account data. We do not use your job or client records for advertising.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">Optional services</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong className="font-medium text-foreground">Email (SMTP):</strong> If the host
            configures outbound mail, we may send password-reset messages and estimate/change-order
            sign links. Without SMTP, reset and sign links are provided in-app for the account owner
            to share.
          </li>
          <li>
            <strong className="font-medium text-foreground">Address suggestions:</strong> Client
            address fields may call Google Places (if a browser key is configured) or a free
            OpenStreetMap/Photon suggest endpoint. Choosing a suggestion fills address fields you
            can edit.
          </li>
          <li>
            <strong className="font-medium text-foreground">Dictation:</strong> On supported
            browsers, speech-to-text may be processed by the browser or OS provider. The mobile app
            relies on the device keyboard microphone. We do not run a separate paid transcription
            service in the app.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">Access and security</h2>
        <p>
          Access requires a valid session (browser cookie on the web app, or a Bearer token on the
          mobile app). Mutations from the web browser are checked against the app&apos;s configured
          origin. Photos and records are scoped to the authenticated account on the server.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">Retention and deletion</h2>
        <p>
          Data is kept while your account exists so you can use the app and restore from backups you
          download. You can permanently delete your account from Settings (web) or More (mobile).
          Deletion removes the login and owned jobs, customers, documents, and photos. A new
          invitation is required to create another account.
        </p>
        <p>
          If you cannot sign in and need help deleting an account, contact{" "}
          <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">Children</h2>
        <p>
          {PRODUCT_NAME} is built for business use. It is not directed at children under 13, and we
          do not knowingly collect information from them.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">Changes</h2>
        <p>
          We may update this page when the product changes. The &quot;Last updated&quot; date above
          will change when we do. Continued use after an update means you accept the revised
          description.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">Contact</h2>
        <p>
          Questions about privacy or this product:{" "}
          <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          . See also the{" "}
          <Link to="/support" className="text-primary hover:underline">
            Support
          </Link>{" "}
          page.
        </p>
      </section>
    </PublicDocLayout>
  );
}
