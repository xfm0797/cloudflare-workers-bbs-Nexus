import { get, post } from '../router';
import {
  getCategories,
  getCategoryById,
  getSettings,
  setSetting,
  stats as fetchStats,
} from '../lib/db';
import { adminCategories, adminOverview, adminReports, adminSettings, adminUsers } from '../views/admin';
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
  return ctx.redirect('/admin/users', 'admin.userUpdated');
});

post('/admin/users/:id/status', async (ctx) => {
  const denied = guard(ctx, true);
  if (denied) return denied;
  if (ctx.params.id === ctx.user!.id) return ctx.redirect('/admin/users', 'error.noPermission', 'error');

  const status = String(ctx.form?.get('status') || '');
  if (status !== 'active' && status !== 'banned') return ctx.html(errorPage(ctx, 400, ctx.t('error.badRequest')), 400);

  await ctx.env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(status, ctx.params.id).run();
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
  return ctx.redirect('/admin/categories', 'admin.categoryDeleted');
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
