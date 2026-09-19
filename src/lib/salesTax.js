/** Account-level sales tax is stored as a percent (e.g. 6 = 6%). */
export const DEFAULT_SALES_TAX_RATE = 6;

/** @param {{ default_tax_rate?: number|string|null }|null|undefined} profile */
export function resolveSalesTaxRate(profile) {
  if (profile?.default_tax_rate != null && profile.default_tax_rate !== "") {
    const n = Number(profile.default_tax_rate);
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
  }
  return DEFAULT_SALES_TAX_RATE;
}

/** Load company default tax %, falling back to 6%. */
export async function loadAccountTaxRate(api) {
  try {
    const rows = await api.entities.CompanyProfile.list("-created_date", 1);
    return resolveSalesTaxRate(rows[0]);
  } catch {
    return DEFAULT_SALES_TAX_RATE;
  }
}
