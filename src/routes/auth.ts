import { get, post } from '../router';
import {
  createSessionCookie,
  clearSessionCookie,
  createState,
  readState,
  hashPassword,
  verifyPassword,
  isValidEmail,
  isValidUsername,
  normalizeUsername,
  passwordIterations,
} from '../lib/auth';
import { countUsers, createTopic, getUserByUsername, getUserById, hasUsers } from '../lib/db';
import { getProvider } from '../lib/oauth';
import { authPage, errorPage } from '../views/pages';
import { randomToken, serializeCookie } from '../lib/utils';
import type { User } from '../lib/types';

const OAUTH_COOKIE = 'bbs_oauth';

function safeNext(raw: string | null | undefined): string {
  if (!raw) return '/';
  return raw.startsWith('/') && !raw.startsWith('//') ? raw.slice(0, 200) : '/';
}

function registrationOpen(ctx: { settings: Record<string, string>; env: { ALLOW_REGISTRATION?: string } }): boolean {
  if (ctx.settings.allow_registration === 'false') return false;
  if (ctx.env.ALLOW_REGISTRATION === 'false') return false;
  return true;
}

async function uniqueUsername(env: Parameters<typeof getUserByUsername>[0], base: string): Promise<string> {
  let candidate = base.slice(0, 20);
  let i = 1;
  while (await getUserByUsername(env, candidate)) {
    candidate = `${base.slice(0, 16)}${i}`;
    i += 1;
    if (i > 60) {
      candidate = `${base.slice(0, 12)}_${randomToken(3).replace(/[^a-zA-Z0-9]/g, '').slice(0, 4)}`;
      break;
    }
  }
  return candidate;
}

function callbackUrl(ctx: { env: { SITE_URL?: string }; url: URL }, provider: string): string {
  const base = (ctx.env.SITE_URL || ctx.url.origin).replace(/\/$/, '');
  return `${base}/auth/${provider}/callback`;
}

/* ------------------------------------------------------------------ 登录 */

get('/login', async (ctx) => {
  if (ctx.user) return ctx.redirect('/');
  if (!(await hasUsers(ctx.env))) return ctx.redirect('/setup');
  return ctx.html(authPage(ctx, { mode: 'login', next: safeNext(ctx.query.get('next')), allowRegistration: registrationOpen(ctx) }));
});

post('/login', async (ctx) => {
  const email = String(ctx.form?.get('email') || '').trim().toLowerCase();
  const password = String(ctx.form?.get('password') || '');
  const next = safeNext(String(ctx.form?.get('next') || '/'));

  const user = email
    ? await ctx.env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?').bind(email).first<User>()
    : null;

  if (!user || !(await verifyPassword(user.password_hash, password))) {
    return ctx.html(
      authPage(ctx, {
        mode: 'login',
        error: ctx.t('auth.invalidCredentials'),
        next,
        values: { email },
        allowRegistration: registrationOpen(ctx),
      }),
      401,
    );
  }
  if (user.status === 'banned') {
    return ctx.html(authPage(ctx, { mode: 'login', error: ctx.t('auth.banned'), next, values: { email }, allowRegistration: registrationOpen(ctx) }), 403);
  }

  await ctx.env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(Date.now(), user.id).run();
  const cookie = await createSessionCookie(user, ctx.env.SESSION_SECRET, ctx.url.protocol === 'https:');
  return new Response(null, {
    status: 302,
    headers: { location: next, 'set-cookie': cookie, 'cache-control': 'no-store' },
  });
});

/* ------------------------------------------------------------------ 注册 */

get('/register', async (ctx) => {
  if (ctx.user) return ctx.redirect('/');
  if (!(await hasUsers(ctx.env))) return ctx.redirect('/setup');
  if (!registrationOpen(ctx)) {
    return ctx.html(
      authPage(ctx, { mode: 'register', error: ctx.t('auth.registrationClosedDesc'), next: '/', allowRegistration: false }),
      403,
    );
  }
  return ctx.html(authPage(ctx, { mode: 'register', next: safeNext(ctx.query.get('next')), allowRegistration: true }));
});

post('/register', async (ctx) => {
  if (!registrationOpen(ctx)) return ctx.redirect('/');
  const username = String(ctx.form?.get('username') || '').trim();
  const email = String(ctx.form?.get('email') || '').trim().toLowerCase();
  const password = String(ctx.form?.get('password') || '');
  const password2 = String(ctx.form?.get('password2') || '');
  const next = safeNext(String(ctx.form?.get('next') || '/'));

  const fail = (msg: string) =>
    ctx.html(authPage(ctx, { mode: 'register', error: msg, next, values: { username, email }, allowRegistration: true }), 400);

  if (!isValidUsername(username)) return fail(ctx.t('auth.invalidUsername'));
  if (!isValidEmail(email)) return fail(ctx.t('auth.invalidEmail'));
  if (password.length < 8) return fail(ctx.t('auth.passwordShort'));
  if (password !== password2) return fail(ctx.t('auth.passwordMismatch'));

  if (await getUserByUsername(ctx.env, username)) return fail(ctx.t('auth.usernameTaken'));
  const taken = await ctx.env.DB.prepare('SELECT id FROM users WHERE lower(email) = ?').bind(email).first();
  if (taken) return fail(ctx.t('auth.emailTaken'));

  const total = await countUsers(ctx.env);
  const isFirst = total === 0;
  const now = Date.now();
  const id = crypto.randomUUID();
  const hash = await hashPassword(password, passwordIterations(ctx.env));

  try {
    await ctx.env.DB.prepare(
      `INSERT INTO users (id, username, email, password_hash, display_name, role, email_verified, locale, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
      .bind(id, username, email, hash, username, isFirst ? 'admin' : 'member', ctx.locale, now, now)
      .run();
  } catch {
    return fail(ctx.t('auth.usernameTaken'));
  }

  const user = await getUserById(ctx.env, id);
  if (!user) return ctx.html(errorPage(ctx, 500), 500);

  const cookie = await createSessionCookie(user, ctx.env.SESSION_SECRET, ctx.url.protocol === 'https:');
  return new Response(null, {
    status: 302,
    headers: { location: next, 'set-cookie': cookie, 'cache-control': 'no-store' },
  });
});

/* ------------------------------------------------------------------ 首次初始化 */

get('/setup', async (ctx) => {
  if (await hasUsers(ctx.env)) return ctx.redirect('/login');
  return ctx.html(authPage(ctx, { mode: 'setup', allowRegistration: true }));
});

post('/setup', async (ctx) => {
  if (await hasUsers(ctx.env)) return ctx.redirect('/login');
  const username = String(ctx.form?.get('username') || '').trim();
  const email = String(ctx.form?.get('email') || '').trim().toLowerCase();
  const password = String(ctx.form?.get('password') || '');
  const password2 = String(ctx.form?.get('password2') || '');

  const fail = (msg: string) =>
    ctx.html(authPage(ctx, { mode: 'setup', error: msg, values: { username, email }, allowRegistration: true }), 400);

  if (!isValidUsername(username)) return fail(ctx.t('auth.invalidUsername'));
  if (!isValidEmail(email)) return fail(ctx.t('auth.invalidEmail'));
  if (password.length < 8) return fail(ctx.t('auth.passwordShort'));
  if (password !== password2) return fail(ctx.t('auth.passwordMismatch'));

  const now = Date.now();
  const id = crypto.randomUUID();
  const hash = await hashPassword(password, passwordIterations(ctx.env));

  await ctx.env.DB.prepare(
    `INSERT INTO users (id, username, email, password_hash, display_name, role, email_verified, locale, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'admin', 1, ?, ?, ?)`,
  )
    .bind(id, username, email, hash, username, ctx.locale, now, now)
    .run();

  // 欢迎主题
  const category = await ctx.env.DB.prepare('SELECT id FROM categories ORDER BY position ASC LIMIT 1').first<{ id: number }>();
  if (category) {
    const welcome =
      ctx.locale === 'zh-CN'
        ? `欢迎来到 **${ctx.siteName}**！\n\n这里是一个运行在 Cloudflare Workers + D1 上的社区，支持 Markdown、点赞、收藏、通知与多平台登录。\n\n### 从这里开始\n\n- 在「站点公告」发布你的第一条公告\n- 到「技术分享」聊聊你最近在做的东西\n- 在「问答求助」提出你的问题\n\n祝使用愉快 🎉`
        : `Welcome to **${ctx.siteName}**!\n\nThis is a community running on Cloudflare Workers + D1 with Markdown, likes, bookmarks, notifications and social login.\n\n### Get started\n\n- Post your first announcement in "Announcements"\n- Share what you are building in "Technology"\n- Ask anything in "Help & Support"\n\nEnjoy 🎉`;
    await createTopic(ctx.env, {
      categoryId: category.id,
      authorId: id,
      title: ctx.locale === 'zh-CN' ? '欢迎来到新社区 👋' : 'Welcome to the community 👋',
      content: welcome,
      tags: ['welcome'],
    });  }

  const user = await getUserById(ctx.env, id);
  if (!user) return ctx.html(errorPage(ctx, 500), 500);
  const cookie = await createSessionCookie(user, ctx.env.SESSION_SECRET, ctx.url.protocol === 'https:');
  return new Response(null, {
    status: 302,
    headers: { location: '/', 'set-cookie': cookie, 'cache-control': 'no-store' },
  });
});

/* ------------------------------------------------------------------ 退出 */

post('/logout', (ctx) => {
  return new Response(null, {
    status: 302,
    headers: { location: '/', 'set-cookie': clearSessionCookie(ctx.url.protocol === 'https:'), 'cache-control': 'no-store' },
  });
});

/* ------------------------------------------------------------------ OAuth */

get('/auth/:provider', async (ctx) => {
  const provider = getProvider(ctx.env, ctx.params.provider);
  if (!provider) {
    return ctx.html(errorPage(ctx, 404, ctx.t('auth.oauthNotConfigured')), 404);
  }
  const next = safeNext(ctx.query.get('next'));
  const link = ctx.query.get('link') === '1' && !!ctx.user;
  const state = await createState(ctx.env.SESSION_SECRET, provider.id, next, link);
  const url = await provider.authorizeUrl(ctx.env, callbackUrl(ctx, provider.id), state);

  return new Response(null, {
    status: 302,
    headers: {
      location: url,
      'set-cookie': serializeCookie(OAUTH_COOKIE, state, {
        maxAge: 600,
        httpOnly: true,
        sameSite: 'Lax',
        secure: ctx.url.protocol === 'https:',
      }),
      'cache-control': 'no-store',
    },
  });
});

get('/auth/:provider/callback', async (ctx) => {
  const provider = getProvider(ctx.env, ctx.params.provider);
  if (!provider) return ctx.html(errorPage(ctx, 404, ctx.t('auth.oauthNotConfigured')), 404);

  const code = ctx.query.get('code');
  const stateRaw = ctx.query.get('state') || '';
  const cookieState = ctx.req.headers.get('cookie')?.match(new RegExp(`${OAUTH_COOKIE}=([^;]+)`))?.[1] || '';
  const state = await readState(stateRaw, ctx.env.SESSION_SECRET);

  if (!code || !state || state.p !== provider.id || decodeURIComponent(cookieState) !== stateRaw) {
    return ctx.redirect('/login', 'auth.stateMismatch', 'error');
  }

  let profile;
  try {
    profile = await provider.profile(ctx.env, code, callbackUrl(ctx, provider.id));
  } catch (err) {
    console.error('oauth_profile_failed', provider.id, err);
    return ctx.redirect('/login', 'auth.oauthError', 'error');
  }

  const clearOauthCookie = serializeCookie(OAUTH_COOKIE, '', {
    maxAge: 0,
    httpOnly: true,
    sameSite: 'Lax',
    secure: ctx.url.protocol === 'https:',
  });
  const done = (location: string, cookie?: string) => {
    const headers = new Headers({ location, 'cache-control': 'no-store' });
    headers.append('set-cookie', clearOauthCookie);
    if (cookie) headers.append('set-cookie', cookie);
    return new Response(null, { status: 302, headers });
  };

  // 绑定到当前账号
  if (state.l) {
    if (!ctx.user) return ctx.redirect('/login', 'auth.stateMismatch', 'error');
    const existing = await ctx.env.DB.prepare(
      'SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_account_id = ?',
    )
      .bind(provider.id, profile.providerId)
      .first<{ user_id: string }>();
    if (existing && existing.user_id !== ctx.user.id) {
      return ctx.redirect('/settings', 'auth.oauthError', 'error');
    }
    await ctx.env.DB.prepare(
      `INSERT OR IGNORE INTO oauth_accounts (id, user_id, provider, provider_account_id, username, avatar_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), ctx.user.id, provider.id, profile.providerId, profile.username || null, profile.avatar || null, Date.now())
      .run();
    return done('/settings');
  }

  const account = await ctx.env.DB.prepare(
    'SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_account_id = ?',
  )
    .bind(provider.id, profile.providerId)
    .first<{ user_id: string }>();

  let userId = account?.user_id || null;

  if (!userId && profile.email && profile.emailVerified) {
    const byEmail = await ctx.env.DB.prepare('SELECT id FROM users WHERE lower(email) = ?')
      .bind(profile.email.toLowerCase())
      .first<{ id: string }>();
    if (byEmail) userId = byEmail.id;
  }

  if (!userId) {
    const total = await countUsers(ctx.env);
    const base = normalizeUsername(profile.username || profile.name);
    const username = await uniqueUsername(ctx.env, base);
    const id = crypto.randomUUID();
    const now = Date.now();
    await ctx.env.DB.prepare(
      `INSERT INTO users (id, username, email, display_name, avatar_url, role, email_verified, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        username,
        profile.email && profile.emailVerified ? profile.email.toLowerCase() : null,
        profile.name || username,
        profile.avatar || null,
        total === 0 ? 'admin' : 'member',
        profile.emailVerified ? 1 : 0,
        now,
        now,
      )
      .run();
    userId = id;
  }

  await ctx.env.DB.prepare(
    `INSERT OR IGNORE INTO oauth_accounts (id, user_id, provider, provider_account_id, username, avatar_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), userId, provider.id, profile.providerId, profile.username || null, profile.avatar || null, Date.now())
    .run();

  const user = await getUserById(ctx.env, userId);
  if (!user) return ctx.redirect('/login', 'auth.oauthError', 'error');
  if (user.status === 'banned') return ctx.redirect('/login', 'auth.banned', 'error');

  await ctx.env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(Date.now(), user.id).run();
  const session = await createSessionCookie(user, ctx.env.SESSION_SECRET);
  return done(safeNext(state.r), session);
});
