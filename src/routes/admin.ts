import { get, post } from '../router';
import {
  getCategories,
  getCategoryById,
  getSettings,
  setSetting,
  stats as fetchStats,
  logAudit,
  listAuditLogs,
} from '../lib/db';
import { adminAudit, adminCategories, adminOverview, adminReports, adminSettings, adminTopics, adminUsers } from '../views/admin';
import { errorPage } from '../views/pages';
import { isAdmin, isStaff } from '../lib/auth';
import { parseIntParam } from '../lib/utils';
import type { User } from '../lib/types';
import type { Ctx } from '../types';

const ADMIN_ROLES = new Set(['admin', 'moderator', 'member']);

function guard(ctx: Ctx, adminOnly = false): Response | null {
  if (!ctx.user || !isStaff(ctx.user) || (adminOnly && !isAdmin(ctx.user))) {
    return ctx.html(errorPage(ctx, 403, ctx.t('admin.noPermission')), 403);
  }
  return null;
}

get('/admin', async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;

  const [siteStats, recent, recentTopics, pending] = await Promise.all([
    fetchStats(ctx.env),
    ctx.env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 8').all<User>(),
    ctx.env.DB.prepare(
      `SELECT t.id, t.title, t.created_at, u.display_name AS author_name
       FROM topics t JOIN users u ON u.id = t.author_id WHERE t.is_deleted = 0
       ORDER BY t.created_at DESC LIMIT 8`,
    ).all<any>(),
    ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'pending'").first<{ n: number }>(),
  ]);

  return ctx.html(
    adminOverview(ctx, {
      stats: siteStats,
      pending: pending?.n ?? 0,
      recentUsers: recent.results ?? [],
      recentTopics: recentTopics.results ?? [],
    }),
  );
});

get('/admin/users', async (ctx) => {
  const denied = guard(ctx, true);
  if (denied) return denied;

  const q = (ctx.query.get('q') || '').trim().slice(0, 60);
  const page = parseIntParam(ctx.query.get('page'), 1);
  const perPage = 25;

  const where = q ? 'WHERE username LIKE ? OR email LIKE ? OR display_name LIKE ?' : '';
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];

  const [rows, total] = await Promise.all([
    ctx.env.DB.prepare(`SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...params, perPage, (page - 1) * perPage)
      .all<User>(),
    ctx.env.DB.prepare(`SELECT COUNT(*) AS n FROM users ${where}`)
      .bind(...params)
      .first<{ n: number }>(),
  ]);

  const totalCount = total?.n ?? 0;
  return ctx.html(
    adminUsers(ctx, {
      users: rows.results ?? [],
      q,
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / perPage)),
    }),
  );
});

post('/admin/users/:id/role', async (ctx) => {
  const denied = guard(ctx, true);
  if (denied) return denied;
  if (ctx.params.id === ctx.user!.id) return ctx.redirect('/admin/users', 'error.noPermission', 'error');

  const role = String(ctx.form?.get('role') || '');
  if (!ADMIN_ROLES.has(role)) return ctx.html(errorPage(ctx, 400, ctx.t('error.badRequest')), 400);

  await ctx.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, ctx.params.id).run();
  await logAudit(ctx.env, { actorId: ctx.user!.id, action: 'user.role', targetType: 'user', targetId: ctx.params.id, detail: role });
  return ctx.redirect('/admin/users', 'admin.userUpdated');
});

post('/admin/users/:id/status', async (ctx) => {
  const denied = guard(ctx, true);
  if (denied) return denied;
  if (ctx.params.id === ctx.user!.id) return ctx.redirect('/admin/users', 'error.noPermission', 'error');

  const status = String(ctx.form?.get('status') || '');
  if (status !== 'active' && status !== 'banned') return ctx.html(errorPage(ctx, 400, ctx.t('error.badRequest')), 400);

  await ctx.env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(status, ctx.params.id).run();
  await logAudit(ctx.env, { actorId: ctx.user!.id, action: `user.${status === 'banned' ? 'ban' : 'unban'}`, targetType: 'user', targetId: ctx.params.id });
  return ctx.redirect('/admin/users', 'admin.userUpdated');
});

/** 禁言 / 解除禁言（时长由 duration 表单字段决定） */
const MUTE_DURATIONS: Record<string, number> = {
  '1h': 3600_000,
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
};

post('/admin/users/:id/mute', async (ctx) => {
  const denied = guard(ctx, true);
  if (denied) return denied;
  if (ctx.params.id === ctx.user!.id) return ctx.redirect('/admin/users', 'error.noPermission', 'error');

  const action = String(ctx.form?.get('action') || '');
  let mutedUntil: number | null = null;
  let auditAction = 'user.unmute';

  if (action === 'mute') {
    const duration = String(ctx.form?.get('duration') || '');
    const ms = MUTE_DURATIONS[duration];
    if (!ms) return ctx.html(errorPage(ctx, 400, ctx.t('error.badRequest')), 400);
    mutedUntil = Date.now() + ms;
    auditAction = `user.mute.${duration}`;
  }

  await ctx.env.DB.prepare('UPDATE users SET muted_until = ? WHERE id = ?').bind(mutedUntil, ctx.params.id).run();
  await logAudit(ctx.env, { actorId: ctx.user!.id, action: auditAction, targetType: 'user', targetId: ctx.params.id });
  return ctx.redirect('/admin/users', 'admin.userUpdated');
});

get('/admin/categories', async (ctx) => {
  const denied = guard(ctx, true);
  if (denied) return denied;

  const categories = await getCategories(ctx.env);
  const editId = parseIntParam(ctx.query.get('edit'), 0);
  const edit = editId ? await getCategoryById(ctx.env, editId) : null;
  return ctx.html(adminCategories(ctx, { categories, edit }));
});

function categoryPayload(ctx: any): { ok: boolean; data?: Record<string, any>; error?: string } {
  const name = String(ctx.form?.get('name') || '').trim().slice(0, 40);
  const name_en = String(ctx.form?.get('name_en') || '').trim().slice(0, 40);
  const slug = String(ctx.form?.get('slug') || '').trim().toLowerCase();
  const description = String(ctx.form?.get('description') || '').trim().slice(0, 160);
  const description_en = String(ctx.form?.get('description_en') || '').trim().slice(0, 160);
  const icon = String(ctx.form?.get('icon') || 'chat').slice(0, 20);
  const colorRaw = String(ctx.form?.get('color') || '#6366f1');
  const color = /^#[0-9a-fA-F]{6}$/.test(colorRaw) ? colorRaw : '#6366f1';
  const position = Number.parseInt(String(ctx.form?.get('position') || '0'), 10);
  const admin_only = ctx.form?.get('admin_only') ? 1 : 0;

  if (!name) return { ok: false, error: ctx.t('error.badRequest') };
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return { ok: false, error: ctx.t('error.badRequest') };
  return { ok: true, data: { name, name_en, slug, description, description_en, icon, color, position: Number.isFinite(position) ? position : 0, admin_only } };
}

post('/admin/categories', async (ctx) => {
  const denied = guard(ctx, true);
  if (denied) return denied;
  const parsed = categoryPayload(ctx);
  if (!parsed.ok) return ctx.html(errorPage(ctx, 400, parsed.error), 400);

  const d = parsed.data!;
  const exists = await ctx.env.DB.prepare('SELECT id FROM categories WHERE slug = ?').bind(d.slug).first();
  if (exists) return ctx.redirect('/admin/categories', 'error.badRequest', 'error');

  await ctx.env.DB.prepare(
    `INSERT INTO categories (slug, name, name_en, description, description_en, icon, color, position, admin_only, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(d.slug, d.name, d.name_en || null, d.description || null, d.description_en || null, d.icon, d.color, d.position, d.admin_only, Date.now())
    .run();
  await logAudit(ctx.env, { actorId: ctx.user!.id, action: 'category.create', targetType: 'category', targetId: d.slug });
  return ctx.redirect('/admin/categories', 'admin.categoryUpdated');
});

post('/admin/categories/:id', async (ctx) => {
  const denied = guard(ctx, true);
  if (denied) return denied;
  const id = parseIntParam(ctx.params.id, 0);
  if (!id) return ctx.html(errorPage(ctx, 400), 400);
  const parsed = categoryPayload(ctx);
  if (!parsed.ok) return ctx.html(errorPage(ctx, 400, parsed.error), 400);

  const d = parsed.data!;
  const dup = await ctx.env.DB.prepare('SELECT id FROM categories WHERE slug = ? AND id != ?').bind(d.slug, id).first();
  if (dup) return ctx.redirect('/admin/categories', 'error.badRequest', 'error');

  await ctx.env.DB.prepare(
    `UPDATE categories SET slug = ?, name = ?, name_en = ?, description = ?, description_en = ?, icon = ?, color = ?,
       position = ?, admin_only = ? WHERE id = ?`,
  )
    .bind(d.slug, d.name, d.name_en || null, d.description || null, d.description_en || null, d.icon, d.color, d.position, d.admin_only, id)
    .run();
  await logAudit(ctx.env, { actorId: ctx.user!.id, action: 'category.update', targetType: 'category', targetId: d.slug });
  return ctx.redirect('/admin/categories', 'admin.categoryUpdated');
});

post('/admin/categories/:id/delete', async (ctx) => {
  const denied = guard(ctx, true);
  if (denied) return denied;
  const id = parseIntParam(ctx.params.id, 0);
  const cat = await getCategoryById(ctx.env, id);
  if (!cat) return ctx.html(errorPage(ctx, 404), 404);

  const topics = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM topics WHERE category_id = ?').bind(id).first<{ n: number }>();
  if ((topics?.n ?? 0) > 0) return ctx.redirect('/admin/categories', 'admin.categoryInUse', 'error');

  await ctx.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
  await logAudit(ctx.env, { actorId: ctx.user!.id, action: 'category.delete', targetType: 'category', targetId: cat.slug });
  return ctx.redirect('/admin/categories', 'admin.categoryDeleted');
});

/* ------------------------------------------------------------------ 帖子管理 */

const TOPIC_STATUS_SQL: Record<string, string> = {
  locked: 't.is_locked = 1',
  pinned: 't.is_pinned = 1',
  featured: 't.is_featured = 1',
};

get('/admin/topics', async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;

  const q = (ctx.query.get('q') || '').trim().slice(0, 60);
  const status = ctx.query.get('status') || '';
  const tab = ctx.query.get('tab') === 'replies' ? 'replies' : 'topics';
  const page = Math.max(1, parseIntParam(ctx.query.get('page'), 1));
  const perPage = 25;

  if (tab === 'replies') {
    const where = q ? 'WHERE p.is_deleted = 0 AND p.content LIKE ?' : 'WHERE p.is_deleted = 0';
    const params = q ? [`%${q}%`] : [];
    const [rows, total] = await Promise.all([
      ctx.env.DB.prepare(
        `SELECT p.id, p.topic_id, p.content, p.is_deleted, p.created_at,
                u.username AS author_username, u.display_name AS author_name, u.avatar_url AS author_avatar
         FROM posts p JOIN users u ON u.id = p.author_id
         ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      )
        .bind(...params, perPage, (page - 1) * perPage)
        .all<any>(),
      ctx.env.DB.prepare(`SELECT COUNT(*) AS n FROM posts p ${where}`).bind(...params).first<{ n: number }>(),
    ]);
    return ctx.html(
      adminTopics(ctx, {
        tab,
        q,
        status,
        page,
        totalPages: Math.max(1, Math.ceil((total?.n ?? 0) / perPage)),
        topics: [],
        replies: rows.results ?? [],
      }),
    );
  }

  const statusSql = TOPIC_STATUS_SQL[status];
  const clauses: string[] = ['t.is_deleted = 0'];
  const params: unknown[] = [];
  if (statusSql) clauses.push(statusSql);
  if (q) {
    clauses.push('(t.title LIKE ? OR t.excerpt LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [rows, total] = await Promise.all([
    ctx.env.DB.prepare(
      `SELECT t.id, t.title, t.is_pinned, t.is_locked, t.is_featured, t.is_deleted,
              t.reply_count, t.like_count, t.views, t.created_at,
              u.username AS author_username, u.display_name AS author_name,
              c.name AS category_name
       FROM topics t
       JOIN users u ON u.id = t.author_id
       JOIN categories c ON c.id = t.category_id
       ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(...params, perPage, (page - 1) * perPage)
      .all<any>(),
    ctx.env.DB.prepare(`SELECT COUNT(*) AS n FROM topics t ${where}`).bind(...params).first<{ n: number }>(),
  ]);

  return ctx.html(
    adminTopics(ctx, {
      tab,
      q,
      status,
      page,
      totalPages: Math.max(1, Math.ceil((total?.n ?? 0) / perPage)),
      topics: rows.results ?? [],
      replies: [],
    }),
  );
});

post('/admin/topics/:id', async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  const id = parseIntParam(ctx.params.id, 0);
  const action = String(ctx.form?.get('action') || '');
  const now = Date.now();

  // 硬删除：连同回复、点赞、收藏、通知一并清除，并回收计数
  if (action === 'delete') {
    const topic = await ctx.env.DB.prepare('SELECT id, author_id, category_id, reply_count FROM topics WHERE id = ?')
      .bind(id)
      .first<any>();
    if (!topic) return ctx.html(errorPage(ctx, 404), 404);

    await ctx.env.DB.batch([
      ctx.env.DB.prepare('DELETE FROM posts WHERE topic_id = ?').bind(id),
      ctx.env.DB.prepare('DELETE FROM search_index WHERE topic_id = ? AND kind = \'topic\'').bind(id),
      ctx.env.DB.prepare('DELETE FROM likes WHERE target_type = \'topic\' AND target_id = ?').bind(id),
      ctx.env.DB.prepare('DELETE FROM bookmarks WHERE topic_id = ?').bind(id),
      ctx.env.DB.prepare('DELETE FROM notifications WHERE topic_id = ?').bind(id),
      ctx.env.DB.prepare('UPDATE users SET topic_count = MAX(topic_count - 1, 0), post_count = MAX(post_count - 1, 0) WHERE id = ?').bind(topic.author_id),
      ctx.env.DB.prepare('UPDATE categories SET topic_count = MAX(topic_count - 1, 0), post_count = MAX(post_count - ? , 0) WHERE id = ?').bind(topic.reply_count + 1, topic.category_id),
      ctx.env.DB.prepare('DELETE FROM topics WHERE id = ?').bind(id),
    ]);
    await logAudit(ctx.env, { actorId: ctx.user!.id, action: 'topic.delete', targetType: 'topic', targetId: id, detail: String(topic.title).slice(0, 60) });

    const back = `/admin/topics?tab=topics${ctx.form?.get('q') ? `&q=${encodeURIComponent(String(ctx.form.get('q')))}` : ''}${ctx.form?.get('status') ? `&status=${encodeURIComponent(String(ctx.form.get('status')))}` : ''}`;
    return ctx.redirect(back, 'admin.topicDeleted');
  }

  const sql: Record<string, string> = {
    pin: 'UPDATE topics SET is_pinned = 1, updated_at = ? WHERE id = ?',
    unpin: 'UPDATE topics SET is_pinned = 0, updated_at = ? WHERE id = ?',
    lock: 'UPDATE topics SET is_locked = 1, updated_at = ? WHERE id = ?',
    unlock: 'UPDATE topics SET is_locked = 0, updated_at = ? WHERE id = ?',
    feature: 'UPDATE topics SET is_featured = 1 - is_featured, updated_at = ? WHERE id = ?',
  };
  if (!id || !sql[action]) return ctx.html(errorPage(ctx, 400, ctx.t('error.badRequest')), 400);
  await ctx.env.DB.prepare(sql[action]).bind(now, id).run();
  await logAudit(ctx.env, { actorId: ctx.user!.id, action: `topic.${action}`, targetType: 'topic', targetId: id });

  const back = `/admin/topics?tab=topics${ctx.form?.get('q') ? `&q=${encodeURIComponent(String(ctx.form.get('q')))}` : ''}${ctx.form?.get('status') ? `&status=${encodeURIComponent(String(ctx.form.get('status')))}` : ''}`;
  return ctx.redirect(back, 'admin.saved');
});

post('/admin/posts/:id/delete', async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  const id = parseIntParam(ctx.params.id, 0);
  const target = await ctx.env.DB.prepare('SELECT id, topic_id, author_id FROM posts WHERE id = ?').bind(id).first<any>();
  if (!target) return ctx.html(errorPage(ctx, 404), 404);

  // 硬删除回复：FTS 由 DELETE 触发器清理
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM likes WHERE target_type = \'post\' AND target_id = ?').bind(id),
    ctx.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id),
    ctx.env.DB.prepare('UPDATE topics SET reply_count = MAX(reply_count - 1, 0) WHERE id = ?').bind(target.topic_id),
    ctx.env.DB.prepare('UPDATE users SET post_count = MAX(post_count - 1, 0) WHERE id = ?').bind(target.author_id),
  ]);
  await logAudit(ctx.env, { actorId: ctx.user!.id, action: 'post.delete', targetType: 'post', targetId: id });
  return ctx.redirect('/admin/topics?tab=replies', 'admin.replyDeleted');
});

get('/admin/audit', async (ctx) => {
  const denied = guard(ctx, true);
  if (denied) return denied;
  const logs = await listAuditLogs(ctx.env, 150);
  return ctx.html(adminAudit(ctx, logs));
});

get('/admin/reports', async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;

  const rows = await ctx.env.DB.prepare(
    `SELECT r.*, u.display_name AS reporter_name, u.username AS reporter_username,
            t.id AS topic_id, t.title AS topic_title
     FROM reports r
     JOIN users u ON u.id = r.reporter_id
     LEFT JOIN topics t ON (r.target_type = 'topic' AND t.id = r.target_id)
       OR (r.target_type = 'post' AND t.id = (SELECT topic_id FROM posts WHERE id = r.target_id))
     ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC
     LIMIT 60`,
  ).all<any>();

  return ctx.html(adminReports(ctx, rows.results ?? []));
});

post('/admin/reports/:id', async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  const id = parseIntParam(ctx.params.id, 0);
  const status = String(ctx.form?.get('status') || '');
  if (status !== 'resolved' && status !== 'dismissed') {
    return ctx.html(errorPage(ctx, 400, ctx.t('error.badRequest')), 400);
  }
  await ctx.env.DB.prepare('UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?')
    .bind(status, ctx.user!.id, Date.now(), id)
    .run();
  await logAudit(ctx.env, { actorId: ctx.user!.id, action: `report.${status}`, targetType: 'report', targetId: id });
  return ctx.redirect('/admin/reports', status === 'resolved' ? 'admin.reportResolved' : 'admin.reportDismissed');
});

get('/admin/settings', async (ctx) => {
  const denied = guard(ctx, true);
  if (denied) return denied;
  const settings = await getSettings(ctx.env);
  return ctx.html(adminSettings(ctx, settings));
});

post('/admin/settings', async (ctx) => {
  const denied = guard(ctx, true);
  if (denied) return denied;

  const siteName = String(ctx.form?.get('site_name') || '').trim().slice(0, 40);
  const announcement = String(ctx.form?.get('announcement') || '').trim().slice(0, 300);
  const allow = ctx.form?.get('allow_registration') ? 'true' : 'false';

  if (siteName) await setSetting(ctx.env, 'site_name', siteName);
  await setSetting(ctx.env, 'announcement', announcement);
  await setSetting(ctx.env, 'allow_registration', allow);

  return ctx.redirect('/admin/settings', 'admin.saved');
});
