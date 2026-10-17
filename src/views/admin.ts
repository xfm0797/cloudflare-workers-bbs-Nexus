import type { Ctx } from '../types';
import type { Category, User } from '../lib/types';
import { formatDate, formatDateTime } from '../lib/i18n';
import { escapeHtml as e } from '../lib/utils';
import { avatar, csrfField, emptyState, icon, pagination, roleBadge } from './ui';
import { layout } from './layout';

function adminNav(ctx: Ctx, active: string): string {
  const items = [
    { key: 'overview', label: ctx.t('admin.dashboard'), href: '/admin', icon: 'home' },
    { key: 'users', label: ctx.t('admin.users'), href: '/admin/users', icon: 'users' },
    { key: 'categories', label: ctx.t('admin.categories'), href: '/admin/categories', icon: 'listIcon' },
    { key: 'reports', label: ctx.t('admin.reports'), href: '/admin/reports', icon: 'alert' },
    { key: 'settings', label: ctx.t('admin.siteSettings'), href: '/admin/settings', icon: 'settings' },
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
            : `<span class="badge badge-ok">${e(ctx.t('misc.online').replace(ctx.t('misc.online'), 'OK'))}</span>`
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
