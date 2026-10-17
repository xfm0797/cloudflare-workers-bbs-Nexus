import type { Env } from '../env';
import type { User } from './types';
import { fromBase64Url, getCookie, serializeCookie, toBase64Url, uuid } from './utils';

const encoder = new TextEncoder();
const SESSION_COOKIE = 'bbs_sess';
const CSRF_COOKIE = 'bbs_csrf';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 天
const STATE_TTL = 60 * 10; // OAuth state 10 分钟

const keyCache = new Map<string, CryptoKey>();

async function hmacKey(secret: string): Promise<CryptoKey> {
  const cached = keyCache.get(secret);
  if (cached) return cached;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
  if (keyCache.size > 8) keyCache.clear();
  keyCache.set(secret, key);
  return key;
}

async function signValue(value: string, secret: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(value));
  return toBase64Url(sig);
}

/** 生成 `base64url(payload).signature` 形式的签名令牌 */
export async function signToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${await signValue(body, secret)}`;
}

export async function verifyToken<T = Record<string, unknown>>(token: string, secret: string): Promise<T | null> {
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  let valid = false;
  try {
    valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64Url(sig), encoder.encode(body));
  } catch {
    return null;
  }
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as T;
    const exp = (payload as { exp?: number }).exp;
    if (typeof exp === 'number' && exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- 密码 */

export function passwordIterations(env: Env): number {
  const n = Number.parseInt(env.PASSWORD_ITERATIONS || '', 10);
  return Number.isFinite(n) && n >= 10000 && n <= 300000 ? n : 100000;
}

export async function hashPassword(password: string, iterations: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${iterations}$${toBase64Url(salt)}$${toBase64Url(bits)}`;
}

export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations)) return false;
  const salt = fromBase64Url(parts[2]);
  try {
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256));
    const expected = fromBase64Url(parts[3]);
    if (bits.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- 会话 */

export interface SessionPayload {
  uid: string;
  ver: number;
  typ: 'session';
  exp: number;
  iat: number;
}

export async function createSessionCookie(
  user: Pick<User, 'id' | 'token_version'>,
  secret: string,
  secure = true,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const token = await signToken(
    { uid: user.id, ver: user.token_version, typ: 'session', iat: now, exp: now + SESSION_TTL },
    secret,
  );
  return serializeCookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL, httpOnly: true, sameSite: 'Lax', secure });
}

export function clearSessionCookie(secure = true): string {
  return serializeCookie(SESSION_COOKIE, '', { maxAge: 0, httpOnly: true, sameSite: 'Lax', secure });
}

export async function readSession(req: Request, secret: string): Promise<SessionPayload | null> {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const payload = await verifyToken<SessionPayload>(token, secret);
  if (!payload || payload.typ !== 'session' || !payload.uid) return null;
  return payload;
}

export async function loadUser(env: Env, req: Request): Promise<User | null> {
  if (!env.SESSION_SECRET) return null;
  const session = await readSession(req, env.SESSION_SECRET);
  if (!session) return null;
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.uid).first<User>();
  if (!user) return null;
  if (user.token_version !== session.ver) return null;
  return user;
}

/* ---------------------------------------------------------------- CSRF */

export function csrfToken(req: Request): string {
  return getCookie(req, CSRF_COOKIE) || '';
}

export function newCsrfCookie(): { token: string; cookie: string } {
  const token = uuid().replace(/-/g, '');
  return {
    token,
    cookie: serializeCookie(CSRF_COOKIE, token, { maxAge: 60 * 60 * 24 * 7, httpOnly: false, sameSite: 'Lax' }),
  };
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------------------------------------------------------------- OAuth state */

export async function createState(
  secret: string,
  provider: string,
  redirect: string,
  link = false,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signToken(
    { typ: 'state', n: uuid(), p: provider, r: redirect.slice(0, 200), l: link ? 1 : 0, exp: now + STATE_TTL },
    secret,
  );
}

export interface StatePayload {
  typ: 'state';
  n: string;
  p: string;
  r: string;
  l?: number;
  exp: number;
}

export async function readState(state: string, secret: string): Promise<StatePayload | null> {
  const payload = await verifyToken<StatePayload>(state, secret);
  if (!payload || payload.typ !== 'state') return null;
  return payload;
}

/* ---------------------------------------------------------------- 校验 */

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function isValidUsername(username: string): boolean {
  return /^[\p{L}\p{N}_-]{2,20}$/u.test(username);
}

/** 从第三方昵称生成一个合法且唯一的用户名 */
export function normalizeUsername(raw: string | undefined, fallback = 'user'): string {
  const base = (raw || fallback)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 18);
  return base.length >= 2 ? base : `user_${Math.random().toString(36).slice(2, 6)}`;
}

export function isStaff(user: Pick<User, 'role'> | null | undefined): boolean {
  return !!user && (user.role === 'admin' || user.role === 'moderator');
}

export function isAdmin(user: Pick<User, 'role'> | null | undefined): boolean {
  return !!user && user.role === 'admin';
}
