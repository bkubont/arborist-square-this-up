import { estimateLineAmount } from "@/lib/estimateMath";

/**
 * Estimate hours + whole-line total for job cards (kanban, lists).
 * @param {object} job
 * @param {object[]} estimates
 */
export function jobEstimateRollup(job, estimates = []) {
  const forJob = estimates.filter((e) => e?.job_id === job?.id && e?.status !== "void");
  const est =
    forJob.find((e) => e.status === "accepted" && e.accepted_snapshot) ||
    forJob.find((e) => e.accepted_snapshot) ||
    forJob[0];

  const lines = est?.accepted_snapshot?.lines || est?.lines || [];
  let hours = 0;
  let fromLines = 0;
  for (const line of lines) {
    fromLines += estimateLineAmount(line);
    hours += Number(line.labor_hours) || 0;
  }

  const total =
    est?.accepted_snapshot?.total ??
    est?.total ??
    (fromLines > 0 ? fromLines : Number(job?.estimate_amount) || 0);

  return {
    hours,
    total,
    hasEstimate: Boolean(est) || Number(job?.estimate_amount) > 0,
  };
}
