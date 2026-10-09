// Pure config helpers (no DOM). Global flags live in config/app.json.

const BOOLEAN_FLAGS = ['testMode', 'paymentsEnabled', 'aiEnabled'];

export function validateConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== 'object') return ['config must be an object'];
  for (const flag of BOOLEAN_FLAGS) {
    if (typeof cfg[flag] !== 'boolean') errors.push(`${flag} must be boolean`);
  }
  if (!Array.isArray(cfg.supportedLanguages) || cfg.supportedLanguages.length === 0) {
    errors.push('supportedLanguages must be a non-empty array');
  } else if (!cfg.supportedLanguages.includes(cfg.defaultLanguage)) {
    errors.push('defaultLanguage must be one of supportedLanguages');
  }
  const pct = cfg.adminLimits && cfg.adminLimits.maxDeviationPct;
  if (typeof pct !== 'number' || pct < 0 || pct > 50) {
    errors.push('adminLimits.maxDeviationPct must be a number from 0 to 50');
  }
  if (cfg.testMode === true && cfg.paymentsEnabled === true) {
    errors.push('paymentsEnabled must be false while testMode is true');
  }
  return errors;
}

// In test mode every user is on the free plan regardless of stored plan.
// A cancelled subscription stays active until the end of its paid period.
export function effectivePlan(user, cfg, now = Date.now()) {
  if (cfg.testMode) return 'free';
  const sub = user && user.subscription;
  if (!sub || !sub.planId) return 'free';
  if (sub.status !== 'active' && sub.status !== 'cancelled') return 'free';
  if (sub.periodEnd && now >= Date.parse(sub.periodEnd)) return 'free';
  return sub.planId;
}

export function paymentsActive(cfg) {
  return cfg.paymentsEnabled === true && cfg.testMode !== true;
}
