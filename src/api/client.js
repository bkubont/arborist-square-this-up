import { preparePhoto } from '@/lib/preparePhoto';
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options,
      headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' } });
  } catch {
    const error = new Error('Could not reach the server. Check your connection and try again.');
    window.dispatchEvent(new CustomEvent('api-error', { detail: error }));
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = Object.assign(new Error(data.message || 'Request failed'), { status: response.status });
    window.dispatchEvent(new CustomEvent('api-error', { detail: error }));
    throw error;
  }
  return data;
}
const post = (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) });
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
    Expense: entity('Expense'),
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
    loginViaEmailPassword: (email, password) => post('/auth/login', { email, password }),
    register: data => post('/auth/register', data),
    logout: () => post('/auth/logout', {}),
    resetPasswordRequest: email => post('/auth/forgot-password', { email }),
    resetPassword: data => post('/auth/reset-password', data),
  },
  async uploadFile({ file }) {
    const form = new FormData(); form.append('file', await preparePhoto(file));
    return request('/files', { method: 'POST', body: form });
  },
};
