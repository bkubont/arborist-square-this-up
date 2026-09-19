import React from "react";
import { BRAND_ASSETS, PRODUCT_NAME } from "@/lib/brand";

export default function AuthLayout({ icon: Icon, title, subtitle, footer = null, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <img
            src={BRAND_ASSETS.markDark}
            alt={PRODUCT_NAME}
            className="mx-auto w-16 h-16 rounded-2xl object-contain mb-4 shadow-sm"
            width={64}
            height={64}
          />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
          {Icon ? <span className="sr-only">{Icon.displayName || "icon"}</span> : null}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
