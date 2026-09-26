import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const SESSION_LIFETIME = 7 * 24 * 60 * 60 * 1000;
export const INVITE_LIFETIME = 72 * 60 * 60 * 1000;
export const COOKIE_NAME = 'quickview_session';
export const newToken = () => randomBytes(32).toString('base64url');
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export const publicUser = ({ id, name, email, role }) => ({ id, name, email, role });

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  const [, salt, digest] = (encoded || '').split(':');
  if (!salt || !digest || !/^[a-f0-9]{128}$/.test(digest)) return false;
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(derived, Buffer.from(digest, 'hex'));
}

export function equalSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sessionCookie(token, secure, clear = false) {
  return `${COOKIE_NAME}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_LIFETIME / 1000}${secure ? '; Secure' : ''}`;
}

export function readSessionToken(request) {
  const cookies = (request.headers.cookie || '').split(';');
  const cookie = cookies.map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`));
  const token = cookie?.slice(COOKIE_NAME.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function createRateLimiter({ windowMs = 15 * 60 * 1000, limit = 20 } = {}) {
  const buckets = new Map();
  return {
    allow(key, now) {
      if (buckets.size > 20000) for (const [id, value] of buckets) if (value.expiresAt <= now) buckets.delete(id);
      let bucket = buckets.get(key);
      if (!bucket || bucket.expiresAt <= now) { bucket = { count: 0, expiresAt: now + windowMs }; buckets.set(key, bucket); }
      bucket.count += 1;
      return bucket.count <= limit;
    },
    clear(key) { buckets.delete(key); },
  };
}
