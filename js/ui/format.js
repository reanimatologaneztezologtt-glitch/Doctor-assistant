// Number, unit and reference-value formatting in the active language.
export function createFormatter(t, locale) {
  const plural = new Intl.PluralRules(locale);

  function number(value, decimals = 0) {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(value);
  }

  function unitSymbol(unit) {
    if (!unit || unit === 'ratio') return '';
    return t(`units.${unit}.sym`);
  }

  function withUnit(value, unit, decimals) {
    const sym = unitSymbol(unit);
    const n = number(value, decimals);
    if (!sym) return n;
    return unit === 'pct' ? `${n}${sym}` : `${n} ${sym}`;
  }

  // Unit spelled out ("58 percent", "58 фоиз", "58 процентов").
  function unitWords(value, unit) {
    if (!unit || unit === 'ratio') return '';
    const cat = Number.isInteger(value) ? plural.select(value) : 'other';
    const key = `units.${unit}.${cat}`;
    const word = t(key);
    return word.startsWith('[') ? t(`units.${unit}.other`) : word;
  }

  function normRange(norm, unit, decimals = 2) {
    if (!norm) return '';
    const fmt = (v) => number(v, decimals);
    let text;
    if (norm.low !== undefined && norm.high !== undefined) text = `${fmt(norm.low)}–${fmt(norm.high)}`;
    else if (norm.low !== undefined) text = `${norm.lowExclusive ? '>' : '≥'}${fmt(norm.low)}`;
    else text = `≤${fmt(norm.high)}`;
    const sym = unitSymbol(unit);
    return sym ? (unit === 'pct' ? `${text}${sym}` : `${text} ${sym}`) : text;
  }

  function sexLabel(sex) {
    if (sex === 1) return t('norm.men');
    if (sex === 2) return t('norm.women');
    return '';
  }

  return { number, unitSymbol, withUnit, unitWords, normRange, sexLabel };
}
