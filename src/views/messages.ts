import type { Ctx } from '../types';
import type { ConversationRow } from '../lib/db';
import { escapeHtml as e } from '../lib/utils';
import { formatRelative } from '../lib/i18n';
import { avatar, csrfField, emptyState, icon, pagination } from './ui';
import { layout } from './layout';

/** 会话列表页 */
export function messagesPage(ctx: Ctx, conversations: ConversationRow[]): string {
  const rows = conversations
    .map(
      (c) => `<a class="dm-item ${c.unread > 0 ? 'is-unread' : ''}" href="/messages/${c.id}">
        ${avatar({ name: c.other_name, username: c.other_username, url: c.other_avatar, size: 40 })}
        <div class="dm-body">
          <div class="dm-row">
            <strong>${e(c.other_name)}</strong>
            <span class="dm-time">${e(formatRelative(c.last_message_at, ctx.locale, ctx.t))}</span>
          </div>
          <div class="dm-row">
            <span class="dm-preview">${e(c.last_message_preview || '…')}</span>
            ${c.unread > 0 ? `<span class="dm-badge">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}
          </div>
        </div>
      </a>`,
    )
    .join('');

  const body = `<div class="page-head page-head-row">
      <div><h1>${e(ctx.t('dm.title'))}</h1><p>${e(ctx.t('dm.emptyDesc'))}</p></div>
    </div>
    <details class="dm-new card-ish">
      <summary class="btn btn-outline btn-sm">${icon('send', 15)}${e(ctx.t('dm.new'))}</summary>
      <form class="dm-new-form" method="post" action="/messages">
        ${csrfField(ctx)}
        <label class="dm-new-label" for="dm-username">${e(ctx.t('dm.to'))}</label>
        <input id="dm-username" name="username" placeholder="${e(ctx.t('dm.toPlaceholder'))}" required autocomplete="off" />
        <button class="btn btn-primary btn-sm" type="submit">${e(ctx.t('dm.new'))}</button>
      </form>
    </details>
    <div class="dm-list">${
      conversations.length ? rows : emptyState(ctx.t('dm.empty'), ctx.t('dm.emptyDesc'))
    }</div>`;

  return layout(ctx, { body, title: ctx.t('dm.title'), active: 'messages', noindex: true });
}

/** 会话详情页（打开即已读） */
export function conversationPage(
  ctx: Ctx,
  conv: ConversationRow,
  messages: any[],
  page: number,
  totalPages: number,
): string {
  const me = ctx.user!;
  // 列表按时间正序展示；分页时旧消息在前
  const items = messages
    .map((m) => {
      const mine = m.sender_id === me.id;
      return `<div class="dm-msg ${mine ? 'is-mine' : ''}" id="m${m.id}">
        ${avatar({ name: m.sender_name, username: m.sender_username, url: m.sender_avatar, size: 32 })}
        <div class="dm-bubble">
          <div class="dm-bubble-head">
            <a href="/u/${e(m.sender_username)}">${e(m.sender_name)}</a>
            <time>${e(formatRelative(m.created_at, ctx.locale, ctx.t))}</time>
          </div>
          <div class="dm-bubble-body">${m.body_html}</div>
        </div>
      </div>`;
    })
    .join('');

  const body = `<div class="page-head page-head-row dm-head">
      <div>
        <a class="dm-back" href="/messages">${icon('arrowLeft', 15)}${e(ctx.t('dm.back'))}</a>
        <h1 class="dm-peer">
          ${avatar({ name: conv.other_name, username: conv.other_username, url: conv.other_avatar, size: 28 })}
          <a href="/u/${e(conv.other_username)}">${e(conv.other_name)}</a>
        </h1>
      </div>
    </div>
    <div class="dm-thread">${items || emptyState(ctx.t('dm.empty'), ctx.t('dm.emptyDesc'))}</div>
    ${totalPages > 1 ? `<div class="topic-pager">${pagination(ctx, page, totalPages, `/messages/${conv.id}`, new URLSearchParams())}</div>` : ''}
    <form class="dm-compose" method="post" action="/messages/${conv.id}">
      ${csrfField(ctx)}
      <textarea name="body" rows="3" required placeholder="${e(ctx.t('dm.placeholder'))}" maxlength="5000"></textarea>
      <button class="btn btn-primary" type="submit">${icon('send', 16)}<span>${e(ctx.t('dm.send'))}</span></button>
    </form>`;

  return layout(ctx, {
    body,
    title: `${ctx.t('dm.title')} · ${conv.other_name}`,
    active: 'messages',
    noindex: true,
  });
}
