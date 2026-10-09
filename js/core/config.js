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
  if (cfg.testMode === true && cfg.paymentsEnabled === true) {
    errors.push('paymentsEnabled must be false while testMode is true');
  }
  return errors;
}

// In test mode every user is on the free plan regardless of stored plan.
export function effectivePlan(user, cfg) {
  if (cfg.testMode) return 'free';
  return user && user.plan === 'subscriber' ? 'subscriber' : 'free';
}

export function paymentsActive(cfg) {
  return cfg.paymentsEnabled === true && cfg.testMode !== true;
}
