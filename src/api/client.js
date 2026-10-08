import { preparePhoto } from '@/lib/preparePhoto';
import {
  clearDesktopSessionToken,
  getDesktopSessionToken,
  isDesktopClient,
  setDesktopSessionToken,
} from '@/lib/desktopSession';

const desktop = isDesktopClient();
const viteEnv = /** @type {{ env?: Record<string, string> }} */ (import.meta).env || {};
/** Empty in desktop:dev → relative `/api` via Vite proxy; set for packaged builds. */
const API_ORIGIN = desktop
  ? String(viteEnv.VITE_API_URL || '').replace(/\/$/, '')
  : '';

async function desktopAuthHeaders() {
  const headers = { 'X-Client': 'desktop' };
  const token = await getDesktopSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request(path, options = {}) {
  const headers = new Headers(
    options.body instanceof FormData
      ? options.headers || {}
      : { 'Content-Type': 'application/json', ...(options.headers || {}) },
  );
  if (desktop) {
    const auth = await desktopAuthHeaders();
    for (const [key, value] of Object.entries(auth)) headers.set(key, value);
  }

  const url = API_ORIGIN ? `${API_ORIGIN}/api${path}` : `/api${path}`;
  /** @type {RequestInit} */
  const fetchOptions = desktop
    ? { ...options, headers }
    : { credentials: 'same-origin', ...options, headers };

  let response;
  try {
    response = await fetch(url, fetchOptions);
  } catch {
    const error = new Error('Could not reach the server. Check your connection and try again.');
    window.dispatchEvent(new CustomEvent('api-error', { detail: error }));
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (desktop && response.status === 401) await clearDesktopSessionToken();
    const error = Object.assign(new Error(data.message || 'Request failed'), { status: response.status });
    window.dispatchEvent(new CustomEvent('api-error', { detail: error }));
    throw error;
  }
  return data;
}

const post = (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) });

/** Absolute API origin for desktop (empty on web — use same-origin `/api`). */
export function apiOrigin() {
  return API_ORIGIN;
}

/**
 * Low-level `/api` fetch for callers that need the raw Response (e.g. address suggest).
 * Applies desktop Bearer + X-Client when in the Electron shell.
 */
export async function fetchApi(path, options = {}) {
  const apiPath = path.startsWith('/') ? path : `/${path}`;
  const headers = new Headers(options.headers || {});
  if (desktop) {
    const auth = await desktopAuthHeaders();
    for (const [key, value] of Object.entries(auth)) headers.set(key, value);
  }
  const url = API_ORIGIN ? `${API_ORIGIN}/api${apiPath}` : `/api${apiPath}`;
  /** @type {RequestInit} */
  const fetchOptions = desktop
    ? { ...options, headers }
    : { credentials: 'same-origin', ...options, headers };
  return fetch(url, fetchOptions);
}

/** Server caps page size at 500; larger requests are fetched in pages. */
const PAGE_SIZE_MAX = 500;

const entity = name => ({
  async filter(filters = {}, sort = '-created_date', limit = 200) {
    const pageSize = Math.min(Math.max(1, Number(limit) || 200), PAGE_SIZE_MAX);
    const records = [];
    for (let offset = 0; ; offset += pageSize) {
      const params = new URLSearchParams({ ...filters, sort, limit: String(pageSize), offset: String(offset) });
      const page = await request(`/entities/${name}?${params}`);
      records.push(...page);
      if (page.length < pageSize) return records;
    }
  },
  list(sort = '-created_date', limit = 200) { return this.filter({}, sort, limit); },
  /** Fetch every record (pages of 500 until exhausted). */
  listAll(sort = '-updated_date') { return this.filter({}, sort, PAGE_SIZE_MAX); },
  get(id) { return request(`/entities/${name}/${encodeURIComponent(id)}`); },
  create(data) { return post(`/entities/${name}`, data); },
  update(id, data) { return request(`/entities/${name}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }); },
  delete(id) { return request(`/entities/${name}/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
});

export const api = {
  entities: {
    Client: entity('Client'),
    Job: entity('Job'),
    TimelineEntry: entity('TimelineEntry'),
    CompanyProfile: entity('CompanyProfile'),
    Estimate: entity('Estimate'),
    MaterialOrder: entity('MaterialOrder'),
    WorkItem: entity('WorkItem'),
    ChangeOrder: entity('ChangeOrder'),
    Invoice: entity('Invoice'),
    PunchList: entity('PunchList'),
    Expense: entity('Expense'),
    TreeInventory: entity('TreeInventory'),
    Crew: entity('Crew'),
  },
  members: {
    list() { return request('/members'); },
    invite(data) { return post('/members/invite', data); },
    updateRole(userId, role) {
      return request(`/members/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
    },
    remove(userId) {
      return request(`/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    },
  },
  punchList: {
    complete(id, data) { return post(`/punch-list/${encodeURIComponent(id)}/complete`, data); },
  },
  catalog: {
    search(filters = {}) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value != null && value !== '' && value !== 'all') params.set(key, String(value));
      }
      return request(`/catalog?${params}`);
    },
  },
  workTypes: {
    list() { return request('/work-types'); },
  },
  estimates: {
    sendSign(id, data) { return post(`/estimates/${encodeURIComponent(id)}/send-sign`, data); },
  },
  changeOrders: {
    sendSign(id, data) { return post(`/change-orders/${encodeURIComponent(id)}/send-sign`, data); },
  },
  invoices: {
    fromJob(jobId) { return post('/invoices/from-job', { job_id: jobId }); },
  },
  documents: {
    void(entity, id) { return post(`/documents/${encodeURIComponent(entity)}/${encodeURIComponent(id)}/void`, {}); },
    revise(entity, id) { return post(`/documents/${encodeURIComponent(entity)}/${encodeURIComponent(id)}/revise`, {}); },
    /** Owner's status override for an Estimate / Change Order — no signature needed. */
    setStatus(entity, id, status) { return post(`/documents/${encodeURIComponent(entity)}/${encodeURIComponent(id)}/status`, { status }); },
  },
  /** Derived money per job (server/summary.js), incl. running_total_cents. */
  summaries: {
    all() { return request('/summaries'); },
    job(id) { return request(`/jobs/${encodeURIComponent(id)}/summary`); },
  },
  jobs: {
    authorizedTotal(id) { return request(`/jobs/${encodeURIComponent(id)}/authorized-total`); },
  },
  sign: {
    get(token) { return request(`/sign/${encodeURIComponent(token)}`); },
    submit(token, data) { return post(`/sign/${encodeURIComponent(token)}`, data); },
  },
  auth: {
    me: () => request('/auth/me'),
    async loginViaEmailPassword(email, password) {
      const data = await post('/auth/login', {
        email,
        password,
        ...(desktop ? { client: 'desktop' } : {}),
      });
      if (desktop) {
        if (!data.token) throw new Error('Server did not return a session token for desktop login');
        await setDesktopSessionToken(data.token);
      }
      return data;
    },
    async register(payload) {
      const data = await post('/auth/register', {
        ...payload,
        ...(desktop ? { client: 'desktop' } : {}),
      });
      if (desktop) {
        if (!data.token) throw new Error('Server did not return a session token for desktop register');
        await setDesktopSessionToken(data.token);
      }
      return data;
    },
    async logout() {
      try {
        await post('/auth/logout', {});
      } finally {
        if (desktop) await clearDesktopSessionToken();
      }
    },
    async deleteAccount(password) {
      try {
        await request('/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) });
      } finally {
        if (desktop) await clearDesktopSessionToken();
      }
    },
    resetPasswordRequest: email => post('/auth/forgot-password', { email }),
    resetPassword: data => post('/auth/reset-password', data),
  },
  async uploadFile({ file }) {
    const form = new FormData(); form.append('file', await preparePhoto(file));
    return request('/files', { method: 'POST', body: form });
  },
};
