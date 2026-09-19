/**
 * Free address suggestions via Photon (Komoot / OSM) — no API key.
 * Used when VITE_GOOGLE_PLACES_API_KEY is unset; graceful empty list on network failure.
 */

export function mapPhotonFeature(feature = {}) {
  const props = feature.properties || {};
  const street = [props.housenumber, props.street].filter(Boolean).join(' ').trim()
    || String(props.name || '').trim();
  const city = String(props.city || props.town || props.village || props.municipality || '').trim();
  const state = String(props.state || '').trim();
  const zip = String(props.postcode || '').trim();
  const labelParts = [
    street || props.name,
    [city, state, zip].filter(Boolean).join(', '),
    props.country,
  ].filter(Boolean);
  return {
    id: String(props.osm_id || props.osm_key || labelParts.join('|')),
    label: labelParts.join(' · '),
    parsed: {
      address: street,
      address_line2: '',
      city,
      state,
      zip,
    },
  };
}

export async function suggestAddresses(q, { fetchImpl = fetch, limit = 6 } = {}) {
  const query = String(q || '').trim();
  if (query.length < 3) return [];
  const max = Math.min(Math.max(Number(limit) || 6, 1), 10);
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lang=en&limit=${max}`;
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'SquareThisUp/1.0 (job-tracker address suggest)' },
      signal: AbortSignal.timeout?.(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    return features.map(mapPhotonFeature).filter((item) => item.parsed.address || item.parsed.city);
  } catch {
    return [];
  }
}
