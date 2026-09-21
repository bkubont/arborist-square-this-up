import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import FieldLabel from "@/components/FieldLabel";
import { parseGoogleAddressComponents, parsePhotonFeature } from "@/lib/address";
import { cn } from "@/lib/utils";

const GOOGLE_KEY = typeof import.meta !== "undefined"
  ? String(/** @type {{ env?: Record<string, string> }} */ (import.meta).env?.VITE_GOOGLE_PLACES_API_KEY || "")
  : "";

let googleMapsPromise;

function loadGoogleMaps(key) {
  if (!key) return Promise.resolve(null);
  const win = /** @type {Window & { google?: any }} */ (window);
  if (win.google?.maps?.places) return Promise.resolve(win.google);
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise((resolve) => {
    const existing = document.querySelector("script[data-google-places]");
    if (existing) {
      existing.addEventListener("load", () => resolve(win.google || null));
      existing.addEventListener("error", () => resolve(null));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googlePlaces = "1";
    script.onload = () => resolve(win.google || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

/**
 * Client address block: street autofill (Google Places when key set, else server Photon suggest),
 * line 2 optional, city/state/ZIP required.
 */
export default function AddressFields({ value, onChange, idPrefix = "client" }) {
  const form = value || {};
  const formRef = useRef(form);
  const onChangeRef = useRef(onChange);
  formRef.current = form;
  onChangeRef.current = onChange;

  const applyParsed = (parsed) => {
    const current = formRef.current || {};
    onChangeRef.current?.({
      ...current,
      address: parsed.address || current.address || "",
      address_line2: parsed.address_line2 || current.address_line2 || "",
      city: parsed.city || current.city || "",
      state: parsed.state || current.state || "",
      zip: parsed.zip || current.zip || "",
    });
  };

  const streetRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState("");
  const googleReady = useRef(false);

  useEffect(() => {
    if (!GOOGLE_KEY) {
      setHint("Type the street address — suggestions can fill city, state, and ZIP.");
      return undefined;
    }
    let cancelled = false;
    let listener;
    let autocomplete;
    loadGoogleMaps(GOOGLE_KEY).then((google) => {
      if (cancelled || !google?.maps?.places || !streetRef.current) {
        if (!cancelled) setHint("Address suggestions unavailable — enter address manually.");
        return;
      }
      googleReady.current = true;
      setHint("Start typing — pick a street address to fill city, state, and ZIP.");
      autocomplete = new google.maps.places.Autocomplete(streetRef.current, {
        fields: ["address_components", "formatted_address", "name"],
        types: ["address"],
        componentRestrictions: { country: ["us"] },
      });
      listener = autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place?.address_components) return;
        const parsed = parseGoogleAddressComponents(place.address_components, {
          formattedAddress: place.formatted_address || place.name,
        });
        // Require a street line so locality-only picks do not wipe Address with the city.
        if (!parsed.address) return;
        applyParsed(parsed);
        setSuggestions([]);
        setOpen(false);
      });
    });
    return () => {
      cancelled = true;
      const g = /** @type {Window & { google?: any }} */ (window).google;
      if (listener && g?.maps?.event) {
        g.maps.event.removeListener(listener);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attach once when key present; form via refs
  }, []);

  useEffect(() => {
    if (GOOGLE_KEY && googleReady.current) return undefined;
    const q = String(form.address || "").trim();
    if (q.length < 3) {
      setSuggestions([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/address-suggest?q=${encodeURIComponent(q)}`, { credentials: "same-origin" });
        if (!res.ok) {
          if (!cancelled) setSuggestions([]);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setSuggestions(Array.isArray(data.items) ? data.items : []);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [form.address]);

  const pickSuggestion = (item) => {
    const parsed = item.parsed || parsePhotonFeature(item);
    if (!parsed.address) return;
    applyParsed(parsed);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <FieldLabel htmlFor={`${idPrefix}-address`} required>Address</FieldLabel>
        <Input
          ref={streetRef}
          id={`${idPrefix}-address`}
          autoComplete={GOOGLE_KEY ? "off" : "address-line1"}
          value={form.address || ""}
          onChange={(e) => {
            const next = e.target.value;
            onChangeRef.current?.({ ...(formRef.current || {}), address: next });
            if (!(GOOGLE_KEY && googleReady.current)) setOpen(true);
          }}
          onFocus={() => { if (suggestions.length) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="123 Oak St"
        />
        {hint && <p className="text-[11px] text-slate-500 mt-1 leading-snug">{hint}</p>}
        {open && suggestions.length > 0 && !(GOOGLE_KEY && googleReady.current) && (
          <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md">
            {suggestions.map((item) => (
              <button
                key={item.id || item.label}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSuggestion(item)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <FieldLabel htmlFor={`${idPrefix}-address-line2`}>Address line 2</FieldLabel>
        <Input
          id={`${idPrefix}-address-line2`}
          autoComplete="address-line2"
          value={form.address_line2 || ""}
          onChange={(e) => onChangeRef.current?.({ ...(formRef.current || {}), address_line2: e.target.value })}
          placeholder="Apt / suite"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="col-span-2 sm:col-span-3">
          <FieldLabel htmlFor={`${idPrefix}-city`} required>City</FieldLabel>
          <Input
            id={`${idPrefix}-city`}
            autoComplete="address-level2"
            value={form.city || ""}
            onChange={(e) => onChangeRef.current?.({ ...(formRef.current || {}), city: e.target.value })}
            placeholder="Springfield"
          />
        </div>
        <div className="col-span-1 sm:col-span-1">
          <FieldLabel htmlFor={`${idPrefix}-state`} required>State</FieldLabel>
          <Input
            id={`${idPrefix}-state`}
            autoComplete="address-level1"
            value={form.state || ""}
            onChange={(e) => onChangeRef.current?.({ ...(formRef.current || {}), state: e.target.value })}
            placeholder="IL"
            className={cn("uppercase")}
          />
        </div>
        <div className="col-span-1 sm:col-span-2">
          <FieldLabel htmlFor={`${idPrefix}-zip`} required>ZIP</FieldLabel>
          <Input
            id={`${idPrefix}-zip`}
            autoComplete="postal-code"
            value={form.zip || ""}
            onChange={(e) => onChangeRef.current?.({ ...(formRef.current || {}), zip: e.target.value })}
            placeholder="62701"
          />
        </div>
      </div>
    </div>
  );
}
