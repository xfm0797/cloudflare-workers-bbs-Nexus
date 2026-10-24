import { get } from '../router';
import { popularTags, topicsByTag } from '../lib/db';
import { tagPage, tagsPage } from '../views/tags';

get('/tags', async (ctx) => {
  const tags = await popularTags(ctx.env, 60);
  return ctx.html(tagsPage(ctx, tags));
});

get('/tags/:name', async (ctx) => {
  const tag = ctx.params.name.trim().slice(0, 40);
  if (!tag) return ctx.redirect('/tags');
  const page = Math.max(1, Number(ctx.query.get('page')) || 1);
  const data = await topicsByTag(ctx.env, tag, page);
  return ctx.html(tagPage(ctx, tag, data.topics, data.page, data.totalPages, data.total));
});
