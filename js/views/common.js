import { el } from '../ui/dom.js';

export function errorText(t, err) {
  const code = err && err.code ? err.code : 'generic';
  const msg = t(`errors.${code}`);
  return msg.startsWith('[') ? t('errors.generic') : msg;
}

export function fieldErrors(err) {
  const out = {};
  if (err && err.code === 'validation' && Array.isArray(err.details)) {
    for (const d of err.details) out[d.field] = d.code;
  }
  return out;
}

export function alertBox(text, kind = 'error') {
  return el('p', { class: `alert alert--${kind}`, role: kind === 'error' ? 'alert' : 'status', text });
}

export function signInPrompt(ctx) {
  return el('div', { class: 'card' }, [
    el('p', { text: ctx.t('account.signInRequired') }),
    el('a', { class: 'btn btn--primary', href: '#account', text: ctx.t('account.signIn') }),
  ]);
}

export function sourceShort(ctx, id) {
  const s = ctx.data.sources.sources.find((x) => x.id === id);
  return s ? s.short : id;
}

export function sourceCitation(ctx, id) {
  const s = ctx.data.sources.sources.find((x) => x.id === id);
  return s ? s.citation : ctx.t('ui.sourceNotFound');
}

export function sourceLine(ctx, ids) {
  return el('p', { class: 'source' }, [
    el('span', { class: 'source__label', text: `${ctx.t('ui.source')}: ` }),
    [].concat(ids).map((id) => sourceShort(ctx, id)).join('; '),
  ]);
}

export function specialtyName(ctx, id) {
  return id ? ctx.t(`specialties.${id}`) : '—';
}

export function formatDate(ctx, iso) {
  try {
    return new Intl.DateTimeFormat(ctx.t('meta.htmlLang'), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}
