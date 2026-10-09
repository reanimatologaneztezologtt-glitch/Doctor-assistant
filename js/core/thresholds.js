// Clinical cut-offs (data/thresholds.json) and admin overrides.
// The published value stays the reference; an admin may set another value
// only inside the allowed range and keeping the order constraints.

export function thresholdValues(catalog, overrides = {}) {
  const out = {};
  for (const t of catalog.thresholds) out[t.id] = t.id in overrides ? overrides[t.id] : t.value;
  return out;
}

export function allowedRange(t, maxDeviationPct) {
  const d = Math.abs(t.value) * (maxDeviationPct / 100);
  const f = 10 ** (t.decimals ?? 2);
  return { min: Math.round((t.value - d) * f) / f, max: Math.round((t.value + d) * f) / f };
}

// Returns [] when the change is allowed, otherwise error objects.
export function validateThreshold(catalog, values, id, value, maxDeviationPct) {
  const t = catalog.thresholds.find((x) => x.id === id);
  if (!t) return [{ code: 'notFound' }];
  if (typeof value !== 'number' || !Number.isFinite(value)) return [{ code: 'notNumber' }];
  const { min, max } = allowedRange(t, maxDeviationPct);
  if (value < min || value > max) return [{ code: 'outOfBounds', min, max }];
  const next = { ...values, [id]: value };
  const errors = [];
  for (const [a, b] of catalog.order) {
    if ((a === id || b === id) && !(next[a] < next[b])) errors.push({ code: 'orderViolation', lower: a, upper: b });
  }
  return errors;
}

// Replaces threshold ids in norms ({low: "lvef_low_m"}) with numbers.
function resolveNorms(norms, values) {
  return (norms || []).map((n) => {
    const out = { ...n };
    for (const b of ['low', 'high']) {
      if (typeof n[b] === 'string') {
        out[b] = values[n[b]];
        out[`${b}Id`] = n[b];
      }
    }
    return out;
  });
}

export function resolveParameters(parameters, values) {
  return {
    ...parameters,
    sections: parameters.sections.map((s) => ({
      ...s,
      parameters: s.parameters.map((p) => (p.norms ? { ...p, norms: resolveNorms(p.norms, values) } : p)),
    })),
  };
}

export function resolveFormula(def, values) {
  return { ...def, norms: resolveNorms(def.norms, values) };
}

export function changedIds(catalog, values) {
  return new Set(catalog.thresholds.filter((t) => values[t.id] !== t.value).map((t) => t.id));
}

// ---- other admin-editable settings -------------------------------------------
export const PLAN_FIELDS = {
  dailyRequests: { min: 1, max: 1000, integer: true },
  maxTokens: { min: 1000, max: 16000, integer: true },
  price: { min: 0, max: 100000000, integer: true },
  status: { values: ['active', 'paused', 'cancelled'] },
};

// paymentsEnabled stays locked: provider adapters are stubs.
export const CONFIG_FIELDS = {
  aiEnabled: { type: 'boolean' },
  testMode: { type: 'boolean' },
};

export function validatePlanField(plans, planId, field, value) {
  const plan = plans.plans.find((p) => p.id === planId);
  const spec = PLAN_FIELDS[field];
  if (!plan || !spec) return [{ code: 'notFound' }];
  if (spec.values) return spec.values.includes(value) ? [] : [{ code: 'badValue' }];
  if (typeof value !== 'number' || !Number.isFinite(value) || (spec.integer && !Number.isInteger(value))) return [{ code: 'notNumber' }];
  if (value < spec.min || value > spec.max) return [{ code: 'outOfBounds', min: spec.min, max: spec.max }];
  if (planId === 'free' && field === 'price' && value !== 0) return [{ code: 'outOfBounds', min: 0, max: 0 }];
  return [];
}

export function validateConfigField(field, value) {
  const spec = CONFIG_FIELDS[field];
  if (!spec) return [{ code: 'locked' }];
  return typeof value === 'boolean' ? [] : [{ code: 'badValue' }];
}

// Overrides are stored as documents { id: "<kind>:<path>", value, ... }.
export function splitOverrides(docs) {
  const out = { thresholds: {}, plans: {}, config: {} };
  for (const d of docs) {
    const [kind, ...rest] = d.id.split(':');
    if (kind === 'threshold') out.thresholds[rest[0]] = d.value;
    else if (kind === 'plan') (out.plans[rest[0]] ||= {})[rest[1]] = d.value;
    else if (kind === 'config') out.config[rest[0]] = d.value;
  }
  return out;
}

export function applyPlanOverrides(plans, overrides) {
  return { ...plans, plans: plans.plans.map((p) => ({ ...p, ...(overrides[p.id] || {}) })) };
}
