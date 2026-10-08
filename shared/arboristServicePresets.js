/**
 * Default arborist / tree-service estimate presets (rate-card seeds).
 * CompanyProfile.service_presets stores the editable copy per account.
 */

/** @typedef {{ id: string, name: string, description: string, category: string, labor_amount?: number, material_amount?: number, equipment_amount?: number, labor_hours?: number, labor_rate?: number }} ServicePreset */

export const DEFAULT_ARBORIST_LABOR_RATE = 85;

/** @type {ServicePreset[]} */
export const DEFAULT_ARBORIST_SERVICE_PRESETS = [
  {
    id: 'prune-crown',
    name: 'Crown pruning',
    description: 'Selective crown pruning to ANSI A300 guidelines',
    category: 'Pruning',
    labor_amount: 450,
    labor_hours: 4,
    labor_rate: DEFAULT_ARBORIST_LABOR_RATE,
  },
  {
    id: 'prune-deadwood',
    name: 'Deadwood removal',
    description: 'Remove dead and hazardous limbs',
    category: 'Pruning',
    labor_amount: 320,
    labor_hours: 3,
    labor_rate: DEFAULT_ARBORIST_LABOR_RATE,
  },
  {
    id: 'removal-standard',
    name: 'Tree removal',
    description: 'Sectional felling / crane assist as needed; leave stump',
    category: 'Removal',
    labor_amount: 1800,
    equipment_amount: 400,
    labor_hours: 8,
    labor_rate: DEFAULT_ARBORIST_LABOR_RATE,
  },
  {
    id: 'stump-grind',
    name: 'Stump grinding',
    description: 'Grind stump below grade; backfill chips',
    category: 'Stump',
    labor_amount: 285,
    equipment_amount: 75,
    labor_hours: 1.5,
    labor_rate: DEFAULT_ARBORIST_LABOR_RATE,
  },
  {
    id: 'haul-disposal',
    name: 'Haul and disposal',
    description: 'Chip / load debris and haul to disposal',
    category: 'Haul',
    labor_amount: 250,
    material_amount: 80,
    labor_hours: 2,
    labor_rate: DEFAULT_ARBORIST_LABOR_RATE,
  },
  {
    id: 'crane-day',
    name: 'Crane day',
    description: 'Mobile crane day rate for complex removals',
    category: 'Equipment',
    equipment_amount: 2200,
    labor_hours: 8,
    labor_rate: DEFAULT_ARBORIST_LABOR_RATE,
  },
  {
    id: 'cabling-bracing',
    name: 'Cabling / bracing',
    description: 'Structural support cable or brace install',
    category: 'Support',
    labor_amount: 650,
    material_amount: 180,
    labor_hours: 4,
    labor_rate: DEFAULT_ARBORIST_LABOR_RATE,
  },
  {
    id: 'phc-treatment',
    name: 'Plant health care treatment',
    description: 'Soil injection / foliar PHC application',
    category: 'PHC',
    labor_amount: 175,
    material_amount: 95,
    labor_hours: 1,
    labor_rate: DEFAULT_ARBORIST_LABOR_RATE,
  },
  {
    id: 'storm-emergency',
    name: 'Emergency / storm call-out',
    description: 'After-hours storm response; hazard mitigation',
    category: 'Storm',
    labor_amount: 950,
    equipment_amount: 200,
    labor_hours: 6,
    labor_rate: 125,
  },
];

/** Species presets for tree inventory free-text helpers. */
export const COMMON_TREE_SPECIES = [
  'Oak',
  'Maple',
  'Pine',
  'Elm',
  'Ash',
  'Birch',
  'Cedar',
  'Spruce',
  'Hickory',
  'Walnut',
  'Sweetgum',
  'Tulip poplar',
  'Sycamore',
  'Magnolia',
  'Dogwood',
  'Unknown',
];

export const TREE_CONDITIONS = ['healthy', 'fair', 'poor', 'dead', 'hazardous', 'unknown'];

export const TREE_RECOMMENDED_WORK = [
  'prune',
  'removal',
  'stump_grind',
  'haul',
  'cabling',
  'phc',
  'monitor',
  'storm_mitigation',
];

/** Method / equipment needs for a tree or work area (PDF §2). */
export const TREE_METHOD_NEEDS = [
  'climbing',
  'lift',
  'rigging',
  'crane',
  'chipper',
  'grinder',
  'traffic_control',
  'rental',
  'subcontractor',
];

export const JOB_TYPES = ['residential', 'commercial', 'municipal', 'storm', 'other'];

/** Contact roles on a customer (owner / tenant / site / billing). */
export const CLIENT_CONTACT_ROLES = ['owner', 'tenant', 'site', 'billing', 'other'];

/** Preferred ways to reach the customer. */
export const CLIENT_CONTACT_METHODS = ['phone', 'email', 'text', 'any'];

/**
 * Catalog-shaped rows so /api/catalog and CatalogTypeahead keep working.
 * @returns {{ version: number, source: string, default_labor_rate: number, market?: string, categories: string[], items: object[], materials?: object[] }}
 */
export function arboristCatalogPayload() {
  const categories = [...new Set(DEFAULT_ARBORIST_SERVICE_PRESETS.map((p) => p.category))];
  return {
    version: 1,
    source: 'arborist-service-presets',
    default_labor_rate: DEFAULT_ARBORIST_LABOR_RATE,
    market: 'arborist',
    categories,
    items: DEFAULT_ARBORIST_SERVICE_PRESETS.map((p) => {
      const labor = Number(p.labor_amount) || 0;
      const materials = Number(p.material_amount) || 0;
      const equipment = Number(p.equipment_amount) || 0;
      return {
        id: p.id,
        task: p.name,
        category: p.category,
        hours_mid: p.labor_hours ?? null,
        labor_rate: p.labor_rate ?? DEFAULT_ARBORIST_LABOR_RATE,
        est_labor_cost: labor + equipment,
        est_materials_cost: materials,
        ballpark_total: labor + materials + equipment,
        notes: p.description,
        tools: '',
        materials_note: '',
        maintenance: 'Service',
        source: 'arborist',
      };
    }),
    materials: [],
  };
}

/** Deep-clone defaults for seeding CompanyProfile.service_presets. */
export function defaultServicePresetsForProfile() {
  return DEFAULT_ARBORIST_SERVICE_PRESETS.map((p) => ({ ...p }));
}
