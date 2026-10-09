// Payment adapter registry. Adapters are not loaded or called while
// paymentsEnabled is false (or testMode is true).
import { paymentsActive } from '../../js/core/config.js';

export const REQUIRED_METHODS = ['createCheckout', 'verifyWebhook', 'getSubscriptionStatus', 'cancel'];

export function createPayments({ config, providers, load = (file) => import(`./providers/${file}`) }) {
  const cache = new Map();
  return {
    active: () => paymentsActive(config),
    async get(id) {
      if (!paymentsActive(config)) {
        const err = new Error('paymentsDisabled');
        err.code = 'paymentsDisabled';
        throw err;
      }
      const meta = providers.providers.find((p) => p.id === id);
      if (!meta) {
        const err = new Error('notFound');
        err.code = 'notFound';
        throw err;
      }
      if (!cache.has(id)) cache.set(id, (await load(meta.adapter)).default);
      return cache.get(id);
    },
  };
}
