// Educational AI assistant. The browser sends only the chat text; the server
// (or the demo backend) applies the rules, limits and source check.
import { detectPersonalData } from '../core/ai-guard.js';
import { el, field } from '../ui/dom.js';
import { alertBox, errorText, signInPrompt, sourceShort } from './common.js';

const chat = []; // memory only, cleared on reload

function bubble(ctx, msg) {
  const { t } = ctx;
  if (msg.role === 'user') return el('div', { class: 'bubble bubble--user' }, [el('p', { text: msg.content })]);
  return el('div', { class: 'bubble bubble--ai' }, [
    el('p', { class: 'ai-label', text: t('ai.label') }),
    el('p', { class: 'bubble__text', text: msg.content }),
    msg.sourceIds && msg.sourceIds.length
      ? el('p', { class: 'source' }, [el('span', { class: 'source__label', text: `${t('ui.source')}: ` }), msg.sourceIds.map((id) => sourceShort(ctx, id)).join('; ')])
      : null,
  ]);
}

export async function renderAssistant(ctx) {
  const { t, user, data } = ctx;
  const head = [el('h1', { text: t('nav.assistant') }), el('p', { class: 'lead', text: t('ai.intro') })];
  if (!data.config.aiEnabled) return [...head, alertBox(t('errors.aiDisabled'), 'info')];
  if (!user) return [...head, signInPrompt(ctx)];

  const quota = await ctx.api.aiQuota().catch(() => null);
  const quotaLine = el('p', { class: 'text-muted', role: 'status' });
  const setQuota = (q) => {
    if (q) quotaLine.textContent = t('ai.quota', { used: q.used, limit: q.dailyLimit, plan: t(`plans.${q.planId}.name`) });
  };
  setQuota(quota);

  const log = el('div', { class: 'chat', 'aria-live': 'polite' }, chat.map((m) => bubble(ctx, m)));
  const box = el('textarea', { id: 'ai-input', rows: '3', maxlength: '2000' });
  box.value = ctx.assistantDraft || '';
  ctx.setAssistantDraft('');
  const msg = el('div', { role: 'status' });
  const sendBtn = el('button', { type: 'submit', class: 'btn btn--primary', text: t('ai.send') });
  const stopBtn = el('button', { type: 'button', class: 'btn', text: t('ai.stop'), hidden: true });
  let ctl = null;
  stopBtn.addEventListener('click', () => ctl && ctl.abort());

  const form = el('form', {
    class: 'stack',
    onsubmit: async (e) => {
      e.preventDefault();
      msg.replaceChildren();
      const text = box.value.trim();
      if (!text) return;
      if (detectPersonalData(text).length) {
        msg.append(alertBox(t('errors.personalData')));
        return;
      }
      chat.push({ role: 'user', content: text });
      log.append(bubble(ctx, chat[chat.length - 1]));
      box.value = '';
      const pending = el('div', { class: 'bubble bubble--ai' }, [el('p', { class: 'ai-label', text: t('ai.label') }), el('p', { class: 'bubble__text', text: t('ai.thinking') })]);
      log.append(pending);
      sendBtn.disabled = true;
      stopBtn.hidden = false;
      ctl = new AbortController();
      const turns = chat.slice(-12).filter((m, i, arr) => !(i === 0 && m.role === 'assistant'));
      try {
        const answer = await ctx.api.askAI(turns.map(({ role, content }) => ({ role, content })), ctx.lang, {
          signal: ctl.signal,
          onText: ({ text: partial }) => { pending.querySelector('.bubble__text').textContent = partial; },
        });
        chat.push({ role: 'assistant', content: answer.text, sourceIds: answer.sourceIds });
        pending.replaceWith(bubble(ctx, chat[chat.length - 1]));
      } catch (err) {
        chat.pop(); // the unanswered question is not kept in the history
        pending.remove();
        if (err.code !== 'cancelled') msg.append(alertBox(errorText(t, err), err.code === 'noSource' || err.code === 'injection' ? 'info' : 'error'));
      } finally {
        sendBtn.disabled = false;
        stopBtn.hidden = true;
        setQuota(await ctx.api.aiQuota().catch(() => null));
      }
    },
  }, [
    field({ label: t('ai.question'), input: box, hint: t('ai.noPatientData') }),
    el('div', { class: 'toolbar' }, [sendBtn, stopBtn]),
    msg,
  ]);

  return [...head, quotaLine, el('ul', { class: 'list text-muted' }, [
    el('li', { text: t('ai.rule1') }), el('li', { text: t('ai.rule2') }), el('li', { text: t('ai.rule3') }),
  ]), log, form];
}
