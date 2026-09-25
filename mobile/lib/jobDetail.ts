import { api, type JobSummary, type JobAuthorizedTotal, type Payment } from '@/api/client';
import type { JobDoc } from '@/lib/documents';
import type {
  ChangeOrder,
  Client,
  Estimate,
  Invoice,
  Job,
  MaterialOrder,
  TimelineEntry,
  WorkItem,
} from '@/api/client';

export type JobDetailBundle = {
  job: Job;
  client: Client | null;
  entries: TimelineEntry[];
  documents: JobDoc[];
  workItems: WorkItem[];
  materialOrders: MaterialOrder[];
  summary: JobSummary | null;
  authorized: JobAuthorizedTotal | null;
  payments: Payment[];
};

export async function loadJobDetail(jobId: string): Promise<JobDetailBundle> {
  const [
    job,
    timeline,
    estimates,
    invoices,
    changeOrders,
    materialOrders,
    tasks,
    summary,
    authorized,
    payments,
  ] = await Promise.all([
    api.entities.Job.get(jobId),
    api.entities.TimelineEntry.filter({ job_id: jobId }, '-created_date', 500),
    api.entities.Estimate.filter({ job_id: jobId }, '-created_date', 50),
    api.entities.Invoice.filter({ job_id: jobId }, '-created_date', 50),
    api.entities.ChangeOrder.filter({ job_id: jobId }, '-created_date', 100),
    api.entities.MaterialOrder.filter({ job_id: jobId }, '-created_date', 100),
    api.entities.WorkItem.filter({ job_id: jobId }, '-created_date', 500),
    api.summaries.job(jobId).catch(() => null),
    api.jobs.authorizedTotal(jobId).catch(() => null),
    api.entities.Payment.filter({ job_id: jobId }, '-created_date', 200).catch(() => [] as Payment[]),
  ]);

  let client: Client | null = null;
  if (job.client_id) {
    try {
      client = await api.entities.Client.get(job.client_id);
    } catch {
      client = null;
    }
  }

  return {
    job,
    client,
    entries: timeline,
    workItems: tasks,
    materialOrders,
    summary,
    authorized,
    payments,
    documents: [
      ...estimates.map((d: Estimate) => ({ ...d, entity: 'Estimate' as const })),
      ...invoices.map((d: Invoice) => ({ ...d, entity: 'Invoice' as const })),
      ...changeOrders.map((d: ChangeOrder) => ({ ...d, entity: 'ChangeOrder' as const })),
      ...materialOrders.map((d: MaterialOrder) => ({ ...d, entity: 'MaterialOrder' as const })),
    ],
  };
}

export const jobDetailQueryKey = (jobId: string) => ['job-detail', jobId] as const;
