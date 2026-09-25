import { useEffect, useState } from 'react';

import { api } from '@/api/client';

let cachedTypes: string[] | null = null;
let inflight: Promise<string[]> | null = null;

async function fetchWorkTypes(): Promise<string[]> {
  if (cachedTypes) return cachedTypes;
  if (!inflight) {
    inflight = api.workTypes
      .list()
      .then(data => {
        cachedTypes = data.types || [];
        inflight = null;
        return cachedTypes;
      })
      .catch(error => {
        inflight = null;
        throw error;
      });
  }
  return inflight;
}

/** Catalog work types for board Type columns and task categories. */
export function useWorkTypes() {
  const [types, setTypes] = useState<string[]>(cachedTypes || []);
  const [loading, setLoading] = useState(!cachedTypes);

  useEffect(() => {
    let cancelled = false;
    fetchWorkTypes()
      .then(list => {
        if (!cancelled) setTypes(list);
      })
      .catch(() => {
        if (!cancelled) setTypes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { types, loading };
}
