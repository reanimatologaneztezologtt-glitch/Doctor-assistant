import { el } from '../ui/dom.js';
import { alertBox, errorText } from './common.js';

export async function renderPlans(ctx) {
  const { t, data, user, fmt } = ctx;
  const info = await ctx.api.plans();
  const msg = el('div', { role: 'status' });
  const current = user ? user.effectivePlan : null;

  const rows = info.plans.map((p) => el('tr', {}, [
    el('th', { scope: 'row', text: t(`plans.${p.id}.name`) }),
    el('td', { text: p.period ? t(`periods.${p.period}`) : '—' }),
    el('td', { text: `${fmt.number(p.price, 0)} ${data.plans.currency}` }),
    el('td', { text: fmt.number(p.dailyRequests, 0) }),
    el('td', { text: fmt.number(p.maxTokens, 0) }),
    el('td', { text: t(`planStatus.${p.status}`) }),
    el('td', {}, [p.id === current
      ? el('strong', { text: t('plans.current') })
      : p.id === 'free' ? '' : el('button', {
        type: 'button', class: 'btn btn--small', text: t('plans.subscribe'),
        onclick: async () => {
          msg.replaceChildren();
          try {
            await ctx.api.startCheckout(p.id, data.providers.providers[0].id);
          } catch (e) {
            msg.append(alertBox(errorText(t, e), e.code === 'paymentsDisabled' ? 'info' : 'error'));
          }
        },
      })]),
  ]));

  const sub = user && user.subscription;
  return [
    el('h1', { text: t('nav.plans') }),
    info.testMode ? alertBox(t('ui.testMode'), 'info') : null,
    el('p', { class: 'lead', text: t('plans.intro') }),
    user ? el('p', { text: t('plans.yourPlan', { plan: t(`plans.${current}.name`) }) }) : null,
    el('div', { class: 'table-wrap' }, [el('table', {}, [
      el('caption', { class: 'visually-hidden', text: t('nav.plans') }),
      el('thead', {}, [el('tr', {}, ['plans.col.name', 'plans.col.period', 'plans.col.price', 'plans.col.limit', 'plans.col.maxTokens', 'plans.col.status', 'plans.col.action'].map((k) => el('th', { scope: 'col', text: t(k) })))]),
      el('tbody', {}, rows),
    ])]),
    msg,
    sub && sub.status === 'active' ? el('button', {
      type: 'button', class: 'btn', text: t('plans.cancel'),
      onclick: async () => {
        try { await ctx.api.cancelSubscription(); await ctx.refreshUser(); } catch (e) { msg.replaceChildren(alertBox(errorText(t, e))); }
      },
    }) : null,
    el('p', { class: 'text-muted', text: t('plans.cancelRule') }),
    el('section', { class: 'card' }, [
      el('h2', { text: t('plans.providers') }),
      el('p', { class: 'text-muted', text: info.paymentsEnabled ? t('plans.providersOn') : t('plans.providersOff') }),
      el('ul', { class: 'list' }, data.providers.providers.map((p) => el('li', { text: `${p.id === 'intl_card' ? t('plans.intlCard') : p.name} — ${t('plans.notConnected')}` }))),
      el('p', { class: 'text-muted', text: t('plans.cardDataNote') }),
    ]),
  ];
}
