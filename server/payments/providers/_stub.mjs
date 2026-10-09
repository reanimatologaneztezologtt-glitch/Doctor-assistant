// Shared stub. Every provider adapter implements the same interface:
//   createCheckout({ planId, userId, returnUrl }) -> { redirectUrl, providerRef }
//   verifyWebhook(rawBody, headers)              -> { valid, event }
//   getSubscriptionStatus(providerRef)           -> { status, periodEnd }
//   cancel(providerRef)                          -> { status }
// Card data is never handled here: providers' hosted pages or SDKs collect
// it, and only provider tokens and statuses are stored.
export class NotImplementedError extends Error {
  constructor(provider, method) {
    super(`${provider}.${method} is not implemented (stub)`);
    this.code = 'notImplemented';
  }
}

export function createStubProvider(id) {
  return {
    id,
    async createCheckout() { throw new NotImplementedError(id, 'createCheckout'); },
    // Fail closed: an unverified webhook is always rejected.
    async verifyWebhook() { return { valid: false, event: null }; },
    async getSubscriptionStatus() { throw new NotImplementedError(id, 'getSubscriptionStatus'); },
    async cancel() { throw new NotImplementedError(id, 'cancel'); },
  };
}
