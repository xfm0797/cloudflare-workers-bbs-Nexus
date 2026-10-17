/** HTTP / 加密 / Cookie 等基础工具，零第三方依赖 */

const enc = new TextEncoder();

/* ------------------------------------------------------------------ 编码 */

export function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function toBase64Url(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomToken(size = 24): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function uuid(): string {
  return crypto.randomUUID();
}

/* ------------------------------------------------------------------ 响应 */

export function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const h = new Headers(headers);
  h.set('content-type', 'application/json; charset=utf-8');
  h.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function htmlResponse(body: string, status = 200, init: ResponseInit = {}): Response {
  const h = new Headers(init.headers);
  h.set('content-type', 'text/html; charset=utf-8');
  if (!h.has('cache-control')) h.set('cache-control', 'private, no-cache');
  return new Response(body, { ...init, status, headers: h });
}

export function redirectResponse(location: string, cookies: string[] = [], status = 302): Response {
  const h = new Headers({ location });
  for (const c of cookies) h.append('set-cookie', c);
  h.set('cache-control', 'no-store');
  return new Response(null, { status, headers: h });
}

/* ------------------------------------------------------------------ Cookie */

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function getCookie(req: Request, name: string): string | null {
  return parseCookies(req.headers.get('cookie'))[name] ?? null;
}

export interface CookieOptions {
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  path?: string;
}

export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path ?? '/'}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure !== false) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
  return parts.join('; ');
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    '0.0.0.0'
  );
}

/* ------------------------------------------------------------------ 限流 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * 单 isolate 内存限流（足够抵御常规撞库/刷屏）。
 * 需要全局限流时可在 Cloudflare 控制台叠加 Rate Limiting 规则。
 */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/* ------------------------------------------------------------------ 其它 */

export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, 60) || 'topic';
}

export function excerptOf(markdown: string, length = 180): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~`\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > length ? plain.slice(0, length) + '…' : plain;
}

export function parseIntParam(value: string | null, fallback = 1): number {
  const n = Number.parseInt(value || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 根据字符串稳定生成一个色相，用于默认头像 */
export function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export { enc };

/**
 * 跨 isolate 的固定窗口限流：用 Cache API 计数（同一机房内共享），
 * 比纯内存桶更可靠。失败时调用方回退到内存版 rateLimit()。
 */
export async function clusterRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ ok: boolean; retryAfter: number }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(nowSec / windowSec);
  const cacheKey = new Request(`https://ratelimit.internal/${encodeURIComponent(key)}/${bucket}`);
  const cache = caches.default;

  let count = 0;
  const hit = await cache.match(cacheKey);
  if (hit) count = Number(await hit.text()) || 0;
  count += 1;

  const retryAfter = windowSec - (nowSec % windowSec);
  if (count > limit) return { ok: false, retryAfter };

  await cache.put(
    cacheKey,
    new Response(String(count), {
      headers: { 'content-type': 'text/plain', 'cache-control': `max-age=${windowSec}` },
    }),
  );
  return { ok: true, retryAfter: 0 };
}
