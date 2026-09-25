import { useEffect, useState } from "react";
import { api } from "@/api/client";

let cachedTypes = null;
let inflight = null;

async function fetchWorkTypes() {
  if (cachedTypes) return cachedTypes;
  if (!inflight) {
    inflight = api.catalog.search({ limit: 1 }).then((data) => {
      cachedTypes = data.categories || [];
      inflight = null;
      return cachedTypes;
    }).catch((error) => {
      inflight = null;
      throw error;
    });
  }
  return inflight;
}

/** Catalog trade list for category / work-type dropdowns. */
export function useWorkTypes() {
  const [types, setTypes] = useState(cachedTypes || []);
  const [loading, setLoading] = useState(!cachedTypes);

  useEffect(() => {
    let cancelled = false;
    fetchWorkTypes()
      .then((list) => { if (!cancelled) setTypes(list); })
      .catch(() => { if (!cancelled) setTypes([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { types, loading };
}
