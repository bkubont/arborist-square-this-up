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

export type JobMaterial = {
  id?: string;
  description?: string;
  qty?: number;
  unit?: string;
  unit_price?: number;
  have?: boolean;
  notes?: string;
};

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
  estimate_amount?: number;
  invoice_amount?: number;
  /** Job-level materials checklist (not estimate lines). Unticked → draft MO. */
  materials?: JobMaterial[];
  materials_cost?: number;
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

export type EstimateLine = {
  id?: string;
  description?: string;
  material_amount?: number;
  labor_amount?: number;
  equipment_amount?: number;
  labor_hours?: number;
  labor_rate?: number;
  category?: string;
  notes?: string;
  tools?: string;
  catalog_id?: string;
  steps?: unknown;
};

export type Estimate = {
  id: string;
  job_id: string;
  number?: string;
  status?: string;
  total?: number;
  subtotal?: number;
  tax_amount?: number;
  tax_rate?: number;
  date?: string;
  valid_till?: string;
  notes?: string;
  lines?: EstimateLine[];
  accepted_snapshot?: Record<string, unknown>;
  created_date?: string;
  updated_date?: string;
};

export type InvoiceMaterialLine = { description?: string; qty?: number; unit_price?: number };
export type InvoiceLaborLine = { description?: string; hours?: number; rate?: number };
export type InvoiceMiscLine = { description?: string; amount?: number };

export type Invoice = {
  id: string;
  job_id: string;
  number?: string;
  status?: string;
  total?: number;
  balance_due?: number;
  subtotal?: number;
  tax_amount?: number;
  tax_rate?: number;
  date?: string;
  notes?: string;
  payment_terms?: string;
  project_name?: string;
  estimate_ref?: string;
  change_order_refs?: string;
  related_estimate_id?: string;
  material_lines?: InvoiceMaterialLine[];
  labor_lines?: InvoiceLaborLine[];
  misc_lines?: InvoiceMiscLine[];
  materials_total?: number;
  labor_total?: number;
  misc_total?: number;
  deposits_applied?: number;
  payments_applied?: number;
  created_date?: string;
  updated_date?: string;
};

export type ChangeOrderLine = EstimateLine & { amount?: number };

export type ChangeOrder = {
  id: string;
  job_id: string;
  number?: string;
  status?: string;
  related_estimate_id?: string;
  reason?: string;
  description?: string;
  added_cost?: number;
  credit?: number;
  net_change?: number;
  added_days?: number;
  revised_contract_total?: number;
  tax_rate?: number;
  notes?: string;
  lines?: ChangeOrderLine[];
  accepted_snapshot?: Record<string, unknown>;
  created_date?: string;
  updated_date?: string;
};

export type MaterialOrderLine = {
  description?: string;
  qty?: number;
  unit_price?: number;
  supplier?: string;
  notes?: string;
  category?: string;
  on_hand?: boolean;
  line_status?: string;
  source_entity?: string;
  source_id?: string;
  source_line_id?: string;
};

export type MaterialOrder = {
  id: string;
  job_id: string;
  number?: string;
  status?: string;
  date?: string;
  notes?: string;
  related_estimate_id?: string;
  lines?: MaterialOrderLine[];
  subtotal?: number;
  total?: number;
  created_date?: string;
  updated_date?: string;
};

export type WorkItemMaterial = {
  id?: string;
  description?: string;
  qty?: number;
  unit?: string;
  unit_price?: number;
  have?: boolean;
  notes?: string;
};

export type WorkItem = {
  id: string;
  job_id: string;
  template_key?: 'prep' | 'materials' | 'final_walkthrough';
  source_type?: 'Estimate' | 'ChangeOrder';
  source_id?: string;
  line_id?: string;
  amount_cents?: number;
  description?: string;
  category?: string;
  tools?: string;
  notes?: string;
  status?: string;
  done?: boolean;
  done_at?: string;
  labor_hours?: number;
  sort_order?: number;
  materials?: WorkItemMaterial[];
  billed_invoice_id?: string;
  created_date?: string;
  updated_date?: string;
};

export type CompanyProfile = {
  id: string;
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo_url?: string;
  default_tax_rate?: number;
  default_payment_terms?: string;
  created_date?: string;
  updated_date?: string;
};

export type Expense = {
  id: string;
  amount?: number;
  date?: string;
  category?: string;
  vendor?: string;
  note?: string;
  job_id?: string;
  photo_url?: string;
  created_date?: string;
  updated_date?: string;
};

export type Payment = {
  id: string;
  job_id: string;
  amount_cents: number;
  kind?: 'payment' | 'deposit';
  date?: string;
  method?: string;
  note?: string;
  invoice_id?: string;
  created_date?: string;
  updated_date?: string;
};

export type CatalogItem = {
  id: string;
  task: string;
  category?: string;
  notes?: string;
  tools?: string;
  materials_note?: string;
  materials_flag?: string;
  hours_mid?: number;
  labor_rate?: number;
  est_labor_cost?: number;
  est_materials_cost?: number;
  source?: string;
  maintenance?: string;
};

export type CatalogSearchResult = {
  default_labor_rate?: number;
  categories?: string[];
  total?: number;
  items: CatalogItem[];
};

export type AccountSummaries = {
  jobs: Record<string, {
    balance_cents?: number;
    invoiced_cents?: number;
    paid_cents?: number;
    running_total_cents?: number;
    awaiting_approval?: Array<{ entity: string; id: string; job_id?: string; number?: string; amount_cents?: number }>;
  }>;
  totals: {
    invoiced_cents: number;
    paid_cents: number;
    outstanding_cents: number;
    waiting_approval_cents: number;
    waiting_approval_count: number;
    waiting_payment_cents: number;
    waiting_payment_count: number;
  };
  waiting_approval: Array<{ entity: string; id: string; job_id?: string; number?: string; amount_cents?: number }>;
  waiting_payment: Array<{ id: string; job_id?: string; number?: string; status?: string; balance_cents?: number }>;
};

/** Derived money for one job (`GET /api/jobs/:id/summary`). */
export type JobSummary = {
  has_accepted_estimate: boolean;
  estimate_cents: number;
  approved_change_cents: number;
  authorized_cents: number;
  running_total_cents: number;
  running_total_basis: 'signed' | 'estimate' | 'none' | string;
  invoiced_cents: number;
  paid_cents: number;
  balance_cents: number;
  credit_cents: number;
  invoices: Array<{
    id: string;
    job_id?: string;
    number?: string;
    status?: string;
    total_cents?: number;
    paid_cents?: number;
    balance_cents?: number;
    payment_status?: string;
  }>;
  awaiting_approval: Array<{
    entity: string;
    id: string;
    job_id?: string;
    number?: string;
    amount_cents?: number;
  }>;
};

export type JobAuthorizedTotal = {
  baseline: number;
  approved_net: number;
  authorized_total: number;
  approved_change_order_ids: string[];
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
    async register(data: {
      email: string;
      password: string;
      inviteToken: string;
      default_tax_rate?: number;
    }): Promise<AuthUser & { token: string }> {
      const result = (await post('/auth/register', {
        ...data,
        client: 'mobile',
      })) as AuthUser & { token?: string };
      if (!result.token) throw new Error('Server did not return a session token for mobile register');
      await setSessionToken(result.token);
      return result as AuthUser & { token: string };
    },
    forgotPassword(email: string): Promise<{ ok: boolean }> {
      return post('/auth/forgot-password', { email }) as Promise<{ ok: boolean }>;
    },
    resetPassword(data: { resetToken: string; newPassword: string }): Promise<{ ok: boolean }> {
      return post('/auth/reset-password', data) as Promise<{ ok: boolean }>;
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
    CompanyProfile: entity<CompanyProfile>('CompanyProfile'),
    Estimate: entity<Estimate>('Estimate'),
    MaterialOrder: entity<MaterialOrder>('MaterialOrder'),
    WorkItem: entity<WorkItem>('WorkItem'),
    ChangeOrder: entity<ChangeOrder>('ChangeOrder'),
    Invoice: entity<Invoice>('Invoice'),
    Expense: entity<Expense>('Expense'),
    Payment: entity<Payment>('Payment'),
  },
  catalog: {
    search(filters: {
      q?: string;
      category?: string;
      maintenance?: string;
      source?: string;
      limit?: number;
    } = {}) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value != null && value !== '' && value !== 'all') params.set(key, String(value));
      }
      return request(`/catalog?${params}`) as Promise<CatalogSearchResult>;
    },
  },
  payments: {
    create(data: {
      job_id: string;
      amount_cents: number;
      kind?: 'payment' | 'deposit';
      date?: string;
      method?: string;
      note?: string;
      invoice_id?: string;
    }) {
      return post('/payments', data) as Promise<Payment>;
    },
  },
  estimates: {
    sendSign(id: string, data: { email?: string; message?: string } = {}) {
      return post(`/estimates/${encodeURIComponent(id)}/send-sign`, data) as Promise<{
        ok?: boolean;
        sign_url?: string;
        message?: string;
      }>;
    },
  },
  changeOrders: {
    sendSign(id: string, data: { email?: string; message?: string } = {}) {
      return post(`/change-orders/${encodeURIComponent(id)}/send-sign`, data) as Promise<{
        ok?: boolean;
        sign_url?: string;
        message?: string;
      }>;
    },
  },
  invoices: {
    fromJob(jobId: string) {
      return post('/invoices/from-job', { job_id: jobId }) as Promise<Invoice>;
    },
  },
  documents: {
    void(entityName: string, id: string) {
      return post(`/documents/${encodeURIComponent(entityName)}/${encodeURIComponent(id)}/void`, {});
    },
    revise(entityName: string, id: string) {
      return post(`/documents/${encodeURIComponent(entityName)}/${encodeURIComponent(id)}/revise`, {});
    },
    setStatus(entityName: string, id: string, status: string) {
      return post(`/documents/${encodeURIComponent(entityName)}/${encodeURIComponent(id)}/status`, {
        status,
      });
    },
  },
  summaries: {
    all: () => request('/summaries') as Promise<AccountSummaries>,
    job: (id: string) => request(`/jobs/${encodeURIComponent(id)}/summary`) as Promise<JobSummary>,
  },
  jobs: {
    authorizedTotal(id: string) {
      return request(`/jobs/${encodeURIComponent(id)}/authorized-total`) as Promise<JobAuthorizedTotal>;
    },
  },
  address: {
    suggest(q: string) {
      const params = new URLSearchParams({ q });
      return request(`/address-suggest?${params}`) as Promise<{
        items: Array<{
          id?: string;
          label: string;
          parsed?: {
            address?: string;
            address_line2?: string;
            city?: string;
            state?: string;
            zip?: string;
          };
        }>;
      }>;
    },
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
