// Fixed-window rate limiter keyed by IP, session or user.
export function createRateLimiter({ windowMs, max, now = () => Date.now() }) {
  const hits = new Map();
  return {
    // Returns true when the request is allowed.
    take(key) {
      const t = now();
      const entry = hits.get(key);
      if (!entry || entry.reset <= t) {
        hits.set(key, { count: 1, reset: t + windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    },
  };
}

export const BODY_LIMIT_BYTES = 32 * 1024;
