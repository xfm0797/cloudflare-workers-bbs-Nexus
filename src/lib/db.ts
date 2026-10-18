import type { Env } from '../env';
import type { Category, Post, Topic, User } from './types';
import type { TopicRow } from '../types';
import { excerptOf, slugify } from './utils';
import { renderMarkdown, extractMentions } from './markdown';

export async function first<T>(env: Env, sql: string, ...params: unknown[]): Promise<T | null> {
  return env.DB.prepare(sql).bind(...params).first<T>();
}

export async function all<T>(env: Env, sql: string, ...params: unknown[]): Promise<T[]> {
  const res = await env.DB.prepare(sql).bind(...params).all<T>();
  return res.results ?? [];
}

/* ------------------------------------------------------------------ 设置 */

export async function getSettings(env: Env): Promise<Record<string, string>> {
  const rows = await all<{ key: string; value: string }>(env, 'SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
    .bind(key, value)
    .run();
}

export async function hasUsers(env: Env): Promise<boolean> {
  const row = await first<{ n: number }>(env, 'SELECT COUNT(*) AS n FROM users');
  return (row?.n ?? 0) > 0;
}

export async function countUsers(env: Env): Promise<number> {
  const row = await first<{ n: number }>(env, 'SELECT COUNT(*) AS n FROM users');
  return row?.n ?? 0;
}

/* ------------------------------------------------------------------ 板块 */

export async function getCategories(env: Env): Promise<Category[]> {
  return all<Category>(env, 'SELECT * FROM categories ORDER BY position ASC, id ASC');
}

export async function getCategoryBySlug(env: Env, slug: string): Promise<Category | null> {
  return first<Category>(env, 'SELECT * FROM categories WHERE slug = ?', slug);
}

export async function getCategoryById(env: Env, id: number): Promise<Category | null> {
  return first<Category>(env, 'SELECT * FROM categories WHERE id = ?', id);
}

/* ------------------------------------------------------------------ 主题 */

export type TopicSort = 'latest' | 'hot' | 'unanswered' | 'oldest';

export interface ListTopicsOptions {
  categoryId?: number;
  authorId?: string;
  sort?: TopicSort;
  page?: number;
  perPage?: number;
  search?: string;
  includeDeleted?: boolean;
}

const TOPIC_SELECT = `
  SELECT t.*, c.slug AS category_slug, c.name AS category_name, c.name_en AS category_name_en, c.color AS category_color,
         u.username AS author_username, u.display_name AS author_name, u.avatar_url AS author_avatar,
         lu.username AS last_poster_username, lu.display_name AS last_poster_name, lu.avatar_url AS last_poster_avatar
  FROM topics t
  JOIN categories c ON c.id = t.category_id
  JOIN users u ON u.id = t.author_id
  LEFT JOIN users lu ON lu.id = t.last_poster_id
`;

function topicWhere(opts: ListTopicsOptions): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (!opts.includeDeleted) clauses.push('t.is_deleted = 0');
  if (opts.categoryId) {
    clauses.push('t.category_id = ?');
    params.push(opts.categoryId);
  }
  if (opts.authorId) {
    clauses.push('t.author_id = ?');
    params.push(opts.authorId);
  }
  if (opts.sort === 'unanswered') clauses.push('t.reply_count = 0');
  if (opts.search) {
    clauses.push('(t.title LIKE ? OR t.excerpt LIKE ?)');
    params.push(`%${opts.search}%`, `%${opts.search}%`);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export async function listTopics(
  env: Env,
  opts: ListTopicsOptions = {},
): Promise<{ topics: TopicRow[]; total: number; page: number; perPage: number; totalPages: number }> {
  const page = Math.max(1, opts.page || 1);
  const perPage = opts.perPage || 20;
  const where = topicWhere(opts);

  let order = 't.is_pinned DESC, t.last_post_at DESC';
  if (opts.sort === 'hot') {
    order = `t.is_pinned DESC, ((t.reply_count * 4 + t.like_count * 3 + t.views * 0.1) + 1) / (((? - t.last_post_at) / 86400000.0) + 2) DESC`;
  } else if (opts.sort === 'oldest') {
    order = 't.is_pinned DESC, t.created_at ASC';
  } else if (opts.sort === 'unanswered') {
    order = 't.created_at DESC';
  }

  const orderParams = opts.sort === 'hot' ? [Date.now()] : [];
  const topics = await all<TopicRow>(
    env,
    `${TOPIC_SELECT} ${where.sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ...where.params,
    ...orderParams,
    perPage,
    (page - 1) * perPage,
  );

  const countRow = await first<{ n: number }>(
    env,
    `SELECT COUNT(*) AS n FROM topics t ${where.sql}`,
    ...where.params,
  );
  const total = countRow?.n ?? 0;

  return { topics, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function getTopicRow(env: Env, id: number): Promise<TopicRow | null> {
  return first<TopicRow>(env, `${TOPIC_SELECT} WHERE t.id = ?`, id);
}

/** 按给定 id 顺序批量取主题（搜索结果需要保持相关度顺序） */
export async function getTopicsByIds(env: Env, ids: number[]): Promise<TopicRow[]> {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (!unique.length) return [];
  const placeholders = unique.map(() => '?').join(',');
  const rows = await all<TopicRow>(
    env,
    `${TOPIC_SELECT} WHERE t.id IN (${placeholders}) AND t.is_deleted = 0`,
    ...unique,
  );
  const map = new Map(rows.map((row) => [row.id, row]));
  return unique.map((id) => map.get(id)).filter((row): row is TopicRow => !!row);
}

export async function getTopic(env: Env, id: number): Promise<Topic | null> {
  return first<Topic>(env, 'SELECT * FROM topics WHERE id = ?', id);
}

export async function getTrendingTopics(env: Env, limit = 5): Promise<TopicRow[]> {
  const since = Date.now() - 7 * 86400000;
  return all<TopicRow>(
    env,
    `${TOPIC_SELECT} WHERE t.is_deleted = 0 AND t.last_post_at > ?
     ORDER BY (t.reply_count * 4 + t.like_count * 3 + t.views * 0.1) DESC, t.last_post_at DESC LIMIT ?`,
    since,
    limit,
  );
}

export async function incrementViews(env: Env, topicId: number): Promise<void> {
  await env.DB.prepare('UPDATE topics SET views = views + 1 WHERE id = ?').bind(topicId).run();
}

/* ------------------------------------------------------------------ 回复 */

export async function getPosts(
  env: Env,
  topicId: number,
  page: number,
  perPage: number,
  viewerId?: string | null,
  sort: 'asc' | 'desc' = 'asc',
): Promise<{ posts: any[]; total: number; totalPages: number }> {
  const offset = sort === 'desc' ? 0 : (page - 1) * perPage;
  const rows = await all<any>(
    env,
    `SELECT p.*, u.username AS author_username, u.display_name AS author_name, u.avatar_url AS author_avatar,
            u.role AS author_role, u.post_count AS author_post_count, u.created_at AS author_created_at, u.bio AS author_bio,
            ru.username AS reply_to_username,
            CASE WHEN ? = '' THEN 0 ELSE EXISTS(
              SELECT 1 FROM likes l WHERE l.user_id = ? AND l.target_type = 'post' AND l.target_id = p.id
            ) END AS liked
     FROM posts p
     JOIN users u ON u.id = p.author_id
     LEFT JOIN posts rp ON rp.id = p.reply_to_post_id
     LEFT JOIN users ru ON ru.id = rp.author_id
     WHERE p.topic_id = ? AND p.is_deleted = 0
     ORDER BY p.position ${sort === 'desc' ? 'DESC' : 'ASC'}
     LIMIT ? OFFSET ?`,
    viewerId ?? '',
    viewerId ?? '',
    topicId,
    perPage,
    offset,
  );
  const countRow = await first<{ n: number }>(
    env,
    'SELECT COUNT(*) AS n FROM posts WHERE topic_id = ? AND is_deleted = 0',
    topicId,
  );
  const total = countRow?.n ?? 0;
  return { posts: rows, total, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

/* ------------------------------------------------------------------ 写入 */

export async function createTopic(
  env: Env,
  input: { categoryId: number; authorId: string; title: string; content: string; tags: string[] },
): Promise<number> {
  const now = Date.now();
  const html = renderMarkdown(input.content);
  const res = await env.DB.prepare(
    `INSERT INTO topics (category_id, author_id, title, slug, excerpt, tags, last_post_at, last_poster_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.categoryId,
      input.authorId,
      input.title,
      slugify(input.title),
      excerptOf(input.content),
      input.tags.join(','),
      now,
      input.authorId,
      now,
      now,
    )
    .run();
  const topicId = Number(res.meta.last_row_id);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO posts (topic_id, author_id, content, content_html, position, created_at) VALUES (?, ?, ?, ?, 1, ?)`,
    ).bind(topicId, input.authorId, input.content, html, now),
    env.DB.prepare('UPDATE topics SET reply_count = 0 WHERE id = ?').bind(topicId),
    env.DB.prepare('UPDATE users SET topic_count = topic_count + 1, post_count = post_count + 1 WHERE id = ?').bind(input.authorId),
    env.DB.prepare('UPDATE categories SET topic_count = topic_count + 1, post_count = post_count + 1 WHERE id = ?').bind(
      input.categoryId,
    ),
  ]);

  return topicId;
}

export async function createPost(
  env: Env,
  input: { topicId: number; authorId: string; content: string; replyToPostId?: number | null },
): Promise<number> {
  const now = Date.now();
  const html = renderMarkdown(input.content);
  const res = await env.DB.prepare(
    `INSERT INTO posts (topic_id, author_id, content, content_html, reply_to_post_id, position, created_at)
     VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM posts WHERE topic_id = ?), ?)`,
  )
    .bind(input.topicId, input.authorId, input.content, html, input.replyToPostId ?? null, input.topicId, now)
    .run();
  const postId = Number(res.meta.last_row_id);

  const topic = await getTopic(env, input.topicId);
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE topics SET reply_count = reply_count + 1, last_post_at = ?, last_poster_id = ?, updated_at = ? WHERE id = ?',
    ).bind(now, input.authorId, now, input.topicId),
    env.DB.prepare('UPDATE users SET post_count = post_count + 1 WHERE id = ?').bind(input.authorId),
    env.DB.prepare('UPDATE categories SET post_count = post_count + 1 WHERE id = ?').bind(topic?.category_id ?? 0),
  ]);

  return postId;
}

export async function notify(
  env: Env,
  input: { userId: string; actorId: string; type: string; topicId?: number; postId?: number },
): Promise<void> {
  if (input.userId === input.actorId) return;
  await env.DB.prepare(
    'INSERT INTO notifications (user_id, actor_id, type, topic_id, post_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(input.userId, input.actorId, input.type, input.topicId ?? null, input.postId ?? null, Date.now())
    .run();
}

export async function notifyMentions(
  env: Env,
  content: string,
  actor: User,
  topicId: number,
  postId: number,
): Promise<void> {
  const names = extractMentions(content).filter((n) => n.toLowerCase() !== actor.username.toLowerCase());
  if (!names.length) return;
  const stmts = names.map((name) =>
    env.DB.prepare(
      `INSERT INTO notifications (user_id, actor_id, type, topic_id, post_id, created_at)
       SELECT id, ?, 'mention', ?, ?, ? FROM users WHERE lower(username) = lower(?) AND id != ?`,
    ).bind(actor.id, topicId, postId, Date.now(), name, actor.id),
  );
  await env.DB.batch(stmts);
}

export async function toggleLike(
  env: Env,
  userId: string,
  targetType: 'topic' | 'post',
  targetId: number,
): Promise<{ liked: boolean; count: number }> {
  const existing = await first<{ n: number }>(
    env,
    'SELECT COUNT(*) AS n FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?',
    userId,
    targetType,
    targetId,
  );
  const liked = (existing?.n ?? 0) > 0;
  const table = targetType === 'topic' ? 'topics' : 'posts';

  if (liked) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(
        userId,
        targetType,
        targetId,
      ),
      env.DB.prepare(`UPDATE ${table} SET like_count = MAX(like_count - 1, 0) WHERE id = ?`).bind(targetId),
    ]);
  } else {
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO likes (user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?)').bind(
        userId,
        targetType,
        targetId,
        Date.now(),
      ),
      env.DB.prepare(`UPDATE ${table} SET like_count = like_count + 1 WHERE id = ?`).bind(targetId),
    ]);
  }

  const row = await first<{ c: number }>(env, `SELECT like_count AS c FROM ${table} WHERE id = ?`, targetId);
  return { liked: !liked, count: row?.c ?? 0 };
}

export async function toggleBookmark(env: Env, userId: string, topicId: number): Promise<{ bookmarked: boolean }> {
  const existing = await first<{ n: number }>(
    env,
    'SELECT COUNT(*) AS n FROM bookmarks WHERE user_id = ? AND topic_id = ?',
    userId,
    topicId,
  );
  if ((existing?.n ?? 0) > 0) {
    await env.DB.prepare('DELETE FROM bookmarks WHERE user_id = ? AND topic_id = ?').bind(userId, topicId).run();
    return { bookmarked: false };
  }
  await env.DB.prepare('INSERT INTO bookmarks (user_id, topic_id, created_at) VALUES (?, ?, ?)')
    .bind(userId, topicId, Date.now())
    .run();
  return { bookmarked: true };
}

export async function isBookmarked(env: Env, userId: string | null, topicId: number): Promise<boolean> {
  if (!userId) return false;
  const row = await first<{ n: number }>(
    env,
    'SELECT COUNT(*) AS n FROM bookmarks WHERE user_id = ? AND topic_id = ?',
    userId,
    topicId,
  );
  return (row?.n ?? 0) > 0;
}

/* ------------------------------------------------------------------ 用户 */

export async function getUserByUsername(env: Env, username: string): Promise<User | null> {
  return first<User>(env, 'SELECT * FROM users WHERE lower(username) = lower(?)', username);
}

export async function getUserById(env: Env, id: string): Promise<User | null> {
  return first<User>(env, 'SELECT * FROM users WHERE id = ?', id);
}

export async function topMembers(env: Env, limit = 8): Promise<User[]> {
  return all<User>(
    env,
    `SELECT * FROM users WHERE status != 'banned'
     ORDER BY (topic_count * 3 + post_count) DESC, created_at ASC LIMIT ?`,
    limit,
  );
}

export async function stats(env: Env): Promise<{
  users: number;
  topics: number;
  posts: number;
  likes: number;
  online: number;
  newUsers: number;
}> {
  const row = await first<any>(
    env,
    `SELECT
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM topics WHERE is_deleted = 0) AS topics,
       (SELECT COUNT(*) FROM posts WHERE is_deleted = 0) AS posts,
       (SELECT COUNT(*) FROM likes) AS likes,
       (SELECT COUNT(*) FROM users WHERE last_seen_at > ?) AS online,
       (SELECT COUNT(*) FROM users WHERE created_at > ?) AS newUsers`,
    Date.now() - 5 * 60 * 1000,
    Date.now() - 7 * 86400000,
  );
  return { users: 0, topics: 0, posts: 0, likes: 0, online: 0, newUsers: 0, ...(row || {}) };
}

export async function onlineUsers(env: Env, limit = 6): Promise<User[]> {
  return all<User>(
    env,
    'SELECT * FROM users WHERE last_seen_at > ? ORDER BY last_seen_at DESC LIMIT ?',
    Date.now() - 5 * 60 * 1000,
    limit,
  );
}

export async function unreadNotifications(env: Env, userId: string): Promise<number> {
  const row = await first<{ n: number }>(
    env,
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0',
    userId,
  );
  return row?.n ?? 0;
}

export async function bookmarkedTopics(env: Env, userId: string, limit = 20): Promise<TopicRow[]> {
  return all<TopicRow>(
    env,
    `${TOPIC_SELECT} JOIN bookmarks b ON b.topic_id = t.id
     WHERE b.user_id = ? AND t.is_deleted = 0 ORDER BY b.created_at DESC LIMIT ?`,
    userId,
    limit,
  );
}

export async function likesReceived(env: Env, userId: string): Promise<number> {
  const row = await first<{ n: number }>(
    env,
    `SELECT COUNT(*) AS n FROM likes l JOIN posts p ON p.id = l.target_id AND l.target_type = 'post'
     WHERE p.author_id = ?`,
    userId,
  );
  return row?.n ?? 0;
}

export async function topicsRepliedBy(env: Env, userId: string, limit = 20): Promise<TopicRow[]> {
  return all<TopicRow>(
    env,
    `${TOPIC_SELECT}
     WHERE t.is_deleted = 0 AND EXISTS (
       SELECT 1 FROM posts p WHERE p.topic_id = t.id AND p.author_id = ? AND p.is_deleted = 0 AND p.position > 1
     )
     ORDER BY t.last_post_at DESC LIMIT ?`,
    userId,
    limit,
  );
}

export async function touchUser(env: Env, user: User): Promise<void> {
  if (user.last_seen_at && Date.now() - user.last_seen_at < 5 * 60 * 1000) return;
  await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(Date.now(), user.id).run();
}

export type { Category, Post, Topic, TopicRow, User };
