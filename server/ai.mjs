// Claude proxy. The API key is read by the SDK from the ANTHROPIC_API_KEY
// environment variable only; it is never sent to the browser or logged.
// Model and max_tokens are fixed here and by the plan, not by the client.
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, checkAnswer, detectInjection, validateChat } from '../js/core/ai-guard.js';

export const MODEL = 'claude-opus-5-5';

export function createAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

export function createAiProxy({ client, service, knowledge, sourceIds, config }) {
  const systemByLang = new Map();
  const systemFor = (lang) => {
    if (!systemByLang.has(lang)) systemByLang.set(lang, buildSystemPrompt(knowledge, lang));
    return systemByLang.get(lang);
  };

  return async function chat(user, { messages, lang }) {
    if (!config.aiEnabled) return { status: 403, body: { error: 'aiDisabled' } };
    const invalid = validateChat(messages);
    if (invalid) return { status: 400, body: { error: invalid } };
    const quota = service.aiQuota(user);
    if (quota.remaining <= 0) return { status: 429, body: { error: 'quotaExceeded' } };
    const last = messages[messages.length - 1].content;
    if (detectInjection(last)) {
      service.recordUsage(user, { outcome: 'blocked_injection' });
      return { status: 400, body: { error: 'injection' } };
    }
    if (!client) return { status: 503, body: { error: 'aiUnavailable' } };

    let response;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: quota.maxTokens,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: systemFor(['uz', 'ru', 'en'].includes(lang) ? lang : 'en'), cache_control: { type: 'ephemeral' } }],
        messages: messages.map(({ role, content }) => ({ role, content })),
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return { status: 429, body: { error: 'rateLimited' } };
      if (err instanceof Anthropic.APIError) {
        console.error(`AI request failed: status ${err.status}`);
        return { status: 502, body: { error: 'aiUnavailable' } };
      }
      console.error('AI request failed:', err && err.name);
      return { status: 502, body: { error: 'aiUnavailable' } };
    }

    const usage = { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 };
    if (response.stop_reason === 'refusal') {
      service.recordUsage(user, { ...usage, outcome: 'refusal' });
      return { status: 422, body: { error: 'noSource' } };
    }
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const checked = checkAnswer(text, sourceIds);
    service.recordUsage(user, { ...usage, outcome: checked.ok ? 'ok' : 'no_source' });
    if (!checked.ok) return { status: 422, body: { error: 'noSource' } };
    return { status: 200, body: { text: checked.text, sourceIds: checked.sourceIds } };
  };
}
