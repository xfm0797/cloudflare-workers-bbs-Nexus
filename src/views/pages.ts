import type { Ctx, PostRow, TopicRow } from '../types';
import type { Category, Topic, User } from '../lib/types';
import { categoryDesc, categoryName, formatDate, formatDateTime, formatRelative, siteTagline } from '../lib/i18n';
import { escapeHtml as e } from '../lib/utils';
import { avatar, catChip, csrfField, emptyState, icon, pagination, roleBadge, topicRow } from './ui';
import { layout } from './layout';
import { enabledProviders } from '../lib/oauth';
import { imgbedEnabled } from '../lib/imgbed';
import { mailConfigured } from '../lib/mail';
import { verificationRequired } from '../lib/emailverify';

/* ------------------------------------------------------------------ 首页 */

export function homePage(
  ctx: Ctx,
  data: {
    categories: Category[];
    topics: TopicRow[];
    total: number;
    page: number;
    totalPages: number;
    sort: string;
    stats: { users: number; topics: number; posts: number; online: number };
    announcement?: string;
    sidebar: string;
  },
): string {
  const tabs = [
    { key: 'latest', label: ctx.t('home.latest'), href: '/' },
    { key: 'hot', label: ctx.t('home.hot'), href: '/?sort=hot' },
    { key: 'unanswered', label: ctx.t('home.unanswered'), href: '/?sort=unanswered' },
  ];

  const list = data.topics.length
    ? data.topics.map((t) => topicRow(ctx, t)).join('')
    : emptyState(
        ctx.t('home.noTopics'),
        ctx.t('home.noTopicsDesc'),
        ctx.user
          ? `<a class="btn btn-primary" href="/new">${icon('plus', 16)}${ctx.t('home.startTopic')}</a>`
          : `<a class="btn btn-primary" href="/register">${ctx.t('home.heroCta2')}</a>`,
      );

  const body = `
  ${
    data.announcement
      ? `<div class="announcement">${icon('megaphone', 16)}<div><strong>${e(ctx.t('home.announcement'))}</strong><span>${e(
          data.announcement,
        )}</span></div></div>`
      : ''
  }
  <section class="hero">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="hero-content">
      <span class="hero-eyebrow"><span class="live-dot"></span>${data.stats.online} ${e(ctx.t('home.stats.online'))} · ${data.stats.topics} ${e(
        ctx.t('home.stats.topics'),
      )}</span>
      <h1>${e(ctx.t('home.welcome', { site: ctx.siteName }))}</h1>
      <p>${e(siteTagline(ctx, 'home.joinDesc'))}</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="/new">${icon('plus', 16)}${e(ctx.t('home.newTopic'))}</a>
        <a class="btn btn-outline" href="/categories">${e(ctx.t('home.heroCta'))}${icon('chevronRight', 16)}</a>
      </div>
      <div class="hero-stats">
        <div><strong>${data.stats.topics}</strong><span>${e(ctx.t('home.stats.topics'))}</span></div>
        <div><strong>${data.stats.posts}</strong><span>${e(ctx.t('home.stats.posts'))}</span></div>
        <div><strong>${data.stats.users}</strong><span>${e(ctx.t('home.stats.members'))}</span></div>
        <div><strong>${data.stats.online}</strong><span>${e(ctx.t('home.stats.online'))}</span></div>
      </div>
    </div>
  </section>

  <div class="feed-head">
    <div class="tabs">
      ${tabs
        .map(
          (t) =>
            `<a class="tab ${data.sort === t.key ? 'is-active' : ''}" href="${t.href}">${
              t.key === 'hot' ? icon('fire', 15) : t.key === 'unanswered' ? icon('clock', 15) : icon('clock', 15)
            }${e(t.label)}</a>`,
        )
        .join('')}
    </div>
    <span class="feed-count">${ctx.t('misc.total', { count: data.total })}</span>
  </div>
  <div class="topic-list">${list}</div>
  ${pagination(ctx, data.page, data.totalPages, '/', new URLSearchParams(data.sort !== 'latest' ? { sort: data.sort } : {}))}`;

  return layout(ctx, { body, sidebar: data.sidebar, title: undefined, active: data.sort === 'hot' ? 'hot' : 'home' });
}

/* ------------------------------------------------------------------ 板块页 */

export async function categoriesPage(ctx: Ctx, categories: Category[]): Promise<string> {
  const cards = categories
    .map(
      (c) => `<a class="category-card" href="/c/${e(c.slug)}" style="--c:${e(c.color || '#6366f1')}">
        <div class="category-icon">${icon(c.icon || 'chat', 22)}</div>
        <div class="category-body">
          <h3>${e(categoryName(c, ctx.locale))}</h3>
          <p>${e(categoryDesc(c, ctx.locale))}</p>
          <span class="category-meta">${c.topic_count} ${e(ctx.t('home.stats.topics'))} · ${c.post_count} ${e(
            ctx.t('home.stats.posts'),
          )}</span>
        </div>
        ${icon('chevronRight', 18, 'category-arrow')}
      </a>`,
    )
    .join('');

  const body = `<div class="page-head">
      <h1>${e(ctx.t('nav.categories'))}</h1>
      <p>${e(ctx.t('home.subtitle'))}</p>
    </div>
    <div class="category-grid">${cards}</div>`;

  return layout(ctx, { body, title: ctx.t('nav.categories'), active: 'categories' });
}

export function categoryPage(
  ctx: Ctx,
  data: {
    category: Category;
    topics: TopicRow[];
    page: number;
    totalPages: number;
    sort: string;
    sidebar: string;
  },
): string {
  const c = data.category;
  const list = data.topics.length
    ? data.topics.map((t) => topicRow(ctx, t)).join('')
    : emptyState(ctx.t('home.noTopics'), ctx.t('home.noTopicsDesc'), `<a class="btn btn-primary" href="/new?category=${e(c.slug)}">${icon('plus', 16)}${e(ctx.t('home.newTopic'))}</a>`);

  const body = `<div class="category-hero" style="--c:${e(c.color || '#6366f1')}">
      <div class="category-hero-icon">${icon(c.icon || 'chat', 26)}</div>
      <div>
        <h1>${e(categoryName(c, ctx.locale))}</h1>
        <p>${e(categoryDesc(c, ctx.locale))}</p>
      </div>
      <div class="category-hero-stats">
        <div><strong>${c.topic_count}</strong><span>${e(ctx.t('home.stats.topics'))}</span></div>
        <div><strong>${c.post_count}</strong><span>${e(ctx.t('home.stats.posts'))}</span></div>
      </div>
    </div>
    <div class="feed-head">
      <div class="tabs">
        <a class="tab ${data.sort === 'latest' ? 'is-active' : ''}" href="/c/${e(c.slug)}">${icon('clock', 15)}${e(ctx.t('home.latest'))}</a>
        <a class="tab ${data.sort === 'hot' ? 'is-active' : ''}" href="/c/${e(c.slug)}?sort=hot">${icon('fire', 15)}${e(ctx.t('home.hot'))}</a>
      </div>
      <a class="btn btn-primary btn-sm" href="/new?category=${e(c.slug)}">${icon('plus', 14)}${e(ctx.t('home.newTopic'))}</a>
    </div>
    <div class="topic-list">${list}</div>
    ${pagination(ctx, data.page, data.totalPages, `/c/${c.slug}`, new URLSearchParams(data.sort !== 'latest' ? { sort: data.sort } : {}))}`;

  return layout(ctx, {
    body,
    title: categoryName(c, ctx.locale),
    description: categoryDesc(c, ctx.locale),
    sidebar: data.sidebar,
  });
}

/* ------------------------------------------------------------------ 主题详情 */

export function topicPage(
  ctx: Ctx,
  data: {
    topic: TopicRow;
    posts: PostRow[];
    page: number;
    totalPages: number;
    bookmarked: boolean;
    canModerate: boolean;
    sort: 'asc' | 'desc';
    sidebar: string;
  },
): string {
  const { topic, posts, canModerate } = data;
  const totalPosts = topic.reply_count + 1;
  const query = new URLSearchParams(data.sort === 'desc' ? { sort: 'desc' } : {});

  const head = `<nav class="breadcrumb">
      <a href="/">${e(ctx.t('nav.home'))}</a>${icon('chevronRight', 12)}
      <a href="/c/${e(topic.category_slug)}">${e(categoryName({ name: topic.category_name, name_en: topic.category_name_en }, ctx.locale))}</a>
    </nav>
    <header class="topic-head">
      <div class="topic-chips">
        ${catChip(ctx, topic)}
        ${topic.is_pinned ? `<span class="pill pill-pin">${icon('pin', 11)}${e(ctx.t('topic.pinned'))}</span>` : ''}
        ${topic.is_featured ? `<span class="pill pill-feature">${icon('sparkles', 11)}${e(ctx.t('topic.featured'))}</span>` : ''}
        ${topic.is_locked ? `<span class="pill pill-lock">${icon('lock', 11)}${e(ctx.t('topic.locked'))}</span>` : ''}
      </div>
      <h1>${e(topic.title)}</h1>
      <div class="topic-head-meta">
        ${avatar({ name: topic.author_name, username: topic.author_username, url: topic.author_avatar, size: 24 })}
        <a href="/u/${e(topic.author_username)}">${e(topic.author_name)}</a>
        <span class="meta-dot">·</span>
        <span>${e(formatRelative(topic.created_at, ctx.locale, ctx.t))}</span>
        <span class="meta-dot">·</span>
        <span>${icon('eye', 14)}${topic.views}</span>
        <span class="meta-dot">·</span>
        <span>${icon('message', 14)}${totalPosts}</span>
        ${
          ctx.user
            ? `<form class="bookmark-form ${data.bookmarked ? 'is-active' : ''}" method="post" action="/api/bookmark" data-bookmark="${topic.id}">
                ${csrfField(ctx)}
                <input type="hidden" name="id" value="${topic.id}" />
                <button class="btn btn-ghost btn-xs bookmark-btn" type="submit">
                  ${icon('bookmark', 14)}<span class="bookmark-label" data-on="${e(ctx.t('topic.bookmarked'))}" data-off="${e(
                    ctx.t('topic.bookmark'),
                  )}">${e(data.bookmarked ? ctx.t('topic.bookmarked') : ctx.t('topic.bookmark'))}</span>
                </button>
              </form>
              <a class="btn btn-primary btn-xs topic-reply-btn" href="#replyForm">${icon('reply', 14)}${e(ctx.t('topic.reply'))}</a>`
            : ''
        }
        ${canModerate ? moderateMenu(ctx, topic) : ''}
      </div>
    </header>`;

  const postList = posts.map((p, idx) => postCard(ctx, p, topic, idx === 0 ? 1 : p.position, canModerate)).join('');

  const composer = topic.is_locked
    ? `<div class="reply-locked">${icon('lock', 18)}<span>${e(ctx.t('topic.lockedDesc'))}</span></div>`
    : ctx.user
      ? `<form class="reply-form card" method="post" action="/t/${topic.id}/reply" id="replyForm">
          ${csrfField(ctx)}
          <input type="hidden" name="reply_to" id="replyToInput" value="" />
          <div class="composer-head">
            ${avatar({ name: ctx.user.display_name, username: ctx.user.username, url: ctx.user.avatar_url, size: 32 })}
            <span>${e(ctx.t('topic.reply'))}</span>
            <span class="composer-hint">${icon('code', 13)}${e(ctx.t('compose.markdownTip'))}</span>
            ${
              imgbedEnabled(ctx.env)
                ? `<button type="button" class="tool-btn composer-head-tool" data-image-upload title="${e(
                    ctx.t('compose.image'),
                  )}" aria-label="${e(ctx.t('compose.image'))}">${icon('image', 15)}</button>`
                : ''
            }
          </div>
          <div class="composer-quote" id="quoteBar" hidden>
            <span id="quoteText"></span>
            <button type="button" class="icon-btn icon-btn-sm" data-quote-clear>${icon('close', 14)}</button>
          </div>
          <textarea class="textarea" name="content" id="replyContent" rows="5" placeholder="${e(
            ctx.t('topic.replyPlaceholder'),
          )}" required minlength="2" maxlength="20000"></textarea>
          <div class="composer-foot">
            <span class="char-count" data-counter-for="replyContent">0 / 20000</span>
            <button class="btn btn-primary" type="submit">${icon('reply', 16)}${e(ctx.t('topic.postReply'))}</button>
          </div>
        </form>`
      : `<div class="reply-cta card">
          <div>${icon('message', 20)}<span>${e(ctx.t('topic.loginToReply'))}</span></div>
          <div class="reply-cta-actions">
            <a class="btn btn-outline btn-sm" href="/login?next=/t/${topic.id}">${e(ctx.t('nav.login'))}</a>
            <a class="btn btn-primary btn-sm" href="/register?next=/t/${topic.id}">${e(ctx.t('nav.register'))}</a>
          </div>
        </div>`;

  const body = `${head}
    <div class="post-list">${postList}</div>
    ${data.totalPages > 1 ? `<div class="topic-pager">${pagination(ctx, data.page, data.totalPages, `/t/${topic.id}`, query)}</div>` : ''}
    <div class="topic-tail">
      <div class="sort-switch">
        <a class="${data.sort === 'asc' ? 'is-active' : ''}" href="/t/${topic.id}">${e(ctx.t('topic.sortOld'))}</a>
        <a class="${data.sort === 'desc' ? 'is-active' : ''}" href="/t/${topic.id}?sort=desc">${e(ctx.t('topic.sortNew'))}</a>
      </div>
      ${composer}
    </div>`;

  return layout(ctx, {
    body,
    title: topic.title,
    description: topic.excerpt || undefined,
    sidebar: data.sidebar,
    noindex: topic.is_deleted === 1,
  });
}

function moderateMenu(ctx: Ctx, topic: TopicRow): string {
  const action = (name: string, label: string, iconName: string, danger = false) =>
    `<form method="post" action="/moderate/topic/${topic.id}">
      ${csrfField(ctx)}
      <input type="hidden" name="action" value="${name}" />
      <button class="dropdown-item ${danger ? 'is-danger' : ''}" type="submit">${icon(iconName, 15)}${e(label)}</button>
    </form>`;

  return `<details class="dropdown moderate-menu">
      <summary class="btn btn-ghost btn-xs">${icon('settings', 14)}${e(ctx.t('admin.actions'))}</summary>
      <div class="dropdown-panel">
        ${topic.is_pinned ? action('unpin', ctx.t('topic.unpin'), 'pin') : action('pin', ctx.t('topic.pin'), 'pin')}
        ${topic.is_locked ? action('unlock', ctx.t('topic.unlock'), 'unlock') : action('lock', ctx.t('topic.lock'), 'lock')}
        ${action('feature', ctx.t('topic.featured'), 'sparkles')}
        <div class="dropdown-sep"></div>
        ${action('delete', ctx.t('topic.delete'), 'trash', true)}
      </div>
    </details>`;
}

export function postCard(ctx: Ctx, post: PostRow, topic: TopicRow, floor: number, canModerate: boolean): string {
  const isOp = floor === 1;
  const author = post.author_name || post.author_username;
  const likeForm = `<form class="like-form ${post.liked ? 'is-liked' : ''}" method="post" action="/api/like" data-like="post" data-id="${post.id}">
      ${csrfField(ctx)}
      <input type="hidden" name="type" value="post" />
      <input type="hidden" name="id" value="${post.id}" />
      <button class="btn-like" type="submit" ${ctx.user ? '' : 'disabled title="' + e(ctx.t('topic.loginToReply')) + '"'}>
        ${icon('heart', 16)}<span class="like-count">${post.like_count}</span>
      </button>
    </form>`;

  return `<article class="post-card ${isOp ? 'is-op' : ''}" id="p${post.id}">
    <aside class="post-author">
      <a href="/u/${e(post.author_username)}">
        ${avatar({ name: author, username: post.author_username, url: post.author_avatar, size: 44 })}
      </a>
      <a class="post-author-name" href="/u/${e(post.author_username)}">${e(author)}</a>
      ${roleBadge(ctx, post.author_role)}
      <span class="post-author-meta">${e(ctx.t('topic.authorPosts', { count: post.author_post_count }))}</span>
    </aside>
    <div class="post-main">
      <div class="post-top">
        <span class="floor">${isOp ? `<span class="op-badge">${e(ctx.t('topic.originalPost'))}</span>` : `#${floor}`}</span>
        <span class="post-time" title="${e(formatDateTime(post.created_at, ctx.locale))}">${e(
          formatRelative(post.created_at, ctx.locale, ctx.t),
        )}</span>
        ${post.edited_at ? `<span class="post-edited">· ${e(ctx.t('topic.edited'))}</span>` : ''}
        ${post.reply_to_username ? `<span class="post-replyto">${icon('reply', 12)}${e(ctx.t('topic.replyTo'))} @${e(post.reply_to_username)}</span>` : ''}
        <a class="post-anchor" href="/t/${topic.id}#p${post.id}" aria-label="permalink">#${post.id}</a>
      </div>
      <div class="md">${post.content_html}</div>
      <div class="post-actions">
        ${likeForm}
        ${
          ctx.user
            ? `<button class="btn-text" type="button" data-quote-post="${post.id}" data-quote-user="${e(post.author_username)}">${icon(
                'reply',
                15,
              )}${e(ctx.t('topic.reply'))}</button>`
            : ''
        }
        <button class="btn-text" type="button" data-share="${e(ctx.url.origin)}/t/${topic.id}#p${post.id}">${icon('share', 15)}${e(
          ctx.t('action.share'),
        )}</button>
        ${
          ctx.user && ctx.user.id !== post.author_id
            ? `<details class="report-menu">
                <summary class="btn-text">${icon('alert', 15)}${e(ctx.t('topic.report'))}</summary>
                <form class="report-pop" method="post" action="/api/report">
                  ${csrfField(ctx)}
                  <input type="hidden" name="target_type" value="post" />
                  <input type="hidden" name="target_id" value="${post.id}" />
                  <input type="hidden" name="back" value="/t/${topic.id}" />
                  <strong>${e(ctx.t('report.title'))}</strong>
                  <label class="radio"><input type="radio" name="reason" value="spam" checked /><span>${e(ctx.t('report.reason.spam'))}</span></label>
                  <label class="radio"><input type="radio" name="reason" value="abuse" /><span>${e(ctx.t('report.reason.abuse'))}</span></label>
                  <label class="radio"><input type="radio" name="reason" value="illegal" /><span>${e(ctx.t('report.reason.illegal'))}</span></label>
                  <label class="radio"><input type="radio" name="reason" value="other" /><span>${e(ctx.t('report.reason.other'))}</span></label>
                  <input class="input input-sm" name="detail" maxlength="300" placeholder="${e(ctx.t('report.detail'))}" />
                  <button class="btn btn-primary btn-xs" type="submit">${e(ctx.t('report.submit'))}</button>
                </form>
              </details>`
            : ''
        }
        ${
          canModerate
            ? `<form method="post" action="/moderate/post/${post.id}" data-confirm="${e(ctx.t('admin.confirmDelete'))}">
                ${csrfField(ctx)}<input type="hidden" name="action" value="delete" />
                <button class="btn-text is-danger" type="submit">${icon('trash', 15)}${e(ctx.t('topic.deletePost'))}</button>
              </form>`
            : ''
        }
      </div>
    </div>
  </article>`;
}

/* ------------------------------------------------------------------ 发布 */

export function composePage(ctx: Ctx, categories: Category[], presetCategory?: string): string {
  const options = categories
    .map(
      (c) =>
        `<option value="${c.id}" ${presetCategory === c.slug ? 'selected' : ''}>${e(categoryName(c, ctx.locale))}${
          c.admin_only && ctx.user?.role !== 'admin' ? ' (read only)' : ''
        }</option>`,
    )
    .join('');

  const body = `<div class="compose-wrap">
    <div class="compose-head">
      <h1>${e(ctx.t('compose.title'))}</h1>
      <p>${e(ctx.t('compose.subtitle'))}</p>
    </div>
    <form class="compose-form card" method="post" action="/new" id="composeForm">
      ${csrfField(ctx)}
      <div class="field">
        <label class="label" for="title">${e(ctx.t('compose.titleLabel'))}</label>
        <input class="input" id="title" name="title" type="text" required minlength="4" maxlength="120" placeholder="${e(
          ctx.t('compose.titlePlaceholder'),
        )}" autofocus />
      </div>
      <div class="field">
        <label class="label" for="category">${e(ctx.t('compose.category'))}</label>
        <select class="select" id="category" name="category_id" required>${options}</select>
      </div>
      <div class="field">
        <div class="label-row">
          <label class="label" for="content">${e(ctx.t('compose.contentLabel'))}</label>
          <div class="composer-tools">
            ${
              imgbedEnabled(ctx.env)
                ? `<button type="button" class="tool-btn" data-image-upload title="${e(ctx.t('compose.image'))}" aria-label="${e(
                    ctx.t('compose.image'),
                  )}">${icon('image', 15)}</button>`
                : ''
            }
            <button type="button" class="tool-btn" data-markdown="bold" title="Bold">${icon('bold', 15)}</button>
            <button type="button" class="tool-btn" data-markdown="code" title="Code">${icon('code', 15)}</button>
            <button type="button" class="tool-btn" data-markdown="quote" title="Quote">${icon('quote', 15)}</button>
            <button type="button" class="tool-btn" data-markdown="list" title="List">${icon('listIcon', 15)}</button>
            <button type="button" class="tool-btn" data-preview-toggle title="${e(ctx.t('compose.preview'))}">${icon('eye', 15)}</button>
          </div>
        </div>
        <textarea class="textarea" id="content" name="content" rows="12" required minlength="10" maxlength="20000" placeholder="${e(
          ctx.t('compose.contentPlaceholder'),
        )}"></textarea>
        <div class="md preview-box" id="previewBox" hidden></div>
        <div class="composer-foot">
          <span class="hint">${icon('code', 13)}${e(ctx.t('compose.markdownTip'))}</span>
          <span class="char-count" data-counter-for="content">0 / 20000</span>
        </div>
      </div>
      <div class="field">
        <label class="label" for="tags">${e(ctx.t('compose.tags'))}</label>
        <input class="input" id="tags" name="tags" type="text" maxlength="80" placeholder="discussion, feedback" />
        <span class="hint">${e(ctx.t('compose.tagsHint'))}</span>
      </div>
      <div class="compose-actions">
        <a class="btn btn-ghost" href="/">${e(ctx.t('action.cancel'))}</a>
        <button class="btn btn-primary" type="submit">${icon('plus', 16)}${e(ctx.t('compose.submit'))}</button>
      </div>
    </form>
  </div>`;

  return layout(ctx, { body, title: ctx.t('compose.title'), noindex: true });
}

/* ------------------------------------------------------------------ 认证 */

export function authPage(
  ctx: Ctx,
  opts: {
    mode: 'login' | 'register' | 'setup';
    error?: string;
    next?: string;
    values?: { email?: string; username?: string };
    allowRegistration: boolean;
  },
): string {
  const { mode } = opts;
  const title =
    mode === 'login' ? ctx.t('auth.loginTitle') : mode === 'register' ? ctx.t('auth.registerTitle') : ctx.t('auth.setupTitle');
  const subtitle =
    mode === 'login'
      ? ctx.t('auth.loginSubtitle')
      : mode === 'register'
        ? ctx.t('auth.registerSubtitle')
        : ctx.t('auth.setupSubtitle');

  const providers = mode === 'setup' ? [] : enabledProviders(ctx.env);
  const oauthBlock = providers.length
    ? `<div class="oauth-grid">
        ${providers
          .map(
            (p) => `<a class="oauth-btn" href="/auth/${p.id}?next=${encodeURIComponent(opts.next || '/')}">
              <span class="oauth-mark" style="--c:${e(p.color)}">${e(p.monogram)}</span>
              <span>${e(ctx.t('auth.withProvider', { provider: p.label }))}</span>
            </a>`,
          )
          .join('')}
      </div>
      <div class="divider"><span>${e(ctx.t('auth.or'))}</span></div>`
    : '';

  const nextField = `<input type="hidden" name="next" value="${e(opts.next || '/')}" />`;

  const form =
    mode === 'login'
      ? `<form method="post" action="/login" class="auth-form">
          ${csrfField(ctx)}${nextField}
          <div class="field">
            <label class="label" for="email">${e(ctx.t('auth.email'))}</label>
            <input class="input" id="email" name="email" type="email" autocomplete="username" required value="${e(
              opts.values?.email || '',
            )}" />
          </div>
          <div class="field">
            <label class="label" for="password">${e(ctx.t('auth.password'))}</label>
            <input class="input" id="password" name="password" type="password" autocomplete="current-password" required minlength="8" />
          </div>
          <button class="btn btn-primary btn-block btn-lg" type="submit">${e(ctx.t('auth.submitLogin'))}</button>
        </form>`
      : `<form method="post" action="${mode === 'register' ? '/register' : '/setup'}" class="auth-form">
          ${csrfField(ctx)}${mode === 'register' ? nextField : ''}
          <div class="field">
            <label class="label" for="username">${e(ctx.t('auth.username'))}</label>
            <input class="input" id="username" name="username" type="text" autocomplete="username" required minlength="2" maxlength="20" value="${e(
              opts.values?.username || '',
            )}" />
            <span class="hint">${e(ctx.t('auth.usernameHint'))}</span>
          </div>
          <div class="field">
            <label class="label" for="email">${e(ctx.t('auth.email'))}</label>
            <input class="input" id="email" name="email" type="email" autocomplete="email" required value="${e(
              opts.values?.email || '',
            )}" />
          </div>
          <div class="field">
            <label class="label" for="password">${e(ctx.t('auth.password'))}</label>
            <input class="input" id="password" name="password" type="password" autocomplete="new-password" required minlength="8" />
            <span class="hint">${e(ctx.t('auth.passwordHint'))}</span>
          </div>
          <div class="field">
            <label class="label" for="password2">${e(ctx.t('auth.confirmPassword'))}</label>
            <input class="input" id="password2" name="password2" type="password" autocomplete="new-password" required minlength="8" />
          </div>
          <button class="btn btn-primary btn-block btn-lg" type="submit">${e(
            mode === 'register' ? ctx.t('auth.submitRegister') : ctx.t('auth.setupSubmit'),
          )}</button>
          ${mode === 'register' ? `<p class="auth-terms">${e(ctx.t('auth.terms'))}</p>` : ''}
        </form>`;

  const alt =
    mode === 'login'
      ? `<p class="auth-alt">${e(ctx.t('auth.noAccount'))} <a href="/register?next=${encodeURIComponent(opts.next || '/')}">${e(
          ctx.t('nav.register'),
        )}</a></p>`
      : mode === 'register'
        ? `<p class="auth-alt">${e(ctx.t('auth.hasAccount'))} <a href="/login?next=${encodeURIComponent(opts.next || '/')}">${e(
            ctx.t('nav.login'),
          )}</a></p>`
        : '';

  const body = `<div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo"><span class="brand-mark">${icon('message', 20)}</span></div>
        <h1>${e(title)}</h1>
        <p class="auth-sub">${e(subtitle)}</p>
        ${opts.error ? `<div class="alert alert-error">${icon('alert', 16)}<span>${e(opts.error)}</span></div>` : ''}
        ${oauthBlock}
        ${form}
        ${alt}
      </div>
      <p class="auth-foot">© ${new Date().getFullYear()} ${e(ctx.siteName)} · ${e(ctx.t('footer.powered'))}</p>
    </div>`;

  return layout(ctx, { body, title, noindex: true, bodyClass: 'auth-body' });
}

/* ------------------------------------------------------------------ 个人主页 */

export function profilePage(
  ctx: Ctx,
  data: { profile: User; topics: TopicRow[]; likes: number; tab: string; isSelf: boolean },
): string {
  const p = data.profile;
  const meta: string[] = [`${ctx.t('user.joined', { date: formatDate(p.created_at, ctx.locale) })}`];
  if (p.location) meta.push(p.location);
  if (p.last_seen_at) meta.push(ctx.t('user.lastActive', { time: formatRelative(p.last_seen_at, ctx.locale, ctx.t) }));

  const body = `<section class="profile-card">
      <div class="profile-main">
        ${avatar({ name: p.display_name, username: p.username, url: p.avatar_url, size: 84, className: 'profile-avatar' })}
        <div class="profile-info">
          <h1>${e(p.display_name)} ${roleBadge(ctx, p.role)}</h1>
          <div class="profile-handle">@${e(p.username)}</div>
          <p class="profile-bio">${e(p.bio || ctx.t('user.noBio'))}</p>
          <div class="profile-meta">
            ${meta.map((m) => `<span>${e(m)}</span>`).join('<span class="meta-dot">·</span>')}
            ${p.website ? `<span class="meta-dot">·</span><a href="${e(p.website)}" target="_blank" rel="nofollow noopener">${icon('link', 13)}${e(p.website.replace(/^https?:\/\//, ''))}</a>` : ''}
          </div>
        </div>
      </div>
      <div class="profile-stats">
        <div><strong>${p.topic_count}</strong><span>${e(ctx.t('user.topics'))}</span></div>
        <div><strong>${p.post_count}</strong><span>${e(ctx.t('user.replies'))}</span></div>
        <div><strong>${data.likes}</strong><span>${e(ctx.t('user.likesReceived'))}</span></div>
      </div>
      ${data.isSelf ? `<a class="btn btn-outline btn-sm profile-edit" href="/settings">${icon('edit', 15)}${e(ctx.t('user.editProfile'))}</a>` : ''}
    </section>
    <div class="feed-head">
      <div class="tabs">
        <a class="tab ${data.tab === 'topics' ? 'is-active' : ''}" href="/u/${e(p.username)}">${e(ctx.t('user.topics'))}</a>
        <a class="tab ${data.tab === 'replies' ? 'is-active' : ''}" href="/u/${e(p.username)}?tab=replies">${e(ctx.t('user.replies'))}</a>
      </div>
    </div>
    <div class="topic-list">${
      data.topics.length
        ? data.topics.map((t) => topicRow(ctx, t)).join('')
        : emptyState(data.tab === 'replies' ? ctx.t('user.replies') : ctx.t('user.topics'), ctx.t('state.empty'))
    }</div>`;

  return layout(ctx, { body, title: p.display_name, description: p.bio || undefined });
}

/* ------------------------------------------------------------------ 设置 */

export function settingsPage(
  ctx: Ctx,
  data: { user: User; accounts: { provider: string; username: string | null; created_at: number }[]; error?: string; ok?: string },
): string {
  const u = data.user;
  const providers = enabledProviders(ctx.env);
  const connected = new Map(data.accounts.map((a) => [a.provider, a]));
  const canDisconnect = data.accounts.length > 0 && (u.password_hash || data.accounts.length > 1);
  const emailVerified = u.email_verified === 1;
  const mailReady = mailConfigured(ctx.env);
  const verifyRequired = verificationRequired(ctx.env);

  const body = `<div class="page-head">
      <h1>${e(ctx.t('nav.settings'))}</h1>
    </div>
    ${data.error ? `<div class="alert alert-error">${icon('alert', 16)}<span>${e(data.error)}</span></div>` : ''}
    ${data.ok ? `<div class="alert alert-ok">${icon('check', 16)}<span>${e(data.ok)}</span></div>` : ''}
    <form class="card form-card" method="post" action="/settings/profile">
      ${csrfField(ctx)}
      <h2>${e(ctx.t('user.editProfile'))}</h2>
      <div class="form-grid">
        <div class="field">
          <label class="label">${e(ctx.t('auth.username'))}</label>
          <input class="input" value="${e(u.username)}" disabled />
          <span class="hint">${e(ctx.t('user.usernameReadonly'))}</span>
        </div>
        <div class="field">
          <label class="label" for="display_name">${e(ctx.t('auth.displayName'))}</label>
          <input class="input" id="display_name" name="display_name" value="${e(u.display_name)}" maxlength="40" required />
        </div>
        <div class="field">
          <label class="label" for="email">${e(ctx.t('auth.email'))}</label>
          <input class="input" id="email" name="email" type="email" value="${e(u.email || '')}" maxlength="254" />
        </div>
        <div class="field">
          <label class="label" for="avatar_url">${e(ctx.t('user.avatar'))}</label>
          <input class="input" id="avatar_url" name="avatar_url" type="url" value="${e(u.avatar_url || '')}" placeholder="https://…" />
          <span class="hint">${e(ctx.t('user.avatarHint'))}</span>
        </div>
        <div class="field">
          <label class="label" for="location">${e(ctx.t('user.location'))}</label>
          <input class="input" id="location" name="location" value="${e(u.location || '')}" maxlength="60" />
        </div>
        <div class="field">
          <label class="label" for="website">${e(ctx.t('user.website'))}</label>
          <input class="input" id="website" name="website" type="url" value="${e(u.website || '')}" placeholder="https://…" maxlength="200" />
        </div>
      </div>
      <div class="field">
        <label class="label" for="bio">${e(ctx.t('user.bio'))}</label>
        <textarea class="textarea" id="bio" name="bio" rows="3" maxlength="300">${e(u.bio || '')}</textarea>
      </div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">${e(ctx.t('user.saveProfile'))}</button></div>
    </form>

    <div class="card form-card">
      <h2>${e(ctx.t('email.section'))}</h2>
      <div class="email-row">
        <div class="email-row-main">
          <strong>${e(u.email || ctx.t('email.noEmail'))}</strong>
          <span class="muted">${e(
            emailVerified
              ? ctx.t('email.verifiedDesc')
              : mailReady
                ? ctx.t('email.unverifiedDesc')
                : ctx.t('email.notConfiguredDesc'),
          )}</span>
        </div>
        <div class="email-row-actions">
          <span class="badge ${emailVerified ? 'badge-ok' : 'badge-warn'}">${e(
            emailVerified ? ctx.t('email.verified') : ctx.t('email.unverified'),
          )}</span>
          ${
            !emailVerified && u.email && mailReady
              ? `<form method="post" action="/verify-email/resend">
                  ${csrfField(ctx)}
                  <button class="btn btn-outline btn-sm" type="submit">${icon('megaphone', 14)}${e(ctx.t('email.resend'))}</button>
                </form>`
              : ''
          }
        </div>
      </div>
      ${verifyRequired && !emailVerified ? `<p class="hint">${icon('alert', 13)}${e(ctx.t('email.requiredHint'))}</p>` : ''}
    </div>

    <div class="card form-card">
      <h2>${e(ctx.t('user.connected'))}</h2>
      <div class="account-list">
        ${
          providers.length
            ? providers
                .map((p) => {
                  const acc = connected.get(p.id);
                  return `<div class="account-row">
                    <span class="oauth-mark" style="--c:${e(p.color)}">${e(p.monogram)}</span>
                    <div class="account-info"><strong>${e(p.label)}</strong><span>${acc ? e(acc.username || '') : '—'}</span></div>
                    ${
                      acc
                        ? `<form method="post" action="/settings/disconnect">
                            ${csrfField(ctx)}<input type="hidden" name="provider" value="${p.id}" />
                            <button class="btn btn-ghost btn-sm" type="submit" ${canDisconnect ? '' : 'disabled'}>${e(
                              ctx.t('user.disconnect'),
                            )}</button>
                          </form>`
                        : `<a class="btn btn-outline btn-sm" href="/auth/${p.id}?next=/settings&link=1">${e(ctx.t('user.connect'))}</a>`
                    }
                  </div>`;
                })
                .join('')
            : `<p class="muted">${e(ctx.t('auth.oauthNotConfigured'))}</p>`
        }
      </div>
    </div>

    ${
      u.password_hash
        ? `<form class="card form-card" method="post" action="/settings/password">
            ${csrfField(ctx)}
            <h2>${e(ctx.t('user.changePassword'))}</h2>
            <div class="form-grid">
              <div class="field">
                <label class="label" for="current">${e(ctx.t('user.currentPassword'))}</label>
                <input class="input" id="current" name="current" type="password" autocomplete="current-password" required />
              </div>
              <div class="field">
                <label class="label" for="fresh">${e(ctx.t('user.newPassword'))}</label>
                <input class="input" id="fresh" name="password" type="password" autocomplete="new-password" minlength="8" required />
              </div>
            </div>
            <span class="hint">${e(ctx.t('user.changePasswordHint'))}</span>
            <div class="form-actions"><button class="btn btn-primary" type="submit">${e(ctx.t('user.changePassword'))}</button></div>
          </form>`
        : ''
    }`;

  return layout(ctx, { body, title: ctx.t('nav.settings') });
}

/* ------------------------------------------------------------------ 通知 */

export function notificationsPage(
  ctx: Ctx,
  rows: { id: number; type: string; topic_id: number | null; created_at: number; is_read: number; actor_name: string | null; actor_username: string | null; actor_avatar: string | null; topic_title: string | null }[],
): string {
  const body = `<div class="page-head page-head-row">
      <div><h1>${e(ctx.t('user.notifications'))}</h1><p>${e(ctx.t('notif.emptyDesc'))}</p></div>
      ${
        rows.some((r) => !r.is_read)
          ? `<form method="post" action="/notifications/read">${csrfField(ctx)}<button class="btn btn-outline btn-sm" type="submit">${e(
              ctx.t('notif.markAll'),
            )}</button></form>`
          : ''
      }
    </div>
    <div class="notif-list">${
      rows.length
        ? rows
            .map(
              (n) => `<a class="notif-item ${n.is_read ? '' : 'is-unread'}" href="${n.topic_id ? `/t/${n.topic_id}` : '/notifications'}">
                ${avatar({ name: n.actor_name || '?', username: n.actor_username || '', url: n.actor_avatar, size: 36 })}
                <div class="notif-body">
                  <div class="notif-text"><strong>${e(n.actor_name || ctx.t('notif.system'))}</strong> ${e(ctx.t('notif.' + n.type))}</div>
                  ${n.topic_title ? `<div class="notif-topic">${e(n.topic_title)}</div>` : ''}
                </div>
                <span class="notif-time">${e(formatRelative(n.created_at, ctx.locale, ctx.t))}</span>
              </a>`,
            )
            .join('')
        : emptyState(ctx.t('notif.empty'), ctx.t('notif.emptyDesc'))
    }</div>`;

  return layout(ctx, { body, title: ctx.t('user.notifications') });
}

/* ------------------------------------------------------------------ 收藏 */

export function bookmarksPage(ctx: Ctx, topics: TopicRow[]): string {
  const body = `<div class="page-head"><h1>${e(ctx.t('nav.bookmarks'))}</h1></div>
    <div class="topic-list">${
      topics.length ? topics.map((t) => topicRow(ctx, t)).join('') : emptyState(ctx.t('nav.bookmarks'), ctx.t('state.empty'))
    }</div>`;
  return layout(ctx, { body, title: ctx.t('nav.bookmarks') });
}

/* ------------------------------------------------------------------ 搜索 */

export function searchPage(
  ctx: Ctx,
  data: {
    q: string;
    topics: TopicRow[];
    total: number;
    page: number;
    totalPages: number;
    mode?: 'fts' | 'like';
    tookMs?: number;
  },
): string {
  const { q, topics, total, page, totalPages, mode, tookMs } = data;
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  const terms = q.split(/\s+/).filter(Boolean);

  const body = `<div class="page-head">
      <h1>${e(ctx.t('search.title'))}</h1>
      <form class="search-big" action="/search" method="get" role="search">
        ${icon('search', 18)}
        <input type="search" name="q" value="${e(q)}" placeholder="${e(ctx.t('search.placeholder'))}" autofocus />
        <button class="btn btn-primary" type="submit">${e(ctx.t('nav.search'))}</button>
      </form>
    </div>
    ${
      q
        ? `<p class="search-summary">${e(ctx.t('search.results', { count: total }))}${
            mode === 'fts' && total > 0
              ? `<span class="search-meta">${icon('sparkles', 12)}${e(ctx.t('search.relevance'))}${
                  typeof tookMs === 'number' ? ` · ${tookMs}ms` : ''
                }</span>`
              : ''
          }</p>`
        : ''
    }
    <div class="topic-list">${
      topics.length
        ? topics.map((t) => topicRow(ctx, t, { highlight: terms })).join('')
        : q
          ? emptyState(ctx.t('search.noResults'), ctx.t('search.noResultsDesc'))
          : emptyState(ctx.t('search.title'), ctx.t('search.placeholder'))
    }</div>
    ${pagination(ctx, page, totalPages, '/search', query)}`;
  return layout(ctx, { body, title: ctx.t('search.title'), noindex: true });
}

/* ------------------------------------------------------------------ 其他 */

export function errorPage(ctx: Ctx, status: number, message?: string): string {
  const title = status === 404 ? ctx.t('error.404title') : status === 403 ? ctx.t('error.noPermission') : ctx.t('error.500title');
  const desc = message || (status === 404 ? ctx.t('error.404desc') : ctx.t('error.500desc'));
  const body = `<div class="error-wrap">
      <div class="error-code">${status}</div>
      <h1>${e(title)}</h1>
      <p>${e(desc)}</p>
      <div class="error-actions">
        <a class="btn btn-primary" href="/">${e(ctx.t('error.backHome'))}</a>
        <a class="btn btn-outline" href="javascript:history.back()">${e(ctx.t('action.back'))}</a>
      </div>
    </div>`;
  return layout(ctx, { body, title, noindex: true });
}

export function aboutPage(ctx: Ctx, content: string): string {
  const body = `<div class="page-head"><h1>${e(ctx.t('footer.about'))}</h1></div>
    <article class="card article-card"><div class="md">${content}</div></article>`;
  return layout(ctx, { body, title: ctx.t('footer.about') });
}

export function replyPreview(html: string): string {
  return `<div class="md">${html}</div>`;
}

export type { Topic };
