// Rule engine for draft conclusions (data/rules.json). A rule fires when all
// required measurements are present and its `when` expression is true.
// Cut-offs in `when` are names from data/thresholds.json (`thresholds`).
import { compute, parse, variables } from './expr.js';

export function evaluateRules(rules, values, thresholds = {}) {
  const findings = [];
  for (const rule of rules) {
    const missing = rule.requires.filter((id) => !(id in values));
    if (missing.length) continue;
    if (compute(rule.when, { ...thresholds, ...values })) {
      findings.push({
        ruleId: rule.id,
        specialty: rule.specialty,
        sourceId: rule.sourceId,
        textKey: rule.textKey,
        severity: rule.severity,
        thresholdIds: [...variables(parse(rule.when))].filter((v) => v in thresholds),
        evidence: rule.requires.filter((id) => id !== 'sex').map((id) => ({ id, value: values[id] })),
      });
    }
  }
  return findings;
}

export function requiredSpecialties(findings) {
  return [...new Set(findings.map((f) => f.specialty))];
}
