// Measurements entered on the echo page, plus values derived from them
// (data/parameters.json `derive`). Stay in the browser only.
import { compute, parse, variables } from './expr.js';

export function allParameters(catalog) {
  return catalog.sections.flatMap((s) => s.parameters);
}

export function computeMeasurements(catalog, raw, thresholds = {}) {
  const values = {};
  const derived = new Set();
  for (const [k, v] of Object.entries(raw)) {
    if (v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))) values[k] = Number(v);
  }
  // Parameters may depend on other derived ones; repeat until stable.
  const params = allParameters(catalog).filter((p) => p.derive);
  for (let pass = 0; pass < params.length + 1; pass++) {
    let changed = false;
    for (const p of params) {
      if (derived.has(p.id)) continue;
      const vars = [...variables(parse(p.derive))];
      if (vars.every((v) => v in values || v in thresholds)) {
        const v = compute(p.derive, { ...thresholds, ...values });
        if (Number.isFinite(v)) {
          values[p.id] = v;
          derived.add(p.id);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return { values, derived };
}

export function paramNorm(param, sex) {
  const norms = param.norms || [];
  return norms.find((n) => n.sex === sex) || norms.find((n) => n.sex === undefined) || null;
}

export function paramStatus(param, value, sex) {
  const n = paramNorm(param, sex);
  if (!n || value === undefined) return null;
  if (n.low !== undefined && (n.lowExclusive ? value <= n.low : value < n.low)) return 'low';
  if (n.high !== undefined && value > n.high) return 'high';
  return 'normal';
}
