import type { Ctx, TopicRow } from '../types';
import type { Category } from '../lib/types';
import { categoryDesc, categoryName } from '../lib/i18n';
import { escapeHtml as e } from '../lib/utils';
import { avatar, icon } from './ui';
import { stats as fetchStats, topMembers } from '../lib/db';

export interface LayoutOptions {
  title?: string;
  description?: string;
  body: string;
  active?: string;
  sidebar?: string;
  noindex?: boolean;
  bodyClass?: string;
  wide?: boolean;
}

const C = {
  brandMark: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8 8 0 0 1-8 8H7l-4 3V11.5a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/></svg>`,
};

function langSwitch(ctx: Ctx): string {
  const other = ctx.locale === 'zh-CN' ? 'en-US' : 'zh-CN';
  const label = other === 'zh-CN' ? '中文' : 'EN';
  const next = encodeURIComponent(ctx.url.pathname + ctx.url.search);
  return `<a class="footer-link" href="/lang/${other}?next=${next}" hreflang="${other}">${icon('globe', 14)}${label}</a>`;
}

export function header(ctx: Ctx, activeKey?: string): string {
  const u = ctx.user;
  const active = activeKey;
  const navItem = (href: string, label: string, key: string) =>
    `<a class="main-nav-link ${active === key ? 'is-active' : ''}" href="${href}">${label}</a>`;

  return `<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/" aria-label="${e(ctx.siteName)}">
      <span class="brand-mark">${C.brandMark}</span>
      <span class="brand-name">${e(ctx.siteName)}</span>
    </a>
    <nav class="main-nav" aria-label="Main">
      ${navItem('/', ctx.t('nav.home'), 'home')}
      ${navItem('/?sort=hot', ctx.t('nav.hot'), 'hot')}
      ${navItem('/categories', ctx.t('nav.categories'), 'categories')}
    </nav>
    <form class="header-search" action="/search" method="get" role="search">
      ${icon('search', 16)}
      <input type="search" name="q" placeholder="${e(ctx.t('search.placeholder'))}" aria-label="${e(ctx.t('nav.search'))}" autocomplete="off" />
    </form>
    <div class="header-actions">
      <button class="icon-btn theme-toggle" type="button" data-theme-toggle aria-label="${e(ctx.t('nav.theme'))}" title="${e(ctx.t('nav.theme'))}">
        <span class="theme-icon theme-icon-light">${icon('sun', 18)}</span>
        <span class="theme-icon theme-icon-dark">${icon('moon', 18)}</span>
      </button>
      ${
        u
          ? `<a class="btn btn-primary btn-sm header-new" href="/new">${icon('plus', 16)}<span>${e(ctx.t('nav.newTopic'))}</span></a>
             <a class="icon-btn bell-btn" href="/notifications" aria-label="${e(ctx.t('nav.notifications'))}">
               ${icon('bell', 19)}${ctx.unread > 0 ? `<span class="bell-dot">${ctx.unread > 99 ? '99+' : ctx.unread}</span>` : ''}
             </a>
             <details class="dropdown">
               <summary class="avatar-summary" aria-label="${e(u.display_name)}">
                 ${avatar({ name: u.display_name, username: u.username, url: u.avatar_url, size: 32 })}
                 ${icon('chevronDown', 14, 'summary-caret')}
               </summary>
               <div class="dropdown-panel">
                 <div class="dropdown-user">
                   <div class="dropdown-name">${e(u.display_name)}</div>
                   <div class="dropdown-handle">@${e(u.username)}</div>
                 </div>
                 <a class="dropdown-item" href="/u/${e(u.username)}">${icon('user', 16)}${e(ctx.t('nav.profile'))}</a>
                 <a class="dropdown-item" href="/bookmarks">${icon('bookmark', 16)}${e(ctx.t('nav.bookmarks'))}</a>
                 <a class="dropdown-item" href="/settings">${icon('settings', 16)}${e(ctx.t('nav.settings'))}</a>
                 ${u.role === 'admin' || u.role === 'moderator' ? `<a class="dropdown-item" href="/admin">${icon('shield', 16)}${e(ctx.t('nav.admin'))}</a>` : ''}
                 <div class="dropdown-sep"></div>
                 <form method="post" action="/logout">
                   <input type="hidden" name="_csrf" value="${e(ctx.csrf)}" />
                   <button class="dropdown-item is-danger" type="submit">${icon('logout', 16)}${e(ctx.t('nav.logout'))}</button>
                 </form>
               </div>
             </details>`
          : `<a class="btn btn-ghost btn-sm header-login" href="/login">${e(ctx.t('nav.login'))}</a>
             <a class="btn btn-primary btn-sm" href="/register">${e(ctx.t('nav.register'))}</a>`
      }
      <button class="icon-btn mobile-only" type="button" data-nav-toggle aria-label="${e(ctx.t('nav.menu'))}" aria-expanded="false">
        ${icon('menu', 20)}
      </button>
    </div>
  </div>
  <div class="mobile-menu" id="mobileMenu" hidden>
    <form class="mobile-search" action="/search" method="get" role="search">
      ${icon('search', 16)}
      <input type="search" name="q" placeholder="${e(ctx.t('search.placeholder'))}" />
    </form>
    <a class="mobile-link" href="/">${icon('home', 17)}${e(ctx.t('nav.home'))}</a>
    <a class="mobile-link" href="/?sort=hot">${icon('fire', 17)}${e(ctx.t('nav.hot'))}</a>
    <a class="mobile-link" href="/categories">${icon('listIcon', 17)}${e(ctx.t('nav.categories'))}</a>
    <a class="mobile-link" href="/new">${icon('plus', 17)}${e(ctx.t('nav.newTopic'))}</a>
    ${u ? `<a class="mobile-link" href="/notifications">${icon('bell', 17)}${e(ctx.t('nav.notifications'))}</a>` : ''}
  </div>
</header>`;
}

export function flashBanner(ctx: Ctx): string {
  if (!ctx.flash) return '';
  return `<div class="flash flash-${ctx.flash.type}" role="status">${icon(ctx.flash.type === 'ok' ? 'check' : 'alert', 16)}<span>${e(
    ctx.flash.text,
  )}</span></div>`;
}

export function footer(ctx: Ctx): string {
  return `<footer class="site-footer">
  <div class="container footer-inner">
    <div class="footer-brand">
      <a class="brand" href="/"><span class="brand-mark">${C.brandMark}</span><span class="brand-name">${e(ctx.siteName)}</span></a>
      <p class="footer-desc">${e(ctx.t('footer.powered'))}</p>
    </div>
    <div class="footer-col">
      <h4>${e(ctx.t('footer.community'))}</h4>
      <a class="footer-link" href="/">${e(ctx.t('nav.home'))}</a>
      <a class="footer-link" href="/categories">${e(ctx.t('nav.categories'))}</a>
      <a class="footer-link" href="/search">${e(ctx.t('nav.search'))}</a>
    </div>
    <div class="footer-col">
      <h4>${e(ctx.t('footer.links'))}</h4>
      <a class="footer-link" href="/feed.xml">${icon('link', 14)}${e(ctx.t('footer.rss'))}</a>
      <a class="footer-link" href="/sitemap.xml">Sitemap</a>
      <a class="footer-link" href="/about">${e(ctx.t('footer.about'))}</a>
    </div>
    <div class="footer-col">
      <h4>${e(ctx.t('footer.language'))}</h4>
      ${langSwitch(ctx)}
      <button class="footer-link" type="button" data-theme-toggle>${icon('sun', 14)}${e(ctx.t('nav.theme'))}</button>
      <span class="footer-copy">© ${new Date().getFullYear()} ${e(ctx.siteName)}</span>
    </div>
  </div>
</footer>`;
}

export function layout(ctx: Ctx, opts: LayoutOptions): string {
  const title = opts.title ? `${opts.title} · ${ctx.siteName}` : `${ctx.siteName} · ${ctx.env.SITE_TAGLINE || ctx.t('home.subtitle')}`;
  const desc = opts.description || ctx.env.SITE_TAGLINE || ctx.t('home.subtitle');
  const bodyClass = ['page', opts.bodyClass || ''].filter(Boolean).join(' ');
  const main = `<main id="main" class="${opts.wide ? 'container-wide' : ''}">
      ${flashBanner(ctx)}
      ${opts.body}
    </main>`;

  return `<!doctype html>
<html lang="${ctx.locale}" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${e(title)}</title>
<meta name="description" content="${e(desc)}" />
${opts.noindex ? '<meta name="robots" content="noindex,nofollow" />' : ''}
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#0b0e14" media="(prefers-color-scheme: dark)" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${e(ctx.siteName)}" />
<meta property="og:title" content="${e(title)}" />
<meta property="og:description" content="${e(desc)}" />
<link rel="canonical" href="${e(ctx.url.origin + ctx.url.pathname)}" />
<link rel="alternate" type="application/rss+xml" title="${e(ctx.siteName)}" href="/feed.xml" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/app.css" />
<script>(function(){try{var t=localStorage.getItem('cfbbs-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();</script>
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">${ctx.locale === 'zh-CN' ? '跳到主要内容' : 'Skip to content'}</a>
${header(ctx, opts.active)}
<div class="container shell ${opts.sidebar ? 'has-sidebar' : ''}">
  ${main}
  ${opts.sidebar ? `<aside class="sidebar">${opts.sidebar}</aside>` : ''}
</div>
${footer(ctx)}
<script src="/app.js" defer></script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ 侧边栏 */

export async function buildSidebar(
  ctx: Ctx,
  categories: Category[],
  trending: TopicRow[] = [],
  siteStatsIn?: { topics: number; posts: number; users: number; online: number },
): Promise<string> {
  const [fetched, members] = await Promise.all([
    siteStatsIn ? Promise.resolve(null) : fetchStats(ctx.env),
    topMembers(ctx.env, 6),
  ]);
  const siteStats = siteStatsIn || (fetched as { topics: number; posts: number; users: number; online: number });
  const activeSlug = ctx.params.slug;

  const catList = categories
    .map(
      (c) => `<a class="cat-link ${activeSlug === c.slug ? 'is-active' : ''}" href="/c/${e(c.slug)}" style="--c:${e(c.color || '#6366f1')}">
        <span class="cat-dot"></span>
        <span class="cat-name" title="${e(categoryDesc(c, ctx.locale))}">${e(categoryName(c, ctx.locale))}</span>
        <span class="cat-count">${c.topic_count}</span>
      </a>`,
    )
    .join('');

  const trendList = trending
    .map(
      (t, i) => `<a class="trend-item" href="/t/${t.id}">
        <span class="trend-rank">${i + 1}</span>
        <span class="trend-title">${e(t.title)}</span>
        <span class="trend-meta">${t.reply_count}</span>
      </a>`,
    )
    .join('');

  return `<section class="side-card">
      <div class="side-head"><span>${icon('listIcon', 15)}${e(ctx.t('home.categories'))}</span><a href="/categories">${e(ctx.t('action.viewAll'))}</a></div>
      <nav class="cat-nav">${catList}</nav>
    </section>
    <section class="side-card">
      <div class="side-head"><span>${icon('users', 15)}${e(ctx.t('admin.overview'))}</span></div>
      <div class="mini-stats">
        <div><strong>${siteStats.topics}</strong><span>${e(ctx.t('home.stats.topics'))}</span></div>
        <div><strong>${siteStats.posts}</strong><span>${e(ctx.t('home.stats.posts'))}</span></div>
        <div><strong>${siteStats.users}</strong><span>${e(ctx.t('home.stats.members'))}</span></div>
        <div><strong>${siteStats.online}</strong><span>${e(ctx.t('home.stats.online'))}</span></div>
      </div>
    </section>
    ${
      trendList
        ? `<section class="side-card">
             <div class="side-head"><span>${icon('fire', 15)}${e(ctx.t('home.trending'))}</span></div>
             <div class="trend-list">${trendList}</div>
           </section>`
        : ''
    }
    ${
      members.length
        ? `<section class="side-card">
             <div class="side-head"><span>${icon('users', 15)}${e(ctx.t('home.members'))}</span></div>
             <div class="member-list">
               ${members
                 .map(
                   (m) => `<a class="member-item" href="/u/${e(m.username)}" title="${e(m.display_name)}">
                     ${avatar({ name: m.display_name, username: m.username, url: m.avatar_url, size: 30 })}
                     <span class="member-name">${e(m.display_name)}</span>
                   </a>`,
                 )
                 .join('')}
             </div>
           </section>`
        : ''
    }
    <section class="side-card side-cta">
      <h4>${e(ctx.t('home.join'))}</h4>
      <p>${e(ctx.t('home.joinDesc'))}</p>
      ${
        ctx.user
          ? `<a class="btn btn-primary btn-block" href="/new">${icon('plus', 16)}${e(ctx.t('nav.newTopic'))}</a>`
          : `<a class="btn btn-primary btn-block" href="/register">${e(ctx.t('auth.submitRegister'))}</a>`
      }
    </section>`;
}
