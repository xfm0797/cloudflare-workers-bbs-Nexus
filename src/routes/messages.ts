import { get, post } from '../router';
import {
  getConversation,
  getOrCreateConversation,
  getUserByUsername,
  listConversations,
  markConversationRead,
  sendMessage,
} from '../lib/db';
import { conversationPage, messagesPage } from '../views/messages';
import { errorPage } from '../views/pages';
import { isMuted } from '../lib/db';

const PER_PAGE = 50;

/* ------------------------------------------------------------------ 会话列表 */

get('/messages', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login?next=/messages');
  const conversations = await listConversations(ctx.env, ctx.user.id);
  return ctx.html(messagesPage(ctx, conversations));
});

/** 按用户名发起会话：GET 时展示详情前先解析用户（供用户主页"发私信"按钮直接链接） */
get('/messages/new/:username', async (ctx) => {
  if (!ctx.user) return ctx.redirect(`/login?next=/messages/new/${encodeURIComponent(ctx.params.username)}`);
  const peer = await getUserByUsername(ctx.env, ctx.params.username);
  if (!peer) return ctx.html(errorPage(ctx, 404, ctx.t('dm.userNotFound')), 404);
  if (peer.id === ctx.user.id) return ctx.redirect('/messages', 'dm.self', 'error');
  if (peer.status === 'banned') return ctx.redirect('/messages', 'dm.banned', 'error');
  const id = await getOrCreateConversation(ctx.env, ctx.user.id, peer.id);
  return ctx.redirect(`/messages/${id}`);
});

/* ------------------------------------------------------------------ 会话详情 */

get('/messages/:id', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login?next=/messages');
  const id = Number(ctx.params.id);
  if (!Number.isFinite(id)) return ctx.html(errorPage(ctx, 404, ctx.t('dm.notFound')), 404);

  const conv = await getConversation(ctx.env, id, ctx.user.id);
  if (!conv) return ctx.html(errorPage(ctx, 404, ctx.t('dm.notFound')), 404);

  const page = Math.max(1, Number(ctx.query.get('page')) || 1);
  // 简单分页：按 id 倒序取一页再正序展示
  const total = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND is_deleted = 0')
    .bind(id)
    .first<{ n: number }>();
  const totalPages = Math.max(1, Math.ceil((total?.n ?? 0) / PER_PAGE));
  const current = Math.min(page, totalPages);
  const offset = (current - 1) * PER_PAGE;

  const msgs = await ctx.env.DB.prepare(
    `SELECT m.*, u.username AS sender_username, u.display_name AS sender_name, u.avatar_url AS sender_avatar
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ? AND m.is_deleted = 0
     ORDER BY m.id ASC LIMIT ? OFFSET ?`,
  )
    .bind(id, PER_PAGE, offset)
    .all<any>();

  await markConversationRead(ctx.env, conv, ctx.user.id);
  return ctx.html(conversationPage(ctx, conv, msgs.results ?? [], current, totalPages));
});

/** 发送消息 */
post('/messages/:id', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login');
  if (isMuted(ctx.user)) return ctx.redirect(`/messages/${ctx.params.id}`, 'user.muted', 'error');
  const id = Number(ctx.params.id);
  const body = String(ctx.form?.get('body') || '').trim().slice(0, 5000);
  if (!body) return ctx.redirect(`/messages/${ctx.params.id}`, 'dm.emptyBody', 'error');

  const conv = await getConversation(ctx.env, id, ctx.user.id);
  if (!conv) return ctx.html(errorPage(ctx, 404, ctx.t('dm.notFound')), 404);
  if (conv.other_id && (await getUserByUsername(ctx.env, conv.other_username))?.status === 'banned') {
    return ctx.redirect(`/messages/${id}`, 'dm.banned', 'error');
  }

  await sendMessage(ctx.env, id, ctx.user.id, body);
  return ctx.redirect(`/messages/${id}`);
});

/** 从用户名直接发私信（表单提交入口） */
post('/messages', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login?next=/messages');
  if (isMuted(ctx.user)) return ctx.redirect('/messages', 'user.muted', 'error');
  const username = String(ctx.form?.get('username') || '').trim();
  if (!username) return ctx.redirect('/messages', 'dm.userNotFound', 'error');
  const peer = await getUserByUsername(ctx.env, username);
  if (!peer) return ctx.redirect('/messages', 'dm.userNotFound', 'error');
  if (peer.id === ctx.user.id) return ctx.redirect('/messages', 'dm.self', 'error');
  if (peer.status === 'banned') return ctx.redirect('/messages', 'dm.banned', 'error');
  const id = await getOrCreateConversation(ctx.env, ctx.user.id, peer.id);
  return ctx.redirect(`/messages/${id}`);
});
