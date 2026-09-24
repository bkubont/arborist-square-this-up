/**
 * Estimate labor / parts / hours for job cards (kanban, lists).
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
  let labor = 0;
  let parts = 0;
  let hours = 0;
  for (const line of lines) {
    labor += Number(line.labor_amount) || 0;
    parts += Number(line.material_amount) || 0;
    hours += Number(line.labor_hours) || 0;
  }

  const fromLines = labor + parts;
  const total =
    est?.accepted_snapshot?.total ??
    est?.total ??
    (fromLines > 0 ? fromLines : Number(job?.estimate_amount) || 0);

  return {
    labor,
    parts,
    hours,
    total,
    hasEstimate: Boolean(est) || Number(job?.estimate_amount) > 0,
    hasLineSplit: fromLines > 0,
  };
}
