// Backend adapter for the Node server (server/index.mjs). Session is an
// HttpOnly cookie; the browser never sees credentials or the AI key.
async function call(method, path, body) {
  const res = await fetch(`api/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { code: data.error || 'serverError', details: data.details };
  return data;
}

export function createHttpBackend() {
  return {
    mode: 'server',
    me: () => call('GET', 'me').then((d) => d.user),
    register: (input) => call('POST', 'auth/register', input).then((d) => d.user),
    login: (email, password) => call('POST', 'auth/login', { email, password }).then((d) => d.user),
    logout: () => call('POST', 'auth/logout'),
    listUsers: () => call('GET', 'admin/users').then((d) => d.users),
    verifyDoctor: (userId, action, note) => call('POST', `admin/users/${encodeURIComponent(userId)}/verify`, { action, note }),
    journal: (kind) => call('GET', `admin/journal${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`).then((d) => d.entries),
    ruleStatuses: () => call('GET', 'rules/status').then((d) => d.statuses),
    decideRule: (ruleId, action) => call('POST', `rules/${encodeURIComponent(ruleId)}/decision`, { action }),
    approveConclusion: (ruleIds) => call('POST', 'conclusions/approve', { ruleIds }),
    createQuestion: (q) => call('POST', 'questions', q),
    listQuestions: () => call('GET', 'questions'),
    answerQuestion: (id, text) => call('POST', `questions/${encodeURIComponent(id)}/answer`, { text }),
    plans: () => call('GET', 'plans'),
    aiQuota: () => call('GET', 'ai/quota'),
    cancelSubscription: () => call('POST', 'billing/cancel'),
    startCheckout: (planId, providerId) => call('POST', 'billing/checkout', { planId, providerId }),
    async askAI(messages, lang) {
      const d = await call('POST', 'ai/chat', { messages, lang });
      return { text: d.text, sourceIds: d.sourceIds };
    },
    demoAccounts: [],
  };
}
