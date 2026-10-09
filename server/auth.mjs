// Password hashing (scrypt) and in-memory sessions.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const KEYLEN = 64;

export const hasher = {
  async hash(password) {
    const salt = randomBytes(16);
    const hash = await scrypt(password, salt, KEYLEN);
    return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
  },
  async verify(password, stored) {
    const [scheme, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'base64');
    const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
    return timingSafeEqual(actual, expected);
  },
};

export function createSessions({ ttlMs = 12 * 60 * 60 * 1000, now = () => Date.now() } = {}) {
  const sessions = new Map();
  return {
    create(userId) {
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, { userId, expires: now() + ttlMs });
      return token;
    },
    get(token) {
      const s = token && sessions.get(token);
      if (!s) return null;
      if (s.expires < now()) {
        sessions.delete(token);
        return null;
      }
      return s;
    },
    destroy(token) {
      sessions.delete(token);
    },
  };
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
