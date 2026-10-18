import type { Ctx, TopicRow } from '../types';
import { categoryName, formatRelative } from '../lib/i18n';
import { escapeHtml as e, hueOf } from '../lib/utils';

export const ICONS: Record<string, string> = {
  home: '<path d="M3 10.7 12 3l9 7.7"/><path d="M5.5 9.5V21h13V9.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 7.5-2.5 7.5h17S18 15 18 8.5"/><path d="M13.8 20a2 2 0 0 1-3.6 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.6-6.5 8-6.5s8 2.3 8 6.5"/>',
  users: '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20c0-3.6 3-5.6 6.5-5.6s6.5 2 6.5 5.6"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6"/><path d="M17.5 14.6c2.4.4 4 2.2 4 5.4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m14 6-6 6 6 6"/>',
  chevronRight: '<path d="m10 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
  reply: '<path d="M9 17.5 3.5 12 9 6.5"/><path d="M3.5 12h9.2a7.3 7.3 0 0 1 7.3 7.3v1.2"/>',
  heart: '<path d="M12 20.2s-7.6-4.6-7.6-10A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.6 3c0 5.4-7.6 10-7.6 10Z"/>',
  bookmark: '<path d="M6.5 3.5h11v17l-5.5-3.7-5.5 3.7v-17Z"/>',
  share: '<circle cx="18" cy="5.5" r="2.8"/><circle cx="6" cy="12" r="2.8"/><circle cx="18" cy="18.5" r="2.8"/><path d="m8.5 10.7 7-3.6M8.5 13.3l7 3.6"/>',
  pin: '<path d="M12 16.5V21"/><path d="M8.5 3.5h7l-1 8.5 3.5 2.5H6l3.5-2.5-1-8.5Z"/>',
  lock: '<rect x="4.5" y="10" width="15" height="10.5" rx="2.4"/><path d="M8 10V7.2a4 4 0 0 1 8 0V10"/>',
  unlock: '<rect x="4.5" y="10" width="15" height="10.5" rx="2.4"/><path d="M8 10V7.2a4 4 0 0 1 7.6-1.7"/>',
  trash: '<path d="M4 7h16"/><path d="M9.5 7V4.8h5V7"/><path d="M6.5 7 7.6 20h8.8L17.5 7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>',
  logout: '<path d="M9.5 21H5.5A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3h4"/><path d="m16 16.5 4.5-4.5L16 7.5"/><path d="M20.5 12H9"/>',
  eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.6"/>',
  message: '<path d="M20.5 11.5a8 8 0 0 1-8 8H6l-3.5 2.5v-10a8 8 0 0 1 8-8h2a8 8 0 0 1 8 7.5Z"/>',
  sparkles: '<path d="m12 3 1.9 4.9L19 9.8l-5.1 1.9L12 16.6l-1.9-4.9L5 9.8l5.1-1.9L12 3Z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
  monitor: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8 20.5h8M12 16.5v4"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5s1.2-6.2 3.6-8.5Z"/>',
  code: '<path d="m9 8-4.5 4L9 16"/><path d="m15 8 4.5 4L15 16"/>',
  link: '<path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7L11.5 6.3"/><path d="M14 10.5a4 4 0 0 0-5.7 0L5.5 13.3a4 4 0 1 0 5.7 5.7l1.3-1.3"/>',
  check: '<path d="m5 13 4.5 4.5L19 7"/>',
  alert: '<path d="M12 4 2.5 20.5h19L12 4Z"/><path d="M12 10v4.5M12 17.6v.1"/>',
  shield: '<path d="M12 3 4.5 6v6c0 5 3.2 8 7.5 9.5 4.3-1.5 7.5-4.5 7.5-9.5V6L12 3Z"/>',
  megaphone: '<path d="M4 10v4l12 5V5L4 10Z"/><path d="M16 8.5a4 4 0 0 1 0 7"/><path d="M7 14v5a1.8 1.8 0 0 0 3.6 0v-3.4"/>',
  chat: '<path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16H9l-4.5 3.5v-13Z"/>',
  lifebuoy: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.4"/><path d="m6 6 3.5 3.5M18 18l-3.5-3.5M18 6l-3.5 3.5M6 18l3.5-3.5"/>',
  box: '<path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16V8Z"/><path d="m3.5 8 8.5 4.5L20.5 8M12 12.5v8"/>',
  coffee: '<path d="M4 8h13v6.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"/><path d="M17 9.5h1.8a2.7 2.7 0 0 1 0 5.4H17"/><path d="M4 21h13"/>',
  fire: '<path d="M12 21c4 0 6.5-2.6 6.5-6.2 0-4.3-3.3-6.2-4.2-10.3-2 1.2-3 3-3 4.8-1.2-.5-2-1.5-2.3-2.8C7 8 5.5 10.7 5.5 14.5 5.5 18.3 8 21 12 21Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  tag: '<path d="m4 11 7-7 9 1 1 9-7 7-10-10Z"/><circle cx="15.5" cy="8.5" r="1.2"/>',
  edit: '<path d="M4 20h4l11-11a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="m4.5 17 5-4.5 4 3.5 3-2.5 3.5 3"/>',
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7V5Z"/><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7v-7Z"/>',
  listIcon: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  quote: '<path d="M9 7H5.5A1.5 1.5 0 0 0 4 8.5V12h4.5V7Z"/><path d="M20 7h-3.5A1.5 1.5 0 0 0 15 8.5V12h4.5V7Z"/><path d="M4 12v5h4.5M15 12v5h4.5"/>',
  moonSmall: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
};

export function icon(name: string, size = 18, cls = ''): string {
  const paths = ICONS[name] || ICONS.chat;
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export function avatar(opts: {
  name: string;
  username?: string;
  url?: string | null;
  size?: number;
  className?: string;
}): string {
  const size = opts.size ?? 36;
  const name = opts.name || opts.username || '?';
  const cls = `avatar ${opts.className || ''}`.trim();
  const url = opts.url && /^(https?:\/\/|\/)/i.test(opts.url) ? opts.url : null;
  if (url) {
    return `<img class="${cls}" src="${e(url)}" alt="${e(name)}" width="${size}" height="${size}" loading="lazy" decoding="async" />`;
  }
  const hue = hueOf(opts.username || name);
  const letter = e(Array.from(name.trim())[0] || '?').toUpperCase();
  return `<span class="${cls} avatar-letter" style="--h:${hue};width:${size}px;height:${size}px;font-size:${Math.round(
    size * 0.42,
  )}px" aria-hidden="true">${letter}</span>`;
}

export function roleBadge(ctx: Ctx, role: string | null | undefined): string {
  if (role === 'admin') return `<span class="badge badge-admin">${icon('shield', 11)}${ctx.t('role.admin')}</span>`;
  if (role === 'moderator') return `<span class="badge badge-mod">${ctx.t('role.moderator')}</span>`;
  return '';
}

export function catChip(ctx: Ctx, topic: Pick<TopicRow, 'category_slug' | 'category_name' | 'category_name_en' | 'category_color'>): string {
  const color = topic.category_color || '#6366f1';
  const name = categoryName({ name: topic.category_name, name_en: topic.category_name_en }, ctx.locale);
  return `<a class="cat-chip" href="/c/${e(topic.category_slug)}" style="--c:${e(color)}">
    <span class="dot"></span>${e(name)}</a>`;
}

export function tagList(tags: string | null | undefined, limit = 3): string {
  if (!tags) return '';
  return tags
    .split(',')
    .filter(Boolean)
    .slice(0, limit)
    .map((tag) => `<span class="tag">#${e(tag.trim())}</span>`)
    .join('');
}

export function csrfField(ctx: Ctx): string {
  return `<input type="hidden" name="_csrf" value="${e(ctx.csrf)}" />`;
}

function pageHref(pathname: string, query: URLSearchParams, page: number): string {
  const q = new URLSearchParams(query);
  if (page <= 1) q.delete('page');
  else q.set('page', String(page));
  const qs = q.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function pagination(_ctx: Ctx, page: number, totalPages: number, pathname: string, query: URLSearchParams): string {
  if (totalPages <= 1) return '';
  const pages: (number | '…')[] = [];
  const push = (n: number | '…') => pages.push(n);
  push(1);
  for (let p = page - 1; p <= page + 1; p++) {
    if (p > 1 && p < totalPages) push(p);
  }
  if (totalPages > 1) push(totalPages);
  const compact: (number | '…')[] = [];
  for (const p of pages) {
    if (typeof p === 'number' && compact.includes(p)) continue;
    const last = compact[compact.length - 1];
    if (typeof p === 'number' && typeof last === 'number' && p - last > 1) compact.push('…');
    compact.push(p);
  }

  return `<nav class="pagination" aria-label="Pagination">
    ${page > 1 ? `<a class="page-btn" href="${pageHref(pathname, query, page - 1)}" rel="prev">${icon('chevronLeft', 16)}</a>` : ''}
    ${compact
      .map((p) =>
        p === '…'
          ? `<span class="page-gap">…</span>`
          : `<a class="page-btn ${p === page ? 'is-active' : ''}" href="${pageHref(pathname, query, p)}">${p}</a>`,
      )
      .join('')}
    ${page < totalPages ? `<a class="page-btn" href="${pageHref(pathname, query, page + 1)}" rel="next">${icon('chevronRight', 16)}</a>` : ''}
  </nav>`;
}

/** 转义后按关键词高亮（大小写不敏感） */
function highlightText(text: string, terms: string[]): string {
  let html = e(text);
  for (const term of terms) {
    const trimmed = term.trim();
    if (!trimmed) continue;
    const safe = e(trimmed).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      html = html.replace(new RegExp(safe, 'gi'), (match) => `<mark>${match}</mark>`);
    } catch {
      // 关键词含特殊字符时跳过
    }
  }
  return html;
}

export function topicRow(ctx: Ctx, topic: TopicRow, opts: { snippet?: string; highlight?: string[] } = {}): string {
  const pinned = topic.is_pinned ? `<span class="pill pill-pin">${icon('pin', 11)}${ctx.t('topic.pinned')}</span>` : '';
  const featured = topic.is_featured ? `<span class="pill pill-feature">${icon('sparkles', 11)}${ctx.t('topic.featured')}</span>` : '';
  const locked = topic.is_locked ? `<span class="pill pill-lock">${icon('lock', 11)}</span>` : '';
  const author = topic.author_name || topic.author_username;
  const activity = formatRelative(topic.last_post_at, ctx.locale, ctx.t);
  const snippet = opts.snippet || topic.search_snippet;
  const terms = (opts.highlight || []).filter(Boolean);
  const title = terms.length ? highlightText(topic.title, terms) : e(topic.title);
  const summary = snippet
    ? `<p class="topic-row-snippet">${snippet}</p>`
    : topic.excerpt
      ? `<p class="topic-row-excerpt">${e(topic.excerpt)}</p>`
      : '';

  return `<article class="topic-row">
    <a class="topic-row-avatar" href="/u/${e(topic.author_username)}" aria-label="${e(author)}">
      ${avatar({ name: author, username: topic.author_username, url: topic.author_avatar, size: 40 })}
    </a>
    <div class="topic-row-main">
      <div class="topic-row-head">
        ${catChip(ctx, topic)}${pinned}${featured}${locked}
      </div>
      <h3 class="topic-row-title"><a href="/t/${topic.id}">${title}</a></h3>
      ${summary}
      <div class="topic-row-meta">
        <span class="meta-author">${e(author)}</span>
        <span class="meta-dot">·</span>
        <span title="${new Date(topic.created_at).toISOString()}">${e(activity)}</span>
        ${tagList(topic.tags)}
      </div>
    </div>
    <div class="topic-row-stats">
      <div class="stat-pair">
        <span class="stat-num">${topic.reply_count}</span>
        <span class="stat-label">${ctx.t('topic.replyShort')}</span>
      </div>
      <div class="stat-pair stat-views">
        <span class="stat-num">${topic.views}</span>
        <span class="stat-label">${ctx.t('topic.viewShort')}</span>
      </div>
    </div>
  </article>`;
}

export function emptyState(title: string, desc?: string, action?: string): string {
  return `<div class="empty-state">
    <div class="empty-icon">${icon('message', 28)}</div>
    <h3>${e(title)}</h3>
    ${desc ? `<p>${e(desc)}</p>` : ''}
    ${action || ''}
  </div>`;
}
