/** Default sales tax % for new accounts (mirrors src/lib/salesTax.js). */
export const DEFAULT_SALES_TAX_RATE = 6;

export function resolveSalesTaxRate(
  profile: { default_tax_rate?: number | string | null } | null | undefined,
): number {
  if (profile?.default_tax_rate != null && profile.default_tax_rate !== '') {
    const n = Number(profile.default_tax_rate);
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
  }
  return DEFAULT_SALES_TAX_RATE;
}

type TaxRateApi = {
  entities: {
    CompanyProfile: {
      list: (sort?: string, limit?: number) => Promise<Array<{ default_tax_rate?: number }>>;
    };
  };
};

/** Load company default tax %, falling back to 6%. */
export async function loadAccountTaxRate(apiClient: TaxRateApi): Promise<number> {
  try {
    const rows = await apiClient.entities.CompanyProfile.list('-created_date', 1);
    return resolveSalesTaxRate(rows[0]);
  } catch {
    return DEFAULT_SALES_TAX_RATE;
  }
}
