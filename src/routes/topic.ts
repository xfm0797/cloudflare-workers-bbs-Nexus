import { get, post } from '../router';
import {
  createPost,
  createTopic,
  getCategoryBySlug,
  getCategories,
  getPosts,
  getTopic,
  getTopicRow,
  incrementViews,
  isBookmarked,
  notify,
  notifyMentions,
} from '../lib/db';
import { buildSidebar } from '../views/layout';
import { composePage, errorPage, topicPage } from '../views/pages';
import { parseIntParam } from '../lib/utils';
import { isStaff } from '../lib/auth';

const POSTS_PER_PAGE = 15;

function canWrite(ctx: { user: { status: string } | null }): boolean {
  return !!ctx.user && ctx.user.status === 'active';
}

get('/t/:id', async (ctx) => {
  const id = parseIntParam(ctx.params.id, 0);
  if (!id) return ctx.html(errorPage(ctx, 404), 404);

  const topic = await getTopicRow(ctx.env, id);
  if (!topic || topic.is_deleted) return ctx.html(errorPage(ctx, 404), 404);

  const sort = ctx.query.get('sort') === 'desc' ? 'desc' : 'asc';
  const page = parseIntParam(ctx.query.get('page'), 1);
  const first = await getPosts(ctx.env, id, page, POSTS_PER_PAGE, ctx.user?.id ?? null, 'asc');

  let posts = first.posts;
  if (sort === 'desc') {
    const target = Math.max(1, first.totalPages - page + 1);
    if (target !== page) {
      const r = await getPosts(ctx.env, id, target, POSTS_PER_PAGE, ctx.user?.id ?? null, 'asc');
      posts = [...r.posts].reverse();
    } else {
      posts = [...posts].reverse();
    }
  }

  const [categories, bookmarked] = await Promise.all([
    getCategories(ctx.env),
    isBookmarked(ctx.env, ctx.user?.id ?? null, id),
  ]);
  const sidebar = await buildSidebar(ctx, categories);

  ctx.exec.waitUntil(incrementViews(ctx.env, id));

  return ctx.html(
    topicPage(ctx, {
      topic,
      posts,
      page,
      totalPages: first.totalPages,
      bookmarked,
      canModerate: isStaff(ctx.user),
      sort,
      sidebar,
    }),
  );
});

get('/new', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login?next=/new');
  if (!canWrite(ctx)) return ctx.html(errorPage(ctx, 403, ctx.t('auth.banned')), 403);

  const categories = (await getCategories(ctx.env)).filter(
    (c) => !c.admin_only || ctx.user!.role === 'admin',
  );
  if (!categories.length) return ctx.html(errorPage(ctx, 403, ctx.t('admin.noPermission')), 403);

  return ctx.html(composePage(ctx, categories, ctx.query.get('category') || undefined));
});

post('/new', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login?next=/new');
  if (!canWrite(ctx)) return ctx.html(errorPage(ctx, 403, ctx.t('auth.banned')), 403);

  const title = String(ctx.form?.get('title') || '').trim();
  const content = String(ctx.form?.get('content') || '').trim();
  const categoryId = Number.parseInt(String(ctx.form?.get('category_id') || ''), 10);
  const rawTags = String(ctx.form?.get('tags') || '');

  const categories = (await getCategories(ctx.env)).filter((c) => !c.admin_only || ctx.user!.role === 'admin');
  const category = categories.find((c) => c.id === categoryId) || categories[0];
  if (!category) return ctx.html(errorPage(ctx, 400, ctx.t('admin.noPermission')), 400);

  const back = (msg: string) => {
    ctx.flash = { type: 'error', text: msg };
    return ctx.html(composePage(ctx, categories, category.slug), 400);
  };

  if (title.length < 4 || title.length > 120) return back(ctx.t('compose.errorTitle'));
  if (content.length < 10 || content.length > 20000) return back(ctx.t('compose.errorContent'));

  const tags = rawTags
    .split(/[,，\s]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 20))
    .filter(Boolean)
    .slice(0, 5);

  const topicId = await createTopic(ctx.env, {
    categoryId: category.id,
    authorId: ctx.user.id,
    title,
    content,
    tags,
  });

  const topic = await getTopic(ctx.env, topicId);
  const firstPost = await ctx.env.DB.prepare('SELECT id FROM posts WHERE topic_id = ? ORDER BY position ASC LIMIT 1')
    .bind(topicId)
    .first<{ id: number }>();
  if (topic && firstPost) {
    await notifyMentions(ctx.env, content, ctx.user, topicId, firstPost.id);
  }

  return ctx.redirect(`/t/${topicId}`, 'compose.success');
});

post('/t/:id/reply', async (ctx) => {
  const id = parseIntParam(ctx.params.id, 0);
  if (!ctx.user) return ctx.redirect(`/login?next=/t/${id}`);
  if (!canWrite(ctx)) return ctx.html(errorPage(ctx, 403, ctx.t('auth.banned')), 403);

  const topic = await getTopic(ctx.env, id);
  if (!topic || topic.is_deleted) return ctx.html(errorPage(ctx, 404), 404);
  if (topic.is_locked) return ctx.html(errorPage(ctx, 403, ctx.t('error.topicLocked')), 403);

  const content = String(ctx.form?.get('content') || '').trim().slice(0, 20000);
  if (content.length < 2) return ctx.redirect(`/t/${id}`, 'compose.errorContent', 'error');

  const replyToRaw = String(ctx.form?.get('reply_to') || '');
  const replyTo = Number.parseInt(replyToRaw, 10);
  let replyToId: number | null = null;
  let replyToAuthor: string | null = null;
  if (Number.isFinite(replyTo) && replyTo > 0) {
    const target = await ctx.env.DB.prepare('SELECT id, author_id FROM posts WHERE id = ? AND topic_id = ?')
      .bind(replyTo, id)
      .first<{ id: number; author_id: string }>();
    if (target) {
      replyToId = target.id;
      replyToAuthor = target.author_id;
    }
  }

  const postId = await createPost(ctx.env, {
    topicId: id,
    authorId: ctx.user.id,
    content,
    replyToPostId: replyToId,
  });

  await notify(ctx.env, {
    userId: topic.author_id,
    actorId: ctx.user.id,
    type: 'reply',
    topicId: id,
    postId,
  });
  if (replyToAuthor) {
    await notify(ctx.env, { userId: replyToAuthor, actorId: ctx.user.id, type: 'reply', topicId: id, postId });
  }
  await notifyMentions(ctx.env, content, ctx.user, id, postId);

  const total = topic.reply_count + 2;
  const lastPage = Math.ceil(total / POSTS_PER_PAGE);
  return ctx.redirect(`/t/${id}?page=${lastPage}#p${postId}`, 'topic.replySuccess');
});

/* ------------------------------------------------------------------ 版务 */

post('/moderate/topic/:id', async (ctx) => {
  const id = parseIntParam(ctx.params.id, 0);
  const topic = await getTopic(ctx.env, id);
  if (!topic) return ctx.html(errorPage(ctx, 404), 404);
  if (!ctx.user) return ctx.redirect('/login');

  const action = String(ctx.form?.get('action') || '');
  const staff = isStaff(ctx.user);
  const author = ctx.user.id === topic.author_id;
  if (!staff && !(author && action === 'delete')) {
    return ctx.html(errorPage(ctx, 403, ctx.t('error.noPermission')), 403);
  }

  const now = Date.now();
  switch (action) {
    case 'pin':
      await ctx.env.DB.prepare('UPDATE topics SET is_pinned = 1, updated_at = ? WHERE id = ?').bind(now, id).run();
      break;
    case 'unpin':
      await ctx.env.DB.prepare('UPDATE topics SET is_pinned = 0, updated_at = ? WHERE id = ?').bind(now, id).run();
      break;
    case 'lock':
      await ctx.env.DB.prepare('UPDATE topics SET is_locked = 1, updated_at = ? WHERE id = ?').bind(now, id).run();
      break;
    case 'unlock':
      await ctx.env.DB.prepare('UPDATE topics SET is_locked = 0, updated_at = ? WHERE id = ?').bind(now, id).run();
      break;
    case 'feature':
      await ctx.env.DB.prepare('UPDATE topics SET is_featured = 1 - is_featured, updated_at = ? WHERE id = ?')
        .bind(now, id)
        .run();
      break;
    case 'delete':
      await ctx.env.DB.prepare('UPDATE topics SET is_deleted = 1, updated_at = ? WHERE id = ?').bind(now, id).run();
      return author && !staff ? ctx.redirect('/', 'admin.topicDeleted') : ctx.redirect(`/t/${id}`, 'admin.topicDeleted');
    default:
      return ctx.html(errorPage(ctx, 400, ctx.t('error.badRequest')), 400);
  }

  const back = String(ctx.form?.get('back') || '');
  return ctx.redirect(back.startsWith('/') ? back : `/t/${id}`);
});

post('/moderate/post/:id', async (ctx) => {
  const id = parseIntParam(ctx.params.id, 0);
  if (!ctx.user) return ctx.redirect('/login');
  const target = await ctx.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<{ id: number; topic_id: number; author_id: string }>();
  if (!target) return ctx.html(errorPage(ctx, 404), 404);
  if (!isStaff(ctx.user) && ctx.user.id !== target.author_id) {
    return ctx.html(errorPage(ctx, 403, ctx.t('error.noPermission')), 403);
  }

  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE posts SET is_deleted = 1 WHERE id = ?').bind(id),
    ctx.env.DB.prepare('UPDATE topics SET reply_count = MAX(reply_count - 1, 0) WHERE id = ?').bind(target.topic_id),
    ctx.env.DB.prepare('UPDATE users SET post_count = MAX(post_count - 1, 0) WHERE id = ?').bind(target.author_id),
  ]);

  return ctx.redirect(`/t/${target.topic_id}`, 'admin.postDeleted');
});

/* ------------------------------------------------------------------ 兼容：/c/:slug 的预选板块 */

get('/c/:slug/new', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login?next=/new');
  const category = await getCategoryBySlug(ctx.env, ctx.params.slug);
  return ctx.redirect(category ? `/new?category=${category.slug}` : '/new');
});

export {};
