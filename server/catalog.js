import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const catalogPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'handyman-catalog.json');
let cached;

export function loadCatalog() {
  if (!cached) cached = JSON.parse(readFileSync(catalogPath, 'utf8'));
  return cached;
}

/** Search handyman catalog (Estimate / WO search→fill). */
export function searchCatalog({ q = '', category = '', maintenance = '', source = '', limit = 40 } = {}) {
  const catalog = loadCatalog();
  const query = String(q).trim().toLowerCase();
  const cat = String(category).trim().toLowerCase();
  const maint = String(maintenance).trim().toLowerCase();
  const src = String(source).trim().toLowerCase();
  const max = Math.min(Math.max(Number(limit) || 40, 1), 100);

  const scored = [];
  for (const item of catalog.items) {
    if (cat && !item.category.toLowerCase().includes(cat)) continue;
    if (maint && item.maintenance.toLowerCase() !== maint) continue;
    if (src && item.source !== src) continue;
    if (!query) {
      scored.push({ item, score: 0 });
      continue;
    }
    const hay = `${item.task} ${item.category} ${item.notes} ${item.tools}`.toLowerCase();
    if (!hay.includes(query) && !query.split(/\s+/).every(part => hay.includes(part))) continue;
    const taskMatch = item.task.toLowerCase().startsWith(query) ? 0 : item.task.toLowerCase().includes(query) ? 1 : 2;
    scored.push({ item, score: taskMatch });
  }
  scored.sort((a, b) => a.score - b.score || a.item.task.localeCompare(b.item.task));
  return {
    default_labor_rate: catalog.default_labor_rate,
    categories: catalog.categories,
    total: scored.length,
    items: scored.slice(0, max).map(row => row.item),
  };
}

/** Map a catalog row into an editable Estimate line (Decision #5). */
export function catalogItemToEstimateLine(item) {
  const hours = item.hours_mid ?? null;
  const rate = item.labor_rate ?? 55;
  const labor = item.est_labor_cost ?? (hours != null ? hours * rate : undefined);
  const noteParts = [item.notes, item.tools ? `Tools: ${item.tools}` : ''].filter(Boolean);
  return {
    description: item.task,
    category: item.category || '',
    labor_amount: labor != null ? Math.round(labor * 100) / 100 : undefined,
    labor_hours: hours != null ? hours : undefined,
    labor_rate: rate,
    material_amount: undefined,
    equipment_amount: undefined,
    notes: noteParts.join(' · '),
    tools: item.tools || undefined,
    catalog_id: item.id,
  };
}
