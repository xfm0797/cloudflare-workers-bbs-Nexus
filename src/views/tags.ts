import type { Ctx } from '../types';
import type { TopicRow } from '../lib/db';
import { escapeHtml as e } from '../lib/utils';
import { emptyState, pagination, topicRow } from './ui';
import { layout } from './layout';

/** 标签云页 */
export function tagsPage(ctx: Ctx, tags: { name: string; count: number }[]): string {
  const max = Math.max(1, ...tags.map((t) => t.count));
  const cloud = tags
    .map((t) => {
      const level = t.count === max ? 5 : Math.max(1, Math.ceil((t.count / max) * 5));
      return `<a class="tag-cloud-item tag-lv${level}" href="/tags/${encodeURIComponent(t.name)}">${e(t.name)}<span>${t.count}</span></a>`;
    })
    .join('');

  const body = `<div class="page-head"><h1>${e(ctx.t('tags.title'))}</h1><p>${e(ctx.t('tags.desc'))}</p></div>
    <div class="tag-cloud">${
      tags.length ? cloud : emptyState(ctx.t('tags.title'), ctx.t('state.empty'))
    }</div>`;

  return layout(ctx, { body, title: ctx.t('tags.title'), active: 'tags' });
}

/** 单标签主题列表页 */
export function tagPage(ctx: Ctx, tag: string, topics: TopicRow[], page: number, totalPages: number, total: number): string {
  const body = `<div class="page-head page-head-row">
      <div><h1><span class="tag-hash">#</span>${e(tag)}</h1><p>${ctx.t('tags.topicCount', { n: total })}</p></div>
      <a class="btn btn-outline btn-sm" href="/tags">${e(ctx.t('tags.all'))}</a>
    </div>
    <div class="topic-list">${
      topics.length ? topics.map((t) => topicRow(ctx, t)).join('') : emptyState(tag, ctx.t('state.empty'))
    }</div>
    ${totalPages > 1 ? `<div class="topic-pager">${pagination(ctx, page, totalPages, `/tags/${encodeURIComponent(tag)}`, new URLSearchParams())}</div>` : ''}`;

  return layout(ctx, {
    body,
    title: `#${tag}`,
    description: ctx.t('tags.topicCount', { n: total }),
  });
}
