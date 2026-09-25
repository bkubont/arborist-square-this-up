import { useEffect, useState } from "react";
import { api } from "@/api/client";

let cachedTypes = null;
let inflight = null;

async function fetchWorkTypes() {
  if (cachedTypes) return cachedTypes;
  if (!inflight) {
    inflight = api.workTypes.list().then((data) => {
      cachedTypes = data.types || [];
      inflight = null;
      return cachedTypes;
    }).catch((error) => {
      inflight = null;
      throw error;
    });
  }
  return inflight;
}

/** Brittany's work-type list for category / work-type dropdowns and kanban. */
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
