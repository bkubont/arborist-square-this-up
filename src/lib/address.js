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

/** Parse Google Places address_components into form fields. */
export function parseGoogleAddressComponents(components = []) {
  const get = (type, useShort = false) => {
    const row = components.find((c) => Array.isArray(c.types) && c.types.includes(type));
    if (!row) return "";
    return String((useShort ? row.short_name : row.long_name) || "").trim();
  };
  const streetNumber = get("street_number");
  const route = get("route");
  const street = [streetNumber, route].filter(Boolean).join(" ").trim();
  const line2 = get("subpremise");
  const city = get("locality") || get("sublocality") || get("neighborhood");
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

/** Map Photon / Nominatim-style properties into form fields. */
export function parsePhotonFeature(feature = {}) {
  const props = feature.properties || feature;
  const street = [props.housenumber, props.street || props.name].filter(Boolean).join(" ").trim()
    || String(props.name || "").trim();
  return {
    address: street,
    address_line2: "",
    city: String(props.city || props.town || props.village || props.county || "").trim(),
    state: String(props.state || props.county || "").trim(),
    zip: String(props.postcode || "").trim(),
    label: String(props.name || [street, props.city, props.state, props.postcode].filter(Boolean).join(", ")),
  };
}
