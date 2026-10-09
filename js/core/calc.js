// Data-driven calculators (data/formulas/*.json). Pure functions, no DOM.
import { compute } from './expr.js';

export function validateInputs(def, raw) {
  const values = {};
  const errors = [];
  for (const input of def.inputs) {
    const v = raw[input.id];
    if (v === undefined || v === null || v === '') {
      errors.push({ input: input.id, code: 'required' });
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) {
      errors.push({ input: input.id, code: 'notNumber' });
      continue;
    }
    if (input.type === 'select') {
      if (!input.options.some((o) => o.value === n)) errors.push({ input: input.id, code: 'invalidOption' });
    } else if ((input.min !== undefined && n < input.min) || (input.max !== undefined && n > input.max)) {
      errors.push({ input: input.id, code: 'outOfRange', min: input.min, max: input.max });
    }
    values[input.id] = n;
  }
  return { values, errors };
}

// Outputs may reference inputs and earlier outputs.
export function runCalculator(def, raw) {
  const { values, errors } = validateInputs(def, raw);
  if (errors.length) return { ok: false, errors, outputs: {} };
  const scope = { ...values };
  const outputs = {};
  for (const out of def.outputs) {
    const v = compute(out.expr, scope);
    if (!Number.isFinite(v)) return { ok: false, errors: [{ output: out.id, code: 'notFinite' }], outputs };
    scope[out.id] = v;
    outputs[out.id] = v;
  }
  return { ok: true, errors: [], outputs, inputs: values };
}

export function roundTo(value, decimals = 0) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

// A norm applies when every key in `when` equals the corresponding input.
export function findNorm(norms = [], outputId, inputs = {}) {
  return norms.find((n) => n.output === outputId
    && Object.entries(n.when || {}).every(([k, v]) => inputs[k] === v)) || null;
}

export function normStatus(norm, value) {
  if (!norm) return null;
  if (norm.low !== undefined && (norm.lowExclusive ? value <= norm.low : value < norm.low)) return 'low';
  if (norm.high !== undefined && value > norm.high) return 'high';
  return 'normal';
}

// Reference examples stored with each calculator. A result outside
// `tolerance` (absolute) is a failure.
export function runReferenceTests(def) {
  return (def.tests || []).flatMap((t, index) => {
    const result = runCalculator(def, t.inputs);
    return Object.entries(t.expected).map(([outputId, expected]) => {
      const actual = result.outputs[outputId];
      const pass = result.ok && Math.abs(actual - expected) <= t.tolerance;
      return { calculator: def.id, index, outputId, expected, actual, tolerance: t.tolerance, pass };
    });
  });
}
