import { get, post } from '../router';
import {
  bookmarkedTopics,
  getUserByUsername,
  likesReceived,
  listTopics,
  topicsRepliedBy,
} from '../lib/db';
import { bookmarksPage, errorPage, notificationsPage, profilePage, settingsPage } from '../views/pages';
import { createSessionCookie, hashPassword, isValidEmail, passwordIterations, verifyPassword } from '../lib/auth';
import type { User } from '../lib/types';

function safeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return '';
  return /^https?:\/\/[^\s]+$/i.test(value) && value.length <= 200 ? value : null;
}

/* ------------------------------------------------------------------ 个人主页 */

get('/u/:username', async (ctx) => {
  const profile = await getUserByUsername(ctx.env, ctx.params.username);
  if (!profile) return ctx.html(errorPage(ctx, 404, ctx.t('user.notFound')), 404);

  const tab = ctx.query.get('tab') === 'replies' ? 'replies' : 'topics';
  const [topics, likes] = await Promise.all([
    tab === 'replies'
      ? topicsRepliedBy(ctx.env, profile.id, 30)
      : listTopics(ctx.env, { authorId: profile.id, sort: 'latest', perPage: 30 }).then((r) => r.topics),
    likesReceived(ctx.env, profile.id),
  ]);

  return ctx.html(
    profilePage(ctx, {
      profile,
      topics,
      likes,
      tab,
      isSelf: ctx.user?.id === profile.id,
    }),
  );
});

/* ------------------------------------------------------------------ 设置 */

get('/settings', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login?next=/settings');
  const accounts = await ctx.env.DB.prepare(
    'SELECT provider, username, created_at FROM oauth_accounts WHERE user_id = ? ORDER BY created_at ASC',
  )
    .bind(ctx.user.id)
    .all<{ provider: string; username: string | null; created_at: number }>();

  return ctx.html(settingsPage(ctx, { user: ctx.user, accounts: accounts.results ?? [] }));
});

post('/settings/profile', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login?next=/settings');
  const u = ctx.user;
  const display_name = String(ctx.form?.get('display_name') || '').trim().slice(0, 40);
  const email = String(ctx.form?.get('email') || '').trim().toLowerCase();
  const avatar_url = safeUrl(String(ctx.form?.get('avatar_url') || ''));
  const website = safeUrl(String(ctx.form?.get('website') || ''));
  const location = String(ctx.form?.get('location') || '').trim().slice(0, 60);
  const bio = String(ctx.form?.get('bio') || '').trim().slice(0, 300);

  const fail = async (msg: string) => {
    const accounts = await ctx.env.DB.prepare(
      'SELECT provider, username, created_at FROM oauth_accounts WHERE user_id = ?',
    )
      .bind(u.id)
      .all<{ provider: string; username: string | null; created_at: number }>();
    return ctx.html(settingsPage(ctx, { user: u, accounts: accounts.results ?? [], error: msg }), 400);
  };

  if (!display_name) return fail(ctx.t('error.badRequest'));
  if (email && !isValidEmail(email)) return fail(ctx.t('auth.invalidEmail'));
  if (avatar_url === null) return fail(ctx.t('error.badRequest'));
  if (website === null) return fail(ctx.t('error.badRequest'));

  if (email && email !== (u.email || '').toLowerCase()) {
    const taken = await ctx.env.DB.prepare('SELECT id FROM users WHERE lower(email) = ? AND id != ?')
      .bind(email, u.id)
      .first();
    if (taken) return fail(ctx.t('auth.emailTaken'));
  }

  await ctx.env.DB.prepare(
    `UPDATE users SET display_name = ?, email = ?, avatar_url = ?, website = ?, location = ?, bio = ?,
       email_verified = CASE WHEN lower(COALESCE(email,'')) = ? THEN email_verified ELSE 0 END
     WHERE id = ?`,
  )
    .bind(display_name, email || null, avatar_url || null, website || null, location || null, bio || null, email, u.id)
    .run();

  return ctx.redirect('/settings', 'user.saved');
});

post('/settings/password', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login');
  const current = String(ctx.form?.get('current') || '');
  const next = String(ctx.form?.get('password') || '');

  if (!(await verifyPassword(ctx.user.password_hash, current))) {
    const accounts = await ctx.env.DB.prepare(
      'SELECT provider, username, created_at FROM oauth_accounts WHERE user_id = ?',
    )
      .bind(ctx.user.id)
      .all<{ provider: string; username: string | null; created_at: number }>();
    return ctx.html(
      settingsPage(ctx, { user: ctx.user, accounts: accounts.results ?? [], error: ctx.t('user.wrongPassword') }),
      400,
    );
  }
  if (next.length < 8) {
    return ctx.redirect('/settings', 'auth.passwordShort', 'error');
  }

  const hash = await hashPassword(next, passwordIterations(ctx.env));
  await ctx.env.DB.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
    .bind(hash, ctx.user.id)
    .run();

  const fresh = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(ctx.user.id).first<User>();
  if (!fresh) return ctx.redirect('/login');
  const cookie = await createSessionCookie(fresh, ctx.env.SESSION_SECRET);
  return new Response(null, {
    status: 302,
    headers: {
      location: '/settings?flash=user.saved&ft=ok',
      'set-cookie': cookie,
      'cache-control': 'no-store',
    },
  });
});

post('/settings/disconnect', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login');
  const provider = String(ctx.form?.get('provider') || '');

  const accounts = await ctx.env.DB.prepare('SELECT provider FROM oauth_accounts WHERE user_id = ?')
    .bind(ctx.user.id)
    .all<{ provider: string }>();
  const list = accounts.results ?? [];
  const hasPassword = !!ctx.user.password_hash;

  if (list.length <= 1 && !hasPassword) {
    return ctx.redirect('/settings', 'auth.disconnectLast', 'error');
  }

  await ctx.env.DB.prepare('DELETE FROM oauth_accounts WHERE user_id = ? AND provider = ?')
    .bind(ctx.user.id, provider)
    .run();
  return ctx.redirect('/settings', 'auth.disconnectSuccess');
});

/* ------------------------------------------------------------------ 通知 */

get('/notifications', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login?next=/notifications');
  const rows = await ctx.env.DB.prepare(
    `SELECT n.id, n.type, n.topic_id, n.created_at, n.is_read,
            u.display_name AS actor_name, u.username AS actor_username, u.avatar_url AS actor_avatar,
            t.title AS topic_title
     FROM notifications n
     LEFT JOIN users u ON u.id = n.actor_id
     LEFT JOIN topics t ON t.id = n.topic_id
     WHERE n.user_id = ?
     ORDER BY n.created_at DESC LIMIT 60`,
  )
    .bind(ctx.user.id)
    .all<any>();

  return ctx.html(notificationsPage(ctx, rows.results ?? []));
});

post('/notifications/read', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login');
  await ctx.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
    .bind(ctx.user.id)
    .run();
  return ctx.redirect('/notifications');
});

/* ------------------------------------------------------------------ 收藏 */

get('/bookmarks', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login?next=/bookmarks');
  const topics = await bookmarkedTopics(ctx.env, ctx.user.id, 40);
  return ctx.html(bookmarksPage(ctx, topics));
});
