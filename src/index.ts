import type { Env } from './env';
import type { Ctx } from './types';
import { detectLocale, translator, isLocale } from './lib/i18n';
import { loadUser, timingSafeEqual } from './lib/auth';
import { getSettings, unreadNotifications, unreadConversations, touchUser } from './lib/db';
import {
  clientIp,
  getCookie,
  htmlResponse,
  jsonResponse,
  parseCookies,
  rateLimit,
  clusterRateLimit,
  redirectResponse,
  serializeCookie,
  uuid,
} from './lib/utils';
import { dispatch } from './router';
import { guardRequest, tooManyRequests } from './lib/botguard';
import { errorPage } from './views/pages';

// 路由注册（副作用导入）
import './routes/home';
import './routes/topic';
import './routes/auth';
import './routes/email';
import './routes/user';
import './routes/messages';
import './routes/tags';
import './routes/admin';
import './routes/api';
import './routes/feeds';
import './routes/dev';

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'content-security-policy':
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  if (!headers.has('strict-transport-security')) {
    headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function rateRule(path: string, method: string): { key: string; limit: number; window: number } | null {
  if (method !== 'POST') return null;
  if (path === '/login' || path === '/register' || path === '/setup') return { key: 'auth', limit: 15, window: 600_000 };
  if (path === '/new' || path.endsWith('/reply')) return { key: 'post', limit: 20, window: 600_000 };
  if (path === '/messages' || path.startsWith('/messages/')) return { key: 'dm', limit: 60, window: 600_000 };
  if (path.startsWith('/api/')) return { key: 'api', limit: 240, window: 60_000 };
  return null;
}

async function buildContext(req: Request, env: Env, exec: ExecutionContext, params: Record<string, string>): Promise<Ctx> {
  const url = new URL(req.url);
  const cookies = parseCookies(req.headers.get('cookie'));

  const [user, settings] = await Promise.all([loadUser(env, req), getSettings(env)]);
  const locale = detectLocale(req, user?.locale, cookies['bbs_lang']);
  const t = translator(locale);
  const siteName = settings.site_name || env.SITE_NAME || 'Nexus';

  const csrf = cookies['bbs_csrf'] || uuid().replace(/-/g, '');
  let form: FormData | null = null;
  if (req.method === 'POST') {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      try {
        form = await req.formData();
      } catch {
        form = null;
      }
    }
  }

  const flashKey = url.searchParams.get('flash');
  const flashType = url.searchParams.get('ft') === 'error' ? 'error' : 'ok';
  let flash: Ctx['flash'] = null;
  if (flashKey) {
    const text = t(flashKey);
    if (text && text !== flashKey) flash = { type: flashType, text };
  }

  const unread = user ? await unreadNotifications(env, user.id) : 0;
  const unreadDm = user ? await unreadConversations(env, user.id) : 0;

  const ctx: Ctx = {
    req,
    env,
    exec,
    url,
    params,
    query: url.searchParams,
    form,
    user,
    locale,
    t,
    csrf,
    siteName,
    settings,
    unread,
    unreadDm,
    flash,
    html: (body, status = 200, init) => htmlResponse(body, status, init),
    redirect: (path, msg, type = 'ok') => {
      let target = path;
      if (msg) {
        const hashIdx = target.indexOf('#');
        const hash = hashIdx >= 0 ? target.slice(hashIdx) : '';
        const base = hashIdx >= 0 ? target.slice(0, hashIdx) : target;
        const sep = base.includes('?') ? '&' : '?';
        target = `${base}${sep}flash=${encodeURIComponent(msg)}&ft=${type}${hash}`;
      }
      return redirectResponse(target);
    },
    json: (data, status = 200) => jsonResponse(data, status),
  };
  return ctx;
}

export default {
  async fetch(req: Request, env: Env, exec: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // 静态资源由 Assets 处理，这里只兜底 favicon
    if (path === '/favicon.ico') return redirectResponse('/favicon.svg', [], 301);

    // ------------------------------------------------------------------
    // 第一道闸：bot / 爬虫 / 扫描器拦截（在路由与数据库之前，避免额度消耗）
    // ------------------------------------------------------------------
    const guarded = guardRequest(req, env);
    if (guarded) return withSecurityHeaders(guarded);

    // 第二道闸：请求限流
    // 优先用 Workers 原生 Rate Limiting binding（计数强一致、不碰 D1）；
    // 本地开发没有该 binding 时，回退到 Cache API / 内存桶。
    if (path !== '/healthz') {
      const scope = path === '/search' ? 'search' : path.startsWith('/api/') ? 'api-get' : 'page';
      const signedIn = !!getCookie(req, 'bbs_sess');
      const ip = clientIp(req);
      const key = `${signedIn ? 'u' : 'a'}:${ip}`;
      // 与 wrangler.toml 的 [[ratelimits]] 保持一致：匿名 40、登录 180、搜索 10（每分钟）
      const fallbackLimits = signedIn
        ? { search: 20, 'api-get': 120, page: 180 }
        : { search: 10, 'api-get': 30, page: 40 };
      const binding = scope === 'search' ? env.RL_SEARCH : signedIn ? env.RL_USER : env.RL_PAGE;

      let verdict: { ok: boolean; retryAfter: number } | null = null;
      if (binding && typeof binding.limit === 'function') {
        try {
          const res = await binding.limit({ key });
          verdict = { ok: res.success, retryAfter: 60 };
        } catch {
          verdict = null;
        }
      }
      if (!verdict) {
        try {
          verdict = await clusterRateLimit(`g:${scope}:${key}`, fallbackLimits[scope], 60);
        } catch {
          verdict = rateLimit(`g:${scope}:${key}`, fallbackLimits[scope], 60_000);
        }
      }
      if (!verdict.ok) return withSecurityHeaders(tooManyRequests(verdict.retryAfter));
    }

    if (path === '/healthz') {
      return jsonResponse({ ok: true, ts: Date.now() });
    }

    try {
      if (!env.SESSION_SECRET) {
        return withSecurityHeaders(
          htmlResponse(
            '<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:48px;max-width:640px;margin:auto"><h1>缺少 SESSION_SECRET</h1><p>请执行 <code>wrangler secret put SESSION_SECRET</code>（本地开发写入 .dev.vars）后重试。</p></body>',
            500,
          ),
        );
      }

      const method = req.method === 'HEAD' ? 'GET' : req.method;

      // 语言切换（必须在路由分发之前处理，否则会被 404 拦截）
      if (path.startsWith('/lang/') && method === 'GET') {
        const code = path.slice('/lang/'.length);
        const next = url.searchParams.get('next') || '/';
        const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
        return redirectResponse(safeNext, [
          serializeCookie('bbs_lang', isLocale(code) ? code : 'zh-CN', {
            maxAge: 60 * 60 * 24 * 365,
            httpOnly: false,
            sameSite: 'Lax',
            secure: url.protocol === 'https:',
          }),
        ]);
      }

      const match = method === 'GET' || method === 'POST' ? dispatch(method, path) : null;
      if (!match) {
        const ctx = await buildContext(req, env, exec, {});
        return withSecurityHeaders(ctx.html(errorPage(ctx, 404), 404));
      }

      const rule = rateRule(path, method);
      if (rule) {
        const ip = clientIp(req);
        const result = rateLimit(`${rule.key}:${ip}`, rule.limit, rule.window);
        if (!result.ok) {
          const ctx = await buildContext(req, env, exec, match.params);
          if (path.startsWith('/api/')) {
            return jsonResponse({ ok: false, error: 'rate_limited', retryAfter: result.retryAfter }, 429, {
              'retry-after': String(result.retryAfter),
            });
          }
          return withSecurityHeaders(ctx.html(errorPage(ctx, 429, ctx.t('error.rateLimit')), 429));
        }
      }

      const ctx = await buildContext(req, env, exec, match.params);

      // CSRF：所有写操作必须携带与 Cookie 一致的令牌
      if (method === 'POST') {
        const token = req.headers.get('x-csrf-token') || (ctx.form ? String(ctx.form.get('_csrf') || '') : '');
        if (!ctx.csrf || !timingSafeEqual(token, ctx.csrf)) {
          if (path.startsWith('/api/')) return jsonResponse({ ok: false, error: 'csrf' }, 403);
          return withSecurityHeaders(ctx.html(errorPage(ctx, 403, ctx.t('error.csrf')), 403));
        }
      }

      const res = await match.handler(ctx);
      const headers = new Headers(res.headers);
      if (!getCookie(req, 'bbs_csrf')) {
        headers.append(
          'set-cookie',
          serializeCookie('bbs_csrf', ctx.csrf, {
            maxAge: 60 * 60 * 24 * 7,
            httpOnly: false,
            sameSite: 'Lax',
            secure: url.protocol === 'https:',
          }),
        );
      }
      if (ctx.user) {
        exec.waitUntil(touchUser(env, ctx.user).catch(() => undefined));
      }
      return withSecurityHeaders(new Response(res.body, { status: res.status, headers }));
    } catch (err) {
      console.error('unhandled_error', err);
      const ctx = await buildContext(req, env, exec, {}).catch(() => null);
      if (!ctx) {
        return new Response('Internal Server Error', { status: 500 });
      }
      if (path.startsWith('/api/')) {
        return jsonResponse({ ok: false, error: 'server_error' }, 500);
      }
      return withSecurityHeaders(ctx.html(errorPage(ctx, 500), 500));
    }
  },
};
