import { createHttpBackend } from './http.js';
import { createDemoBackend } from './demo.js';

// Use the server when its API answers; otherwise run the demo backend.
export async function createBackend(data) {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const res = await fetch('api/health', { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (res.ok) {
      const body = await res.json();
      if (body && body.ok === true) return createHttpBackend();
    }
  } catch { /* no server */ }
  return createDemoBackend({ data });
}
