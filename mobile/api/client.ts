import { clearSessionToken, getSessionToken, setSessionToken } from '@/lib/session';
import { preparePhoto } from '@/lib/preparePhoto';

export type AuthUser = {
  id: string;
  email: string;
  created_date?: string;
};

export type Client = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
  created_date?: string;
  updated_date?: string;
};

export type JobStatus =
  | 'Estimate'
  | 'Scheduled'
  | 'In Progress'
  | 'Waiting on Materials'
  | 'On Hold'
  | 'Completed'
  | 'Paid';

export const JOB_STATUSES: JobStatus[] = [
  'Estimate',
  'Scheduled',
  'In Progress',
  'Waiting on Materials',
  'On Hold',
  'Completed',
  'Paid',
];

export type Job = {
  id: string;
  title: string;
  client_id: string;
  client_name?: string;
  description?: string;
  status?: JobStatus | string;
  start_date?: string;
  end_date?: string;
  notes?: string;
  created_date?: string;
  updated_date?: string;
};

export type TimelineEntry = {
  id: string;
  job_id: string;
  type: string;
  text?: string;
  photo_url?: string;
  category?: string;
  amount?: number;
  created_date?: string;
  updated_date?: string;
};

/**
 * Absolute API base (no trailing slash). Examples:
 * - iOS Simulator / Expo web (same machine): http://localhost:3000
 * - Android Emulator: http://10.0.2.2:3000
 * - Physical device: http://<your-lan-ip>:3000
 * - Production: https://jobs.yourdomain.com
 */
const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');

/** Turn `/api/files/:id` (or absolute) into a full URL for native Image / fetch. */
export function absoluteFileUrl(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null;
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  if (fileUrl.startsWith('/')) return `${API_URL}${fileUrl}`;
  return `${API_URL}/${fileUrl}`;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getSessionToken();
  const headers: Record<string, string> = { 'X-Client': 'mobile' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const auth = await authHeaders();
  for (const [key, value] of Object.entries(auth)) headers.set(key, value);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, { ...options, headers });
  } catch {
    throw Object.assign(new Error('Could not reach the server. Check EXPO_PUBLIC_API_URL and that the API is running.'), {
      status: 0,
    });
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await response.json().catch(() => ({})) : await response.arrayBuffer();
  if (!response.ok) {
    if (response.status === 401) await clearSessionToken();
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message?: string }).message)
        : 'Request failed';
    throw Object.assign(new Error(message), { status: response.status });
  }
  return data;
}

const post = (path: string, data: unknown) =>
  request(path, { method: 'POST', body: JSON.stringify(data) });

const PAGE_SIZE_MAX = 500;

const entity = <T extends { id: string }>(name: string) => ({
  async filter(filters: Record<string, string> = {}, sort = '-created_date', limit = 200): Promise<T[]> {
    const pageSize = Math.min(Math.max(1, Number(limit) || 200), PAGE_SIZE_MAX);
    const records: T[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const params = new URLSearchParams({ ...filters, sort, limit: String(pageSize), offset: String(offset) });
      const page = (await request(`/entities/${name}?${params}`)) as T[];
      records.push(...page);
      if (page.length < pageSize) return records;
    }
  },
  list(sort = '-created_date', limit = 200) {
    return this.filter({}, sort, limit);
  },
  get(id: string) {
    return request(`/entities/${name}/${encodeURIComponent(id)}`) as Promise<T>;
  },
  create(data: Partial<T>) {
    return post(`/entities/${name}`, data) as Promise<T>;
  },
  update(id: string, data: Partial<T>) {
    return request(`/entities/${name}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }) as Promise<T>;
  },
  delete(id: string) {
    return request(`/entities/${name}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
});

export const api = {
  baseUrl: API_URL,
  auth: {
    me: (): Promise<AuthUser> => request('/auth/me') as Promise<AuthUser>,
    async login(email: string, password: string): Promise<AuthUser & { token: string }> {
      const result = (await post('/auth/login', {
        email,
        password,
        client: 'mobile',
      })) as AuthUser & { token?: string };
      if (!result.token) throw new Error('Server did not return a session token for mobile login');
      await setSessionToken(result.token);
      return result as AuthUser & { token: string };
    },
    async logout(): Promise<void> {
      try {
        await post('/auth/logout', {});
      } finally {
        await clearSessionToken();
      }
    },
    async deleteAccount(password: string): Promise<void> {
      try {
        await request('/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) });
      } finally {
        await clearSessionToken();
      }
    },
  },
  entities: {
    Client: entity<Client>('Client'),
    Job: entity<Job>('Job'),
    TimelineEntry: entity<TimelineEntry>('TimelineEntry'),
  },
  /** Resize → JPEG, then multipart POST /api/files (Bearer). */
  async uploadFile(localUri: string): Promise<{ file_url: string }> {
    const prepared = await preparePhoto(localUri);
    const form = new FormData();
    form.append('file', {
      uri: prepared.uri,
      name: 'photo.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
    return request('/files', { method: 'POST', body: form }) as Promise<{ file_url: string }>;
  },
};
