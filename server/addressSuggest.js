/**
 * Free address suggestions via Photon (Komoot / OSM) — no API key.
 * Used when VITE_GOOGLE_PLACES_API_KEY is unset; graceful empty list on network failure.
 * Prefers house/street layers so city/locality hits do not replace the street field.
 */

const LOCALITY_TYPES = new Set(['city', 'locality', 'district', 'county', 'state', 'country', 'other']);

/**
 * Map a Photon feature into client form fields.
 * Street never falls back to place name for locality-level types (that put the city in Address).
 */
export function mapPhotonFeature(feature = {}) {
  const props = feature.properties || {};
  const type = String(props.type || '').toLowerCase();
  const housenumber = String(props.housenumber || '').trim();
  const streetName = String(props.street || '').trim();
  const name = String(props.name || '').trim();

  let address = [housenumber, streetName].filter(Boolean).join(' ').trim();
  if (!address && !LOCALITY_TYPES.has(type)) {
    // house/street (or unknown): name is often the street or "N Main St" label
    address = streetName || (type === 'street' || type === 'house' ? name : '');
  }

  const city = String(
    props.city || props.town || props.village || props.municipality || '',
  ).trim();
  const state = String(props.state || '').trim();
  const zip = String(props.postcode || '').trim();
  const labelParts = [
    address || name,
    [city, state, zip].filter(Boolean).join(', '),
    props.country,
  ].filter(Boolean);

  return {
    id: String(props.osm_id || props.osm_key || labelParts.join('|')),
    label: labelParts.join(' · '),
    parsed: {
      address,
      address_line2: '',
      city,
      state,
      zip,
    },
    _meta: {
      type,
      hasHouseNumber: Boolean(housenumber),
    },
  };
}

/** Keep street-level suggestions; drop city-only / empty-street rows. */
export function isStreetLevelSuggestion(item) {
  const address = String(item?.parsed?.address || '').trim();
  if (!address) return false;
  const city = String(item?.parsed?.city || '').trim();
  if (city && address.toLowerCase() === city.toLowerCase()) return false;
  const type = String(item?._meta?.type || '').toLowerCase();
  if (LOCALITY_TYPES.has(type)) return false;
  return true;
}

function rankStreetLevel(a, b) {
  const ah = a._meta?.hasHouseNumber ? 1 : 0;
  const bh = b._meta?.hasHouseNumber ? 1 : 0;
  return bh - ah;
}

function stripMeta(item) {
  if (!item || typeof item !== 'object') return item;
  const rest = { ...item };
  delete rest._meta;
  return rest;
}

export async function suggestAddresses(q, { fetchImpl = fetch, limit = 6 } = {}) {
  const query = String(q || '').trim();
  if (query.length < 3) return [];
  const max = Math.min(Math.max(Number(limit) || 6, 1), 10);
  // Over-fetch then filter/rank so house/street survive after dropping localities.
  const fetchLimit = Math.min(max * 3, 15);
  const params = new URLSearchParams({
    q: query,
    lang: 'en',
    limit: String(fetchLimit),
    countrycode: 'us',
  });
  // Prefer precise street addresses over city/locality predictions.
  params.append('layer', 'house');
  params.append('layer', 'street');
  const url = `https://photon.komoot.io/api/?${params}`;
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'SquareThisUp/1.0 (job-tracker address suggest)' },
      signal: AbortSignal.timeout?.(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    return features
      .map(mapPhotonFeature)
      .filter(isStreetLevelSuggestion)
      .sort(rankStreetLevel)
      .slice(0, max)
      .map(stripMeta);
  } catch {
    return [];
  }
}
