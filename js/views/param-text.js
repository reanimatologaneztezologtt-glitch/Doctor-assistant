// Shared text for a parameter: numeric line, word line, norm line.
import { paramNorm, paramStatus } from '../core/measurements.js';
import { roundTo } from '../core/calc.js';
import { el, chip } from '../ui/dom.js';

export function paramName(ctx, id) {
  return ctx.t(`params.${id}.name`);
}
export function paramAbbr(ctx, id) {
  return ctx.t(`params.${id}.abbr`);
}

// " — changed by admin (published: 52–72%)" when a bound differs from the source.
export function normChangedNote(ctx, norm, unit) {
  const ids = [norm.lowId, norm.highId].filter(Boolean);
  if (!ids.some((id) => ctx.thrChanged.has(id))) return '';
  const published = {};
  for (const b of ['low', 'high']) {
    const id = norm[`${b}Id`];
    if (id) published[b] = ctx.base.thresholds.thresholds.find((x) => x.id === id).value;
  }
  const src = ctx.fmt.normRange({ ...norm, ...published }, unit, 2);
  return ` — ${ctx.t('norm.changedByAdmin', { published: src })}`;
}

export function normLine(ctx, param, sex) {
  const { t, fmt } = ctx;
  const norm = paramNorm(param, sex);
  if (!norm) return t('norm.none');
  const range = fmt.normRange(norm, param.unit, 2);
  const who = norm.sex ? ` (${fmt.sexLabel(norm.sex)})` : '';
  return `${t('norm.label')} ${range}${who}${normChangedNote(ctx, norm, param.unit)}`;
}

// "ФВ = 58%, меъёр 52–72% (эркаклар)" and "Ejection fraction: 58 percent".
export function valueLines(ctx, param, value, sex) {
  const { fmt } = ctx;
  const shown = `${paramAbbr(ctx, param.id)} = ${fmt.withUnit(value, param.unit, param.decimals ?? 1)}`;
  const numeric = paramNorm(param, sex) ? `${shown}, ${normLine(ctx, param, sex)}` : shown;
  const d = param.decimals ?? 1;
  const words = `${paramName(ctx, param.id)}: ${fmt.number(value, d)} ${fmt.unitWords(roundTo(value, d), param.unit)}`.trim();
  return { numeric, words };
}

export function statusChip(ctx, param, value, sex) {
  const status = paramStatus(param, value, sex);
  if (!status) return null;
  return chip(ctx.t(`status.${status}`), status === 'normal' ? 'ok' : 'warn');
}

export function wordsLine(ctx, text) {
  return el('p', { class: 'words', text });
}
