export function addressLines(client) {
  const street = [client?.address, client?.address_line2]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());
  const cityStateZip = [client?.city, client?.state, client?.zip]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());
  const cityLine = cityStateZip.length
    ? [client?.city?.trim(), [client?.state?.trim(), client?.zip?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : "";
  return [...street, cityLine].filter(Boolean);
}

export function googleMapsUrl(client) {
  const address = addressLines(client).join(", ");
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
}

/**
 * Parse Google Places address_components into form fields.
 * Street is street_number + route only — never locality/city.
 * @param {Array<{ long_name?: string, short_name?: string, types?: string[] }>} components
 * @param {{ formattedAddress?: string }} [opts]
 */
export function parseGoogleAddressComponents(components = [], opts = {}) {
  const get = (type, useShort = false) => {
    const row = components.find((c) => Array.isArray(c.types) && c.types.includes(type));
    if (!row) return "";
    return String((useShort ? row.short_name : row.long_name) || "").trim();
  };
  const streetNumber = get("street_number");
  const route = get("route");
  let street = [streetNumber, route].filter(Boolean).join(" ").trim();
  // Fallback: first comma segment of formatted address (usually the street line).
  if (!street && opts.formattedAddress) {
    const first = String(opts.formattedAddress).split(",")[0].trim();
    const locality = get("locality") || get("postal_town");
    if (first && (!locality || first.toLowerCase() !== locality.toLowerCase())) {
      street = first;
    }
  }
  const line2 = get("subpremise");
  // Prefer true city names; avoid neighborhood (too granular / wrong for forms).
  const city =
    get("locality")
    || get("postal_town")
    || get("sublocality_level_1")
    || get("sublocality");
  const state = get("administrative_area_level_1", true);
  const zip = get("postal_code");
  return {
    address: street,
    address_line2: line2,
    city,
    state,
    zip,
  };
}

/**
 * Map Photon / Nominatim-style properties into form fields.
 * Does not put city/locality names into the street field.
 */
export function parsePhotonFeature(feature = {}) {
  const props = feature.properties || feature;
  const type = String(props.type || "").toLowerCase();
  const housenumber = String(props.housenumber || "").trim();
  const streetName = String(props.street || "").trim();
  const name = String(props.name || "").trim();
  const localityTypes = new Set(["city", "locality", "district", "county", "state", "country", "other"]);

  let street = [housenumber, streetName].filter(Boolean).join(" ").trim();
  if (!street && !localityTypes.has(type)) {
    street = streetName || (type === "street" || type === "house" ? name : "");
  }

  return {
    address: street,
    address_line2: "",
    city: String(props.city || props.town || props.village || props.municipality || "").trim(),
    state: String(props.state || "").trim(),
    zip: String(props.postcode || "").trim(),
    label: String(
      props.name
      || [street, props.city, props.state, props.postcode].filter(Boolean).join(", "),
    ),
  };
}
