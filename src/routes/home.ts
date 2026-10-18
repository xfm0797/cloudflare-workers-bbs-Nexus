import { get } from '../router';
import {
  getCategories,
  getCategoryBySlug,
  getTrendingTopics,
  hasUsers,
  listTopics,
  stats as fetchStats,
} from '../lib/db';
import { buildSidebar } from '../views/layout';
import { aboutPage, categoriesPage, categoryPage, errorPage, homePage, searchPage } from '../views/pages';
import { parseIntParam } from '../lib/utils';
import { renderMarkdown } from '../lib/markdown';
import { searchTopics } from '../lib/search';

get('/', async (ctx) => {
  if (!(await hasUsers(ctx.env))) return ctx.redirect('/setup');

  const rawSort = ctx.query.get('sort');
  const sort = rawSort === 'hot' ? 'hot' : rawSort === 'unanswered' ? 'unanswered' : 'latest';
  const page = parseIntParam(ctx.query.get('page'), 1);

  const categories = await getCategories(ctx.env);
  const [feed, siteStats, trending] = await Promise.all([
    listTopics(ctx.env, { sort, page, perPage: 20 }),
    fetchStats(ctx.env),
    getTrendingTopics(ctx.env, 5),
  ]);
  const sidebar = await buildSidebar(ctx, categories, trending, siteStats);

  const html = homePage(ctx, {
    categories,
    topics: feed.topics,
    total: feed.total,
    page: feed.page,
    totalPages: feed.totalPages,
    sort,
    stats: siteStats,
    announcement: ctx.settings.announcement || '',
    sidebar,
  });
  return ctx.html(html);
});

get('/categories', async (ctx) => {
  const categories = await getCategories(ctx.env);
  return ctx.html(await categoriesPage(ctx, categories));
});

get('/c/:slug', async (ctx) => {
  const category = await getCategoryBySlug(ctx.env, ctx.params.slug);
  if (!category) return ctx.html(errorPage(ctx, 404), 404);

  const sort = ctx.query.get('sort') === 'hot' ? 'hot' : 'latest';
  const page = parseIntParam(ctx.query.get('page'), 1);
  const categories = await getCategories(ctx.env);
  const feed = await listTopics(ctx.env, { categoryId: category.id, sort, page, perPage: 20 });
  const sidebar = await buildSidebar(ctx, categories);

  return ctx.html(
    categoryPage(ctx, {
      category,
      topics: feed.topics,
      page: feed.page,
      totalPages: feed.totalPages,
      sort,
      sidebar,
    }),
  );
});

get('/search', async (ctx) => {
  const q = (ctx.query.get('q') || '').trim().slice(0, 80);
  const page = parseIntParam(ctx.query.get('page'), 1);
  const result = q
    ? await searchTopics(ctx.env, q, { page, perPage: 20 })
    : { topics: [], total: 0, page: 1, totalPages: 1, mode: 'fts' as const, tookMs: 0 };

  return ctx.html(searchPage(ctx, { q, ...result }));
});

get('/about', (ctx) => {
  const zh = `### 关于 ${ctx.siteName}

这是一个运行在 **Cloudflare Workers + D1** 之上的轻量社区：

- 边缘渲染，全球访问延迟极低
- 零第三方运行时依赖，包体积小
- 支持 Markdown、点赞、收藏、通知与举报
- 支持 GitHub / Google / GitLab / Gitee / Discord / OIDC 登录

### 社区准则

1. 保持友善，尊重不同观点
2. 不发布违法、侵权或骚扰内容
3. 发帖前先搜索，避免重复
4. 广告与推广请先联系管理员`;

  const en = `### About ${ctx.siteName}

A lightweight community running on **Cloudflare Workers + D1**:

- Edge-rendered for low latency worldwide
- Zero third-party runtime dependencies
- Markdown, likes, bookmarks, notifications and reports
- Sign in with GitHub / Google / GitLab / Gitee / Discord / OIDC

### Guidelines

1. Be kind and respect different opinions
2. No illegal, infringing or harassing content
3. Search before posting to avoid duplicates
4. Contact admins before advertising`;

  return ctx.html(aboutPage(ctx, renderMarkdown(ctx.locale === 'zh-CN' ? zh : en)));
});
