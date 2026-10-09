import { el, chip, field } from '../ui/dom.js';
import { alertBox, errorText, fieldErrors, formatDate, specialtyName } from './common.js';

function loginForm(ctx, demoFill) {
  const { t } = ctx;
  const email = el('input', { id: 'login-email', type: 'email', autocomplete: 'username', required: true });
  const password = el('input', { id: 'login-password', type: 'password', autocomplete: 'current-password', required: true });
  const msg = el('div', { role: 'status' });
  demoFill.fill = (e) => { email.value = e; password.value = ctx.api.demoPassword; email.focus(); };
  return el('form', {
    class: 'card stack', 'aria-labelledby': 'login-title',
    onsubmit: async (e) => {
      e.preventDefault();
      msg.replaceChildren();
      try {
        await ctx.api.login(email.value, password.value);
        await ctx.refreshUser();
      } catch (err) {
        msg.append(alertBox(errorText(t, err)));
      }
    },
  }, [
    el('h2', { id: 'login-title', text: t('account.login') }),
    field({ label: t('account.email'), input: email }),
    field({ label: t('account.password'), input: password }),
    el('button', { type: 'submit', class: 'btn btn--primary', text: t('account.signIn') }),
    msg,
  ]);
}

function registerForm(ctx) {
  const { t, data } = ctx;
  const form = el('form', { class: 'card stack', 'aria-labelledby': 'reg-title', novalidate: true });
  const values = { role: 'doctor' };
  let errors = {};

  function draw() {
    const inputs = {
      fullName: el('input', { id: 'reg-fullName', autocomplete: 'name', value: values.fullName || '' }),
      email: el('input', { id: 'reg-email', type: 'email', autocomplete: 'email', value: values.email || '' }),
      password: el('input', { id: 'reg-password', type: 'password', autocomplete: 'new-password', value: values.password || '' }),
      role: el('select', { id: 'reg-role' }, ['doctor', 'resident', 'student'].map((r) => el('option', { value: r, text: t(`roles.${r}`) }))),
      specialty: el('select', { id: 'reg-specialty' }, [el('option', { value: '', text: t('ui.choose') }),
        ...data.specialties.specialties.map((s) => el('option', { value: s.id, text: specialtyName(ctx, s.id) }))]),
      studyDirection: el('select', { id: 'reg-studyDirection' }, [el('option', { value: '', text: t('ui.choose') }),
        ...data.specialties.studyDirections.map((s) => el('option', { value: s.id, text: t(`studyDirections.${s.id}`) }))]),
      institution: el('input', { id: 'reg-institution', autocomplete: 'organization', value: values.institution || '' }),
      licenseNumber: el('input', { id: 'reg-licenseNumber', autocomplete: 'off', value: values.licenseNumber || '' }),
      confirmAccurate: el('input', { id: 'reg-confirm', type: 'checkbox' }),
    };
    inputs.role.value = values.role;
    inputs.specialty.value = values.specialty || '';
    inputs.studyDirection.value = values.studyDirection || '';
    inputs.confirmAccurate.checked = values.confirmAccurate === true;
    for (const [k, node] of Object.entries(inputs)) {
      node.addEventListener(node.tagName === 'SELECT' || node.type === 'checkbox' ? 'change' : 'input', () => {
        values[k] = node.type === 'checkbox' ? node.checked : node.value;
        if (k === 'role') draw();
      });
    }
    const err = (f) => (errors[f] ? t(`errors.field.${errors[f]}`) : undefined);
    const msg = el('div', { role: 'status' });
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await ctx.api.register({ ...values, confirmAccurate: values.confirmAccurate === true });
        await ctx.refreshUser();
      } catch (ex) {
        errors = fieldErrors(ex);
        draw();
        form.querySelector('.form-error').replaceChildren(alertBox(errorText(t, ex)));
        const firstBad = form.querySelector('[aria-invalid="true"]');
        if (firstBad) firstBad.focus();
      }
    };
    form.replaceChildren(
      el('h2', { id: 'reg-title', text: t('account.register') }),
      el('p', { class: 'text-muted', text: t('account.registerIntro') }),
      field({ label: t('account.fullName'), input: inputs.fullName, error: err('fullName') }),
      field({ label: t('account.email'), input: inputs.email, error: err('email') }),
      field({ label: t('account.password'), input: inputs.password, hint: t('account.passwordHint'), error: err('password') }),
      field({ label: t('account.role'), input: inputs.role, hint: t('account.roleHint'), error: err('role') }),
      values.role === 'student'
        ? field({ label: t('account.studyDirection'), input: inputs.studyDirection, error: err('studyDirection') })
        : field({ label: t('account.specialty'), input: inputs.specialty, error: err('specialty') }),
      field({ label: t('account.institution'), input: inputs.institution, error: err('institution') }),
      field({ label: values.role === 'doctor' ? t('account.license') : t('account.diploma'), input: inputs.licenseNumber, hint: t('account.licenseHint'), error: err('licenseNumber') }),
      el('div', { class: 'field field--check' }, [
        inputs.confirmAccurate,
        el('label', { for: 'reg-confirm', text: t('account.confirmAccurate') }),
        errors.confirmAccurate ? el('p', { class: 'field__error', role: 'alert', text: t(`errors.field.${errors.confirmAccurate}`) }) : null,
      ]),
      el('div', { class: 'form-error' }),
      el('button', { type: 'submit', class: 'btn btn--primary', text: t('account.createAccount') }),
      msg,
    );
  }
  draw();
  return form;
}

function demoTable(ctx, demoFill) {
  const { t } = ctx;
  return el('section', { class: 'card' }, [
    el('h2', { text: t('account.demoAccounts') }),
    el('p', { class: 'text-muted', text: t('account.demoAccountsHint', { password: ctx.api.demoPassword }) }),
    el('div', { class: 'table-wrap' }, [el('table', {}, [
      el('thead', {}, [el('tr', {}, ['account.email', 'account.role', 'account.specialty', 'account.status', 'account.action'].map((k) => el('th', { scope: 'col', text: t(k) })))]),
      el('tbody', {}, ctx.api.demoAccounts.map((a) => el('tr', {}, [
        el('td', { text: a.email }),
        el('td', { text: `${t(`roles.${a.role}`)}${a.admin ? ` + ${t('account.adminFlag')}` : ''}` }),
        el('td', { text: a.specialty ? specialtyName(ctx, a.specialty) : '—' }),
        el('td', { text: a.role === 'doctor' ? t(`verification.${a.verified ? 'approved' : 'pending'}`) : '—' }),
        el('td', {}, [el('button', { type: 'button', class: 'btn btn--small', text: t('account.useDemo'), onclick: () => demoFill.fill(a.email) })]),
      ]))),
    ])]),
    el('button', { type: 'button', class: 'btn btn--small', text: t('account.resetDemo'), onclick: async () => { ctx.api.resetDemo(); location.reload(); } }),
  ]);
}

export function renderAccount(ctx) {
  const { t, user } = ctx;
  if (!user) {
    const demoFill = { fill: () => {} };
    return [
      el('h1', { text: t('nav.account') }),
      el('div', { class: 'two-col' }, [loginForm(ctx, demoFill), registerForm(ctx)]),
      ctx.api.mode === 'demo' ? demoTable(ctx, demoFill) : null,
    ];
  }
  const verificationKind = { approved: 'ok', pending: 'warn', rejected: 'warn', not_required: 'neutral' }[user.verification];
  const dl = (label, value) => [el('dt', { text: label }), el('dd', {}, [value])];
  return [
    el('h1', { text: t('nav.account') }),
    el('section', { class: 'card' }, [
      el('dl', { class: 'props' }, [
        ...dl(t('account.fullName'), user.fullName),
        ...dl(t('account.email'), user.email),
        ...dl(t('account.role'), `${t(`roles.${user.role}`)}${user.isAdmin ? ` + ${t('account.adminFlag')}` : ''}`),
        ...dl(user.role === 'student' ? t('account.studyDirection') : t('account.specialty'),
          user.role === 'student' ? t(`studyDirections.${user.studyDirection}`) : specialtyName(ctx, user.specialty)),
        ...dl(t('account.institution'), user.institution),
        ...dl(t('account.status'), user.role === 'doctor' ? chip(t(`verification.${user.verification}`), verificationKind) : t('verification.not_required')),
        ...dl(t('account.plan'), t(`plans.${user.effectivePlan}.name`)),
        ...dl(t('account.registered'), formatDate(ctx, user.createdAt)),
      ]),
      user.role === 'doctor' && user.verification === 'pending' ? alertBox(t('account.pendingNote'), 'info') : null,
      user.role !== 'doctor' ? el('p', { class: 'text-muted', text: t('account.cannotApproveNote') }) : null,
      el('p', { class: 'text-muted', text: t('account.licensePrivacy') }),
      el('button', { type: 'button', class: 'btn', text: t('account.signOut'), onclick: async () => { await ctx.api.logout(); await ctx.refreshUser(); } }),
    ]),
  ];
}
