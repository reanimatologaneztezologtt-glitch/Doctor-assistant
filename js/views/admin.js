import { el, chip } from '../ui/dom.js';
import { alertBox, errorText, formatDate, sourceShort, specialtyName } from './common.js';
import { deciderLabel, ruleDecisionButtons, ruleStatusChip } from './conclusion.js';
import { renderLimits } from './admin-limits.js';

const KINDS = ['', 'verification', 'approval', 'settings', 'registration', 'answer', 'payment', 'admin'];

export async function renderAdmin(ctx) {
  const { t, user, data } = ctx;
  const head = [el('h1', { text: t('nav.admin') })];
  if (!user || !user.isAdmin) return [...head, alertBox(t('errors.forbidden'))];
  const users = await ctx.api.listUsers();
  const msg = el('div', { role: 'status' });

  const act = (id, action) => async () => {
    try {
      await ctx.api.verifyDoctor(id, action, '');
      ctx.rerender();
    } catch (e) {
      msg.replaceChildren(alertBox(errorText(t, e)));
    }
  };

  const usersTable = el('div', { class: 'table-wrap' }, [el('table', {}, [
    el('caption', { text: t('admin.users') }),
    el('thead', {}, [el('tr', {}, ['account.fullName', 'account.email', 'account.role', 'account.specialty', 'account.institution', 'admin.license', 'account.status', 'account.action'].map((k) => el('th', { scope: 'col', text: t(k) })))]),
    el('tbody', {}, users.map((u) => el('tr', {}, [
      el('td', { text: u.fullName }),
      el('td', { text: u.email }),
      el('td', { text: `${t(`roles.${u.role}`)}${u.isAdmin ? ` + ${t('account.adminFlag')}` : ''}` }),
      el('td', { text: u.role === 'student' ? t(`studyDirections.${u.studyDirection}`) : specialtyName(ctx, u.specialty) }),
      el('td', { text: u.institution }),
      el('td', { text: u.licenseNumber }),
      el('td', {}, [chip(t(`verification.${u.verification}`), u.verification === 'approved' ? 'ok' : u.verification === 'pending' ? 'warn' : 'neutral')]),
      el('td', {}, u.role === 'doctor' ? [el('span', { class: 'btn-group' }, [
        u.verification !== 'approved' ? el('button', { type: 'button', class: 'btn btn--small', text: t('admin.approve'), onclick: act(u.id, 'approve') }) : null,
        u.verification !== 'rejected' ? el('button', { type: 'button', class: 'btn btn--small', text: t('admin.reject'), onclick: act(u.id, 'reject') }) : null,
        u.verification !== 'pending' ? el('button', { type: 'button', class: 'btn btn--small', text: t('admin.revoke'), onclick: act(u.id, 'revoke') }) : null,
      ])] : []),
    ]))),
  ])]);

  const kindSelect = el('select', { id: 'journal-kind' }, KINDS.map((k) => el('option', { value: k, text: k ? t(`journal.${k}`) : t('journal.all') })));
  const journalBox = el('div');
  async function drawJournal() {
    const entries = await ctx.api.journal(kindSelect.value || undefined);
    journalBox.replaceChildren(entries.length ? el('div', { class: 'table-wrap' }, [el('table', {}, [
      el('thead', {}, [el('tr', {}, ['journal.date', 'journal.kind', 'journal.details'].map((k) => el('th', { scope: 'col', text: t(k) })))]),
      el('tbody', {}, entries.slice(0, 200).map((j) => {
        const { id, kind, at, ...rest } = j;
        return el('tr', {}, [el('td', { text: formatDate(ctx, at) }), el('td', { text: t(`journal.${kind}`) }), el('td', {}, [el('code', { text: JSON.stringify(rest) })])]);
      })),
    ])]) : el('p', { class: 'text-muted', text: t('journal.empty') }));
  }
  kindSelect.addEventListener('change', drawJournal);
  await drawJournal();

  // Medical decisions: the admin may approve, reject or revoke any rule decision.
  const [statuses, decisions] = await Promise.all([ctx.api.ruleStatuses(), ctx.api.ruleDecisions()]);
  const rulesTable = el('div', { class: 'table-wrap' }, [el('table', {}, [
    el('caption', { text: t('admin.decisions') }),
    el('thead', {}, [el('tr', {}, ['admin.rule', 'rule.specialty', 'ui.source', 'account.status', 'account.action'].map((k) => el('th', { scope: 'col', text: t(k) })))]),
    el('tbody', {}, data.rules.rules.map((r) => el('tr', {}, [
      el('td', { text: t(`rules.${r.id}`) }),
      el('td', { text: specialtyName(ctx, r.specialty) }),
      el('td', { text: sourceShort(ctx, r.sourceId) }),
      el('td', {}, [ruleStatusChip(ctx, statuses[r.id])]),
      el('td', {}, [ruleDecisionButtons(ctx, r.id, statuses[r.id], () => ctx.rerender())]),
    ]))),
  ])]);
  const history = decisions.length ? el('div', { class: 'table-wrap' }, [el('table', {}, [
    el('caption', { text: t('admin.decisionsHistory') }),
    el('thead', {}, [el('tr', {}, ['journal.date', 'admin.rule', 'admin.decision', 'admin.decidedBy'].map((k) => el('th', { scope: 'col', text: t(k) })))]),
    el('tbody', {}, decisions.slice(0, 200).map((d) => el('tr', {}, [
      el('td', { text: formatDate(ctx, d.at) }),
      el('td', {}, [el('code', { text: d.ruleId })]),
      el('td', { text: t(`admin.action.${d.action}`) }),
      el('td', { text: deciderLabel(ctx, d) }),
    ]))),
  ])]) : el('p', { class: 'text-muted', text: t('journal.empty') });

  return [
    ...head,
    el('p', { class: 'text-muted', text: t('admin.note') }),
    msg,
    el('section', { class: 'card' }, [usersTable]),
    el('section', { class: 'card' }, [el('p', { class: 'text-muted', text: t('admin.decisionsNote') }), rulesTable, history]),
    el('section', { class: 'card' }, [
      el('h2', { text: t('admin.journal') }),
      el('label', { for: 'journal-kind', text: t('journal.filter') }), kindSelect,
      journalBox,
    ]),
    renderLimits(ctx),
  ];
}
