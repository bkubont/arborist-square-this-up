import React from "react";
import { Link } from "react-router-dom";
import { BRAND_ASSETS, PRODUCT_NAME } from "@/lib/brand";

/** Minimal public layout for legal / support pages (no login). */
export default function PublicDocLayout({ title, children }) {
  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/login" className="flex items-center gap-2 min-w-0">
            <img
              src={BRAND_ASSETS.markDark}
              alt=""
              className="w-9 h-9 rounded-lg object-contain"
              width={36}
              height={36}
            />
            <span className="font-semibold text-foreground truncate">{PRODUCT_NAME}</span>
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8 sm:py-10">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        <div className="mt-6 space-y-4 text-sm sm:text-[15px] leading-relaxed text-slate-700">
          {children}
        </div>
        <p className="mt-10 pt-6 border-t border-border text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-2">
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          <Link to="/support" className="text-primary hover:underline">
            Support
          </Link>
          <Link to="/login" className="text-primary hover:underline">
            Log in
          </Link>
        </p>
      </main>
    </div>
  );
}
