import type { Ctx } from '../types';
import type { Category, User } from '../lib/types';
import { formatDate, formatDateTime } from '../lib/i18n';
import { isMuted } from '../lib/db';
import { escapeHtml as e } from '../lib/utils';
import { avatar, csrfField, emptyState, icon, pagination, roleBadge } from './ui';
import { layout } from './layout';

function adminNav(ctx: Ctx, active: string): string {
  const isAdminUser = ctx.user?.role === 'admin';
  const items = [
    { key: 'overview', label: ctx.t('admin.dashboard'), href: '/admin', icon: 'home' },
    { key: 'users', label: ctx.t('admin.users'), href: '/admin/users', icon: 'users' },
    { key: 'topics', label: ctx.t('admin.topics'), href: '/admin/topics', icon: 'message' },
    { key: 'categories', label: ctx.t('admin.categories'), href: '/admin/categories', icon: 'listIcon' },
    { key: 'reports', label: ctx.t('admin.reports'), href: '/admin/reports', icon: 'alert' },
    { key: 'settings', label: ctx.t('admin.siteSettings'), href: '/admin/settings', icon: 'settings' },
    ...(isAdminUser ? [{ key: 'audit', label: ctx.t('audit.title'), href: '/admin/audit', icon: 'file' }] : []),
  ];
  return `<nav class="admin-nav">
    ${items
      .map(
        (i) => `<a class="admin-nav-link ${active === i.key ? 'is-active' : ''}" href="${i.href}">${icon(i.icon, 17)}${e(
          i.label,
        )}</a>`,
      )
      .join('')}
  </nav>`;
}

function shell(ctx: Ctx, active: string, title: string, body: string): string {
  return layout(ctx, {
    title: `${ctx.t('admin.title')} · ${title}`,
    noindex: true,
    body: `<div class="page-head"><h1>${e(title)}</h1></div><div class="admin-grid">${adminNav(ctx, active)}<div class="admin-main">${body}</div></div>`,
  });
}

export function adminOverview(
  ctx: Ctx,
  data: {
    stats: { users: number; topics: number; posts: number; likes: number; online: number; newUsers: number };
    pending: number;
    recentUsers: User[];
    recentTopics: { id: number; title: string; created_at: number; author_name: string }[];
  },
): string {
  const card = (label: string, value: number | string, iconName: string, hint?: string) =>
    `<div class="metric-card">
      <div class="metric-icon">${icon(iconName, 18)}</div>
      <div><div class="metric-value">${e(value)}</div><div class="metric-label">${e(label)}</div></div>
      ${hint ? `<span class="metric-hint">${e(hint)}</span>` : ''}
    </div>`;

  const body = `<div class="metric-grid">
      ${card(ctx.t('admin.totalUsers'), data.stats.users, 'users', `+${data.stats.newUsers} / 7d`)}
      ${card(ctx.t('admin.totalTopics'), data.stats.topics, 'message')}
      ${card(ctx.t('admin.totalPosts'), data.stats.posts, 'reply')}
      ${card(ctx.t('admin.totalLikes'), data.stats.likes, 'heart')}
      ${card(ctx.t('admin.pendingReports'), data.pending, 'alert')}
      ${card(ctx.t('home.stats.online'), data.stats.online, 'eye')}
    </div>
    <div class="admin-cols">
      <section class="card">
        <div class="card-head"><h2>${e(ctx.t('admin.recentUsers'))}</h2><a href="/admin/users">${e(ctx.t('action.viewAll'))}</a></div>
        <div class="user-rows">
          ${data.recentUsers
            .map(
              (u) => `<a class="user-row" href="/u/${e(u.username)}">
                ${avatar({ name: u.display_name, username: u.username, url: u.avatar_url, size: 32 })}
                <div class="user-row-info"><strong>${e(u.display_name)}</strong><span>@${e(u.username)}</span></div>
                <span class="user-row-time">${e(formatDate(u.created_at, ctx.locale))}</span>
              </a>`,
            )
            .join('')}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>${e(ctx.t('home.latest'))}</h2><a href="/">${e(ctx.t('action.viewAll'))}</a></div>
        <div class="user-rows">
          ${data.recentTopics
            .map(
              (t) => `<a class="user-row" href="/t/${t.id}">
                <div class="user-row-info"><strong>${e(t.title)}</strong><span>${e(t.author_name)}</span></div>
                <span class="user-row-time">${e(formatDate(t.created_at, ctx.locale))}</span>
              </a>`,
            )
            .join('')}
        </div>
      </section>
    </div>`;
  return shell(ctx, 'overview', ctx.t('admin.overview'), body);
}

export function adminUsers(
  ctx: Ctx,
  data: { users: User[]; q: string; page: number; totalPages: number },
): string {
  const rows = data.users
    .map((u) => {
      const isSelf = ctx.user?.id === u.id;
      return `<tr>
        <td>
          <div class="table-user">
            ${avatar({ name: u.display_name, username: u.username, url: u.avatar_url, size: 32 })}
            <div><a href="/u/${e(u.username)}"><strong>${e(u.display_name)}</strong></a><span>@${e(u.username)}${u.email ? ' · ' + e(u.email) : ''}</span></div>
          </div>
        </td>
        <td>${roleBadge(ctx, u.role) || `<span class="muted">${e(ctx.t('role.member'))}</span>`}</td>
        <td>${
          u.status === 'banned'
            ? `<span class="badge badge-danger">${e(ctx.t('admin.ban'))}</span>`
            : isMuted(u)
              ? `<span class="badge badge-warn">${e(ctx.t('admin.mutedUntil', { time: formatDateTime(u.muted_until!, ctx.locale) }))}</span>`
              : `<span class="badge badge-ok">${e(ctx.t('admin.statusActive'))}</span>`
        }</td>
        <td class="num">${u.topic_count}</td>
        <td class="num">${u.post_count}</td>
        <td class="num muted">${e(formatDate(u.created_at, ctx.locale))}</td>
        <td>
          ${
            isSelf
              ? '<span class="muted">—</span>'
              : `<details class="dropdown row-actions">
                  <summary class="btn btn-ghost btn-xs">${icon('settings', 14)}${e(ctx.t('admin.actions'))}</summary>
                  <div class="dropdown-panel">
                    <form method="post" action="/admin/users/${u.id}/role">
                      ${csrfField(ctx)}
                      <input type="hidden" name="role" value="admin" />
                      <button class="dropdown-item" type="submit">${icon('shield', 15)}${e(ctx.t('admin.makeAdmin'))}</button>
                    </form>
                    <form method="post" action="/admin/users/${u.id}/role">
                      ${csrfField(ctx)}
                      <input type="hidden" name="role" value="moderator" />
                      <button class="dropdown-item" type="submit">${icon('user', 15)}${e(ctx.t('admin.makeModerator'))}</button>
                    </form>
                    <form method="post" action="/admin/users/${u.id}/role">
                      ${csrfField(ctx)}
                      <input type="hidden" name="role" value="member" />
                      <button class="dropdown-item" type="submit">${icon('user', 15)}${e(ctx.t('admin.makeMember'))}</button>
                    </form>
                    <div class="dropdown-sep"></div>
                    <form method="post" action="/admin/users/${u.id}/mute" class="dropdown-mute">
                      ${csrfField(ctx)}
                      ${isMuted(u)
                        ? `<input type="hidden" name="action" value="unmute" />
                           <button class="dropdown-item" type="submit">${icon('unlock', 15)}${e(ctx.t('admin.unmute'))}</button>`
                        : `<input type="hidden" name="action" value="mute" />
                           <button class="dropdown-item is-danger" type="submit">${icon('lock', 15)}${e(ctx.t('admin.mute'))}</button>
                           <div class="mute-opts">
                             <label><input type="radio" name="duration" value="1h" />1h</label>
                             <label><input type="radio" name="duration" value="24h" checked />24h</label>
                             <label><input type="radio" name="duration" value="7d" />7d</label>
                             <label><input type="radio" name="duration" value="30d" />30d</label>
                           </div>`}
                    </form>
                    <form method="post" action="/admin/users/${u.id}/status">
                      ${csrfField(ctx)}
                      <input type="hidden" name="status" value="${u.status === 'banned' ? 'active' : 'banned'}" />
                      <button class="dropdown-item is-danger" type="submit">${icon('lock', 15)}${e(
                        u.status === 'banned' ? ctx.t('admin.unban') : ctx.t('admin.ban'),
                      )}</button>
                    </form>
                  </div>
                </details>`
          }
        </td>
      </tr>`;
    })
    .join('');

  const body = `<section class="card">
      <div class="card-head">
        <h2>${e(ctx.t('admin.users'))}</h2>
        <form class="inline-search" method="get" action="/admin/users">
          ${icon('search', 15)}<input type="search" name="q" value="${e(data.q)}" placeholder="${e(ctx.t('admin.userSearch'))}" />
        </form>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>${e(ctx.t('admin.user'))}</th><th>${e(ctx.t('admin.role'))}</th><th>${e(ctx.t('admin.status'))}</th>
            <th>${e(ctx.t('user.topics'))}</th><th>${e(ctx.t('user.replies'))}</th><th>${e(ctx.t('user.joined', { date: '' }).trim() || 'Joined')}</th><th></th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="7" class="empty-cell">${e(ctx.t('state.empty'))}</td></tr>`}</tbody>
        </table>
      </div>
      ${pagination(ctx, data.page, data.totalPages, '/admin/users', new URLSearchParams(data.q ? { q: data.q } : {}))}
    </section>`;
  return shell(ctx, 'users', ctx.t('admin.users'), body);
}

/* ------------------------------------------------------------------ 帖子管理 */

export interface AdminTopicRow {
  id: number;
  title: string;
  is_pinned: number;
  is_locked: number;
  is_featured: number;
  is_deleted: number;
  reply_count: number;
  like_count: number;
  views: number;
  created_at: number;
  author_username: string;
  author_name: string;
  category_name: string;
}

const topicStatusBadges = (ctx: Ctx, t: AdminTopicRow): string =>
  [
    t.is_pinned ? `<span class="badge badge-ok">${e(ctx.t('admin.statusPinned'))}</span>` : '',
    t.is_locked ? `<span class="badge">${e(ctx.t('admin.statusLocked'))}</span>` : '',
    t.is_featured ? `<span class="badge">${e(ctx.t('admin.statusFeatured'))}</span>` : '',
  ]
    .filter(Boolean)
    .join(' ');

function topicActionForm(ctx: Ctx, t: AdminTopicRow, action: string, label: string, danger = false): string {
  return `<form method="post" action="/admin/topics/${t.id}">
    ${csrfField(ctx)}
    <input type="hidden" name="action" value="${action}" />
    <input type="hidden" name="q" value="${e(ctx.query.get('q') || '')}" />
    <input type="hidden" name="status" value="${e(ctx.query.get('status') || '')}" />
    <button class="dropdown-item ${danger ? 'is-danger' : ''}" type="submit">${e(label)}</button>
  </form>`;
}

export function adminTopics(
  ctx: Ctx,
  data: { tab: 'topics' | 'replies'; q: string; status: string; page: number; totalPages: number; topics: AdminTopicRow[]; replies: any[] },
): string {
  const qp = new URLSearchParams();
  if (data.q) qp.set('q', data.q);
  if (data.status) qp.set('status', data.status);

  const tabs = `<div class="tabs">
    <a class="tab ${data.tab === 'topics' ? 'is-active' : ''}" href="/admin/topics?tab=topics${data.q ? `&q=${encodeURIComponent(data.q)}` : ''}">${e(ctx.t('admin.tabTopics'))}</a>
    <a class="tab ${data.tab === 'replies' ? 'is-active' : ''}" href="/admin/topics?tab=replies${data.q ? `&q=${encodeURIComponent(data.q)}` : ''}">${e(ctx.t('admin.tabReplies'))}</a>
  </div>`;

  const statusFilter = (key: string, label: string) =>
    `<a class="chip ${data.status === key ? 'is-active' : ''}" href="/admin/topics?tab=${data.tab}${data.q ? `&q=${encodeURIComponent(data.q)}` : ''}${key ? `&status=${key}` : ''}">${e(label)}</a>`;

  const topicRows = data.topics
    .map((t) => {
      const staffActions = [
        topicActionForm(ctx, t, t.is_pinned ? 'unpin' : 'pin', ctx.t(t.is_pinned ? 'admin.unpin' : 'admin.pin')),
        topicActionForm(ctx, t, t.is_locked ? 'unlock' : 'lock', ctx.t(t.is_locked ? 'admin.unlock' : 'admin.lock')),
        topicActionForm(ctx, t, 'feature', ctx.t('admin.feature')),
        topicActionForm(ctx, t, 'delete', ctx.t('admin.delete'), true),
      ].join('');
      return `<tr>
        <td>
          <div class="table-user">
            <div>
              <a href="/t/${t.id}"><strong>${e(t.title)}</strong></a>
              <span>${e(t.author_name)} · ${e(t.category_name)} · ${e(formatDate(t.created_at, ctx.locale))}</span>
            </div>
          </div>
        </td>
        <td>${topicStatusBadges(ctx, t) || '<span class="muted">—</span>'}</td>
        <td class="num">${t.reply_count}</td>
        <td class="num">${t.views}</td>
        <td>
          <details class="dropdown row-actions">
            <summary class="btn btn-ghost btn-xs">${icon('settings', 14)}${e(ctx.t('admin.actions'))}</summary>
            <div class="dropdown-panel">${staffActions}</div>
          </details>
        </td>
      </tr>`;
    })
    .join('');

  const replyRows = data.replies
    .map((p) => {
      const excerpt = p.content.length > 80 ? p.content.slice(0, 80) + '…' : p.content;
      return `<tr class="${p.is_deleted ? 'is-muted-row' : ''}">
        <td>
          <div class="table-user">
            ${avatar({ name: p.author_name, username: p.author_username, url: p.author_avatar, size: 28 })}
            <div>
              <a href="/t/${p.topic_id}#p${p.id}"><strong>${e(p.author_name)}</strong></a>
              <span>${e(excerpt)}</span>
            </div>
          </div>
        </td>
        <td>${p.is_deleted ? `<span class="badge badge-danger">${e(ctx.t('admin.statusDeleted'))}</span>` : '<span class="muted">—</span>'}</td>
        <td class="num muted">${e(formatDate(p.created_at, ctx.locale))}</td>
        <td>
          ${
            p.is_deleted
              ? '<span class="muted">—</span>'
              : `<form method="post" action="/admin/posts/${p.id}/delete">${csrfField(ctx)}<button class="btn btn-ghost btn-xs is-danger-text" type="submit">${icon('trash', 14)}${e(ctx.t('admin.delete'))}</button></form>`
          }
        </td>
      </tr>`;
    })
    .join('');

  const body = `<section class="card">
      <div class="card-head">
        <h2>${e(ctx.t('admin.topics'))}</h2>
        <form class="inline-search" method="get" action="/admin/topics">
          <input type="hidden" name="tab" value="${data.tab}" />
          ${icon('search', 15)}<input type="search" name="q" value="${e(data.q)}" placeholder="${e(ctx.t('admin.userSearch'))}" />
        </form>
      </div>
      ${tabs}
      ${
        data.tab === 'topics'
          ? `<div class="chip-row">${statusFilter('', ctx.t('admin.filterAll'))}${statusFilter('locked', ctx.t('admin.statusLocked'))}${statusFilter('pinned', ctx.t('admin.statusPinned'))}${statusFilter('featured', ctx.t('admin.statusFeatured'))}</div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>${e(ctx.t('admin.tabTopics'))}</th><th>${e(ctx.t('admin.status'))}</th><th>${e(ctx.t('user.replies'))}</th><th>${e(ctx.t('home.stats.views'))}</th><th></th></tr></thead>
          <tbody>${topicRows || `<tr><td colspan="5" class="empty-cell">${e(ctx.t('state.empty'))}</td></tr>`}</tbody>
        </table>
      </div>
      ${pagination(ctx, data.page, data.totalPages, '/admin/topics', qp)}`
          : `<div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>${e(ctx.t('admin.tabReplies'))}</th><th>${e(ctx.t('admin.status'))}</th><th>${e(ctx.t('admin.date'))}</th><th></th></tr></thead>
          <tbody>${replyRows || `<tr><td colspan="4" class="empty-cell">${e(ctx.t('state.empty'))}</td></tr>`}</tbody>
        </table>
      </div>`
      }
    </section>`;

  return shell(ctx, 'topics', ctx.t('admin.topics'), body);
}

export function adminCategories(ctx: Ctx, data: { categories: Category[]; edit?: Category | null }): string {
  const edit = data.edit;
  const form = `<form class="card form-card" method="post" action="${edit ? `/admin/categories/${edit.id}` : '/admin/categories'}">
      ${csrfField(ctx)}
      <h2>${e(edit ? ctx.t('admin.editCategory') : ctx.t('admin.newCategory'))}</h2>
      <div class="form-grid">
        <div class="field">
          <label class="label" for="name">${e(ctx.t('admin.categoryName'))}</label>
          <input class="input" id="name" name="name" required maxlength="40" value="${e(edit?.name || '')}" />
        </div>
        <div class="field">
          <label class="label" for="name_en">${e(ctx.t('admin.categoryNameEn'))}</label>
          <input class="input" id="name_en" name="name_en" maxlength="40" value="${e(edit?.name_en || '')}" />
        </div>
        <div class="field">
          <label class="label" for="slug">${e(ctx.t('admin.categorySlug'))}</label>
          <input class="input" id="slug" name="slug" required pattern="[a-z0-9-]+" maxlength="40" value="${e(edit?.slug || '')}" />
        </div>
        <div class="field">
          <label class="label" for="icon">${e(ctx.t('admin.icon'))}</label>
          <select class="select" id="icon" name="icon">
            ${['chat', 'code', 'lifebuoy', 'box', 'coffee', 'megaphone', 'fire', 'sparkles']
              .map((n) => `<option value="${n}" ${edit?.icon === n ? 'selected' : ''}>${n}</option>`)
              .join('')}
          </select>
        </div>
        <div class="field">
          <label class="label" for="color">${e(ctx.t('admin.color'))}</label>
          <input class="input input-color" id="color" name="color" type="color" value="${e(edit?.color || '#6366f1')}" />
        </div>
        <div class="field">
          <label class="label" for="position">${e(ctx.t('admin.position'))}</label>
          <input class="input" id="position" name="position" type="number" min="0" max="999" value="${edit?.position ?? 0}" />
        </div>
      </div>
      <div class="field">
        <label class="label" for="description">${e(ctx.t('admin.categoryDesc'))}</label>
        <input class="input" id="description" name="description" maxlength="160" value="${e(edit?.description || '')}" />
      </div>
      <div class="field">
        <label class="label" for="description_en">${e(ctx.t('admin.categoryDescEn'))}</label>
        <input class="input" id="description_en" name="description_en" maxlength="160" value="${e(edit?.description_en || '')}" />
      </div>
      <label class="checkbox"><input type="checkbox" name="admin_only" value="1" ${edit?.admin_only ? 'checked' : ''} /><span>${e(
        ctx.t('admin.adminOnly'),
      )}</span></label>
      <div class="form-actions">
        ${edit ? `<a class="btn btn-ghost" href="/admin/categories">${e(ctx.t('action.cancel'))}</a>` : ''}
        <button class="btn btn-primary" type="submit">${e(edit ? ctx.t('admin.saveCategory') : ctx.t('admin.createCategory'))}</button>
      </div>
    </form>`;

  const rows = data.categories
    .map(
      (c) => `<tr>
        <td>
          <div class="table-user">
            <span class="cat-dot cat-dot-lg" style="--c:${e(c.color || '#6366f1')}"></span>
            <div><strong>${e(c.name)}</strong><span>${e(c.slug)} · ${e(c.name_en || '')}</span></div>
          </div>
        </td>
        <td class="num">${c.topic_count}</td>
        <td class="num">${c.post_count}</td>
        <td class="num">${c.position}</td>
        <td>
          <div class="row-inline">
            <a class="btn btn-ghost btn-xs" href="/admin/categories?edit=${c.id}">${icon('edit', 14)}${e(ctx.t('action.edit'))}</a>
            <form method="post" action="/admin/categories/${c.id}/delete" data-confirm="${e(ctx.t('admin.confirmDelete'))}">
              ${csrfField(ctx)}
              <button class="btn btn-ghost btn-xs is-danger" type="submit">${icon('trash', 14)}</button>
            </form>
          </div>
        </td>
      </tr>`,
    )
    .join('');

  const body = `<div class="admin-cols admin-cols-wide">
      <section class="card">
        <div class="card-head"><h2>${e(ctx.t('admin.categories'))}</h2></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>${e(ctx.t('admin.categoryName'))}</th><th>${e(ctx.t('home.stats.topics'))}</th><th>${e(
              ctx.t('home.stats.posts'),
            )}</th><th>${e(ctx.t('admin.position'))}</th><th></th></tr></thead>
            <tbody>${rows || `<tr><td colspan="5" class="empty-cell">${e(ctx.t('state.empty'))}</td></tr>`}</tbody>
          </table>
        </div>
      </section>
      ${form}
    </div>`;
  return shell(ctx, 'categories', ctx.t('admin.categories'), body);
}

export function adminReports(
  ctx: Ctx,
  reports: {
    id: number;
    target_type: string;
    target_id: number;
    reason: string;
    detail: string | null;
    status: string;
    created_at: number;
    reporter_name: string;
    reporter_username: string;
    topic_id: number | null;
    topic_title: string | null;
  }[],
): string {
  const statusLabel = (s: string) =>
    s === 'pending' ? ctx.t('admin.pending') : s === 'resolved' ? ctx.t('admin.resolved') : ctx.t('admin.dismissed');

  const body = `<section class="card">
      <div class="card-head"><h2>${e(ctx.t('admin.reportsList'))}</h2></div>
      ${
        reports.length
          ? `<div class="report-list">
              ${reports
                .map(
                  (r) => `<div class="report-item">
                    <div class="report-head">
                      <span class="badge ${r.status === 'pending' ? 'badge-warn' : 'badge-ok'}">${e(statusLabel(r.status))}</span>
                      <strong>${e(r.reason)}</strong>
                      <span class="muted">· ${e(r.target_type)} #${r.target_id}</span>
                      <span class="report-time">${e(formatDateTime(r.created_at, ctx.locale))}</span>
                    </div>
                    ${r.detail ? `<p class="report-detail">${e(r.detail)}</p>` : ''}
                    <div class="report-meta">
                      <span>${e(ctx.t('admin.reporter'))}: <a href="/u/${e(r.reporter_username)}">${e(r.reporter_name)}</a></span>
                      ${r.topic_id ? `<a href="/t/${r.topic_id}" target="_blank">${e(r.topic_title || '#')} ${icon('share', 12)}</a>` : ''}
                    </div>
                    ${
                      r.status === 'pending'
                        ? `<div class="report-actions">
                            <form method="post" action="/admin/reports/${r.id}">
                              ${csrfField(ctx)}<input type="hidden" name="status" value="resolved" />
                              <button class="btn btn-outline btn-xs" type="submit">${e(ctx.t('admin.resolve'))}</button>
                            </form>
                            <form method="post" action="/admin/reports/${r.id}">
                              ${csrfField(ctx)}<input type="hidden" name="status" value="dismissed" />
                              <button class="btn btn-ghost btn-xs" type="submit">${e(ctx.t('admin.dismiss'))}</button>
                            </form>
                          </div>`
                        : ''
                    }
                  </div>`,
                )
                .join('')}
            </div>`
          : emptyState(ctx.t('admin.noReports'), ctx.t('notif.emptyDesc'))
      }
    </section>`;
  return shell(ctx, 'reports', ctx.t('admin.reports'), body);
}

export function adminSettings(ctx: Ctx, settings: Record<string, string>): string {
  const body = `<form class="card form-card" method="post" action="/admin/settings">
      ${csrfField(ctx)}
      <h2>${e(ctx.t('admin.siteSettings'))}</h2>
      <div class="field">
        <label class="label" for="site_name">${e(ctx.t('admin.siteName'))}</label>
        <input class="input" id="site_name" name="site_name" value="${e(settings.site_name || ctx.siteName)}" maxlength="40" />
      </div>
      <div class="field">
        <label class="label" for="announcement">${e(ctx.t('admin.announcement'))}</label>
        <textarea class="textarea" id="announcement" name="announcement" rows="3" maxlength="300">${e(
          settings.announcement || '',
        )}</textarea>
        <span class="hint">${e(ctx.t('admin.announcementHint'))}</span>
      </div>
      <label class="checkbox"><input type="checkbox" name="allow_registration" value="1" ${
        settings.allow_registration !== 'false' ? 'checked' : ''
      } /><span>${e(ctx.t('admin.allowRegistration'))}</span></label>
      <div class="form-actions"><button class="btn btn-primary" type="submit">${e(ctx.t('admin.saveSettings'))}</button></div>
    </form>
    <section class="card form-card">
      <h2>${e(ctx.t('auth.linkTitle'))}</h2>
      <p class="muted">${e(ctx.t('footer.powered'))}</p>
      <div class="account-list">
        <div class="account-row"><span class="oauth-mark" style="--c:#24292f">D1</span><div class="account-info"><strong>Cloudflare D1</strong><span>SQLite · edge</span></div></div>
        <div class="account-row"><span class="oauth-mark" style="--c:#f38020">CF</span><div class="account-info"><strong>Cloudflare Workers</strong><span>V8 isolate</span></div></div>
      </div>
    </section>`;
  return shell(ctx, 'settings', ctx.t('admin.siteSettings'), body);
}

/* ------------------------------------------------------------------ 审计日志 */

const AUDIT_ACTION_KEYS: Record<string, string> = {
  'user.role': 'audit.user.role',
  'user.ban': 'audit.user.ban',
  'user.unban': 'audit.user.unban',
  'user.mute': 'audit.user.mute',
  'user.mute.1h': 'audit.user.muteTime',
  'user.mute.24h': 'audit.user.muteTime',
  'user.mute.7d': 'audit.user.muteTime',
  'user.mute.30d': 'audit.user.muteTime',
  'user.unmute': 'audit.user.unmute',
  'topic.pin': 'audit.topic.pin',
  'topic.unpin': 'audit.topic.unpin',
  'topic.lock': 'audit.topic.lock',
  'topic.unlock': 'audit.topic.unlock',
  'topic.feature': 'audit.topic.feature',
  'topic.delete': 'audit.topic.delete',
  'topic.restore': 'audit.topic.restore',
  'post.delete': 'audit.post.delete',
  'category.create': 'audit.category.create',
  'category.update': 'audit.category.update',
  'category.delete': 'audit.category.delete',
  'report.resolved': 'audit.report.resolved',
  'report.dismissed': 'audit.report.dismissed',
};

export function adminAudit(ctx: Ctx, logs: any[]): string {
  const rows = logs
    .map((a) => {
      const key = AUDIT_ACTION_KEYS[a.action] || 'audit.unknown';
      const detail = a.action.startsWith('user.mute.')
        ? ctx.t('audit.muteDetail', { duration: a.action.split('.')[2] || '' })
        : a.action === 'user.role'
          ? ctx.t('audit.roleDetail', { role: a.detail })
          : a.detail;
      const targetLink =
        a.target_type === 'topic' && a.target_id
          ? `<a href="/t/${e(a.target_id)}">#${e(a.target_id)}</a>`
          : a.target_type === 'user' && a.target_id
            ? `<code class="muted">${e(String(a.target_id).slice(0, 8))}…</code>`
            : a.target_id
              ? `<code class="muted">${e(a.target_id)}</code>`
              : '';
      return `<tr>
        <td>
          <div class="table-user">
            ${avatar({ name: a.actor_name || '?', username: a.actor_username || '', url: a.actor_avatar, size: 26 })}
            <span>${a.actor_username ? `<a href="/u/${e(a.actor_username)}">${e(a.actor_name || a.actor_username)}</a>` : `<span class="muted">${e(a.actor_name || '?')}</span>`}</span>
          </div>
        </td>
        <td><span class="badge">${e(ctx.t(key))}</span></td>
        <td>${targetLink}</td>
        <td class="muted">${e(detail)}</td>
        <td class="num muted">${e(formatDateTime(a.created_at, ctx.locale))}</td>
      </tr>`;
    })
    .join('');

  const body = `<section class="card">
      <div class="card-head"><h2>${e(ctx.t('audit.title'))}</h2><span class="muted">${e(ctx.t('audit.desc'))}</span></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>${e(ctx.t('audit.actor'))}</th><th>${e(ctx.t('audit.action'))}</th>
            <th>${e(ctx.t('audit.target'))}</th><th>${e(ctx.t('audit.detail'))}</th><th>${e(ctx.t('admin.date'))}</th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="5" class="empty-cell">${e(ctx.t('state.empty'))}</td></tr>`}</tbody>
        </table>
      </div>
    </section>`;

  return shell(ctx, 'audit', ctx.t('audit.title'), body);
}
