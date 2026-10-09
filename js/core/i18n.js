// Pure i18n helpers (no DOM). Used by the browser app and by tests.

export function getByPath(obj, path) {
  return path.split('.').reduce((node, part) => (node == null ? undefined : node[part]), obj);
}

export function interpolate(template, vars = {}) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match);
}

// Missing keys fall back to `fallback` dictionary, then to the key in brackets
// so that a gap is visible instead of silently empty.
// `defaults` fills placeholders that every text may use (e.g. current cut-offs).
export function createTranslator(dict, fallback = null, onMissing = () => {}, defaults = {}) {
  return function t(key, vars) {
    let value = getByPath(dict, key);
    if (typeof value !== 'string' && fallback) {
      value = getByPath(fallback, key);
    }
    if (typeof value !== 'string') {
      onMissing(key);
      return `[${key}]`;
    }
    return interpolate(value, vars ? { ...defaults, ...vars } : defaults);
  };
}

// Flattened list of leaf keys ("a.b.c"), used to check that languages match.
export function leafKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v !== null && typeof v === 'object' ? leafKeys(v, path) : [path];
  });
}

export function pickLanguage(requested, supported, fallback) {
  if (requested && supported.includes(requested)) return requested;
  return fallback;
}
