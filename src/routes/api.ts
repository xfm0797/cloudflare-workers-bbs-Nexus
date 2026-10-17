import { get, post } from '../router';
import { toggleBookmark, toggleLike, getTopic } from '../lib/db';
import { renderMarkdown } from '../lib/markdown';
import { errorPage } from '../views/pages';

function wantsJson(ctx: { req: Request }): boolean {
  return (ctx.req.headers.get('accept') || '').includes('application/json');
}

get('/api/health', (ctx) => ctx.json({ ok: true, ts: Date.now() }));

post('/api/like', async (ctx) => {
  if (!ctx.user) {
    return wantsJson(ctx) ? ctx.json({ ok: false, error: 'unauthorized' }, 401) : ctx.redirect('/login');
  }
  const type = String(ctx.form?.get('type') || '');
  const id = Number.parseInt(String(ctx.form?.get('id') || ''), 10);
  if ((type !== 'post' && type !== 'topic') || !Number.isFinite(id) || id <= 0) {
    return ctx.json({ ok: false, error: 'bad_request' }, 400);
  }

  const result = await toggleLike(ctx.env, ctx.user.id, type, id);
  if (wantsJson(ctx)) return ctx.json({ ok: true, ...result });

  const back = ctx.req.headers.get('referer') || '/';
  try {
    const url = new URL(back);
    return ctx.redirect(url.pathname + url.search + (url.hash || ''));
  } catch {
    return ctx.redirect('/');
  }
});

post('/api/bookmark', async (ctx) => {
  if (!ctx.user) {
    return wantsJson(ctx) ? ctx.json({ ok: false, error: 'unauthorized' }, 401) : ctx.redirect('/login');
  }
  const topicId = Number.parseInt(String(ctx.form?.get('id') || ''), 10);
  if (!Number.isFinite(topicId) || topicId <= 0) return ctx.json({ ok: false, error: 'bad_request' }, 400);

  const result = await toggleBookmark(ctx.env, ctx.user.id, topicId);
  if (wantsJson(ctx)) return ctx.json({ ok: true, ...result });
  return ctx.redirect(`/t/${topicId}`);
});

post('/api/preview', async (ctx) => {
  const content = String(ctx.form?.get('content') || '').slice(0, 20000);
  return ctx.json({ ok: true, html: renderMarkdown(content) });
});

post('/api/report', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login');
  const targetType = String(ctx.form?.get('target_type') || 'post');
  const targetId = Number.parseInt(String(ctx.form?.get('target_id') || ''), 10);
  const reason = String(ctx.form?.get('reason') || 'other').slice(0, 40);
  const detail = String(ctx.form?.get('detail') || '').trim().slice(0, 300);
  const back = String(ctx.form?.get('back') || '/');

  if (!['post', 'topic', 'user'].includes(targetType) || !Number.isFinite(targetId)) {
    return ctx.html(errorPage(ctx, 400, ctx.t('error.badRequest')), 400);
  }

  const exists = await ctx.env.DB.prepare(
    "SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'pending'",
  )
    .bind(ctx.user.id, targetType, targetId)
    .first();
  if (!exists) {
    await ctx.env.DB.prepare(
      'INSERT INTO reports (reporter_id, target_type, target_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(ctx.user.id, targetType, targetId, reason, detail || null, Date.now())
      .run();
  }

  return ctx.redirect(back.startsWith('/') ? back : '/', 'report.success');
});

get('/api/topic/:id', async (ctx) => {
  const id = Number.parseInt(ctx.params.id, 10);
  const topic = await getTopic(ctx.env, id);
  if (!topic) return ctx.json({ ok: false, error: 'not_found' }, 404);
  return ctx.json({
    ok: true,
    topic: {
      id: topic.id,
      title: topic.title,
      replies: topic.reply_count,
      views: topic.views,
      likes: topic.like_count,
      locked: !!topic.is_locked,
    },
  });
});
