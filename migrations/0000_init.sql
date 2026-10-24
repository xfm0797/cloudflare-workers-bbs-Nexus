-- ===========================================================================
-- cf-bbs 初始化表结构（D1 / SQLite）—— 全量合并版
-- 新部署只需这一个迁移：基础表 + 邮箱验证 + FTS 全文索引 + 私信 + 审计/禁言
-- ===========================================================================

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL,
  email          TEXT,
  password_hash  TEXT,
  display_name   TEXT NOT NULL,
  avatar_url     TEXT,
  bio            TEXT,
  location       TEXT,
  website        TEXT,
  role           TEXT NOT NULL DEFAULT 'member',   -- member | moderator | admin
  status         TEXT NOT NULL DEFAULT 'active',   -- active | muted | banned
  locale         TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  token_version  INTEGER NOT NULL DEFAULT 1,
  topic_count    INTEGER NOT NULL DEFAULT 0,
  post_count     INTEGER NOT NULL DEFAULT 0,
  reputation     INTEGER NOT NULL DEFAULT 0,
  last_seen_at   INTEGER,
  muted_until    INTEGER,                          -- 禁言截止时间（NULL = 未禁言）
  created_at     INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_created ON users (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  username            TEXT,
  avatar_url          TEXT,
  created_at          INTEGER NOT NULL,
  UNIQUE (provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_accounts (user_id);

CREATE TABLE IF NOT EXISTS email_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  email      TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  purpose    TEXT NOT NULL DEFAULT 'verify',   -- verify | change
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_hash ON email_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS categories (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  name_en         TEXT,
  description     TEXT,
  description_en  TEXT,
  icon            TEXT,
  color           TEXT,
  position        INTEGER NOT NULL DEFAULT 0,
  topic_count     INTEGER NOT NULL DEFAULT 0,
  post_count      INTEGER NOT NULL DEFAULT 0,
  admin_only      INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS topics (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id    INTEGER NOT NULL REFERENCES categories(id),
  author_id      TEXT NOT NULL REFERENCES users(id),
  title          TEXT NOT NULL,
  slug           TEXT,
  excerpt        TEXT,
  tags           TEXT,
  is_pinned      INTEGER NOT NULL DEFAULT 0,
  is_locked      INTEGER NOT NULL DEFAULT 0,
  is_featured    INTEGER NOT NULL DEFAULT 0,
  is_deleted     INTEGER NOT NULL DEFAULT 0,
  views          INTEGER NOT NULL DEFAULT 0,
  reply_count    INTEGER NOT NULL DEFAULT 0,
  like_count     INTEGER NOT NULL DEFAULT 0,
  last_post_at   INTEGER NOT NULL,
  last_poster_id TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_topics_feed ON topics (is_deleted, is_pinned DESC, last_post_at DESC);
CREATE INDEX IF NOT EXISTS idx_topics_category ON topics (category_id, is_deleted, last_post_at DESC);
CREATE INDEX IF NOT EXISTS idx_topics_author ON topics (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topics_hot ON topics (is_deleted, last_post_at DESC, reply_count DESC);

CREATE TABLE IF NOT EXISTS posts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id        INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  author_id       TEXT NOT NULL REFERENCES users(id),
  content         TEXT NOT NULL,
  content_html    TEXT NOT NULL,
  reply_to_post_id INTEGER,
  position        INTEGER NOT NULL,
  is_deleted      INTEGER NOT NULL DEFAULT 0,
  like_count      INTEGER NOT NULL DEFAULT 0,
  edited_at       INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_topic ON posts (topic_id, position);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS likes (
  user_id     TEXT NOT NULL,
  target_type TEXT NOT NULL,          -- topic | post
  target_id   INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_target ON likes (target_type, target_id);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id    TEXT NOT NULL,
  topic_id   INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, topic_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  actor_id   TEXT,
  type       TEXT NOT NULL,           -- reply | mention | like | system
  topic_id   INTEGER,
  post_id    INTEGER,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL,          -- topic | post | user
  target_id   INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  detail      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | resolved | dismissed
  created_at  INTEGER NOT NULL,
  resolved_by TEXT,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 私信：每对用户一条会话（user_a_id 存字典序较小的 id）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a_id TEXT NOT NULL,
  user_b_id TEXT NOT NULL,
  last_message_at INTEGER NOT NULL,
  last_message_preview TEXT NOT NULL DEFAULT '',
  a_unread INTEGER NOT NULL DEFAULT 0,
  b_unread INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_a_id, user_b_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  body_html TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_conv_a ON conversations (user_a_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_b ON conversations (user_b_id, last_message_at DESC);

-- ---------------------------------------------------------------------------
-- 审计日志：版务与管理操作自动留痕
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- FTS5 全文索引
--
-- 1. trigram 分词器：中英文都按子串匹配（< 3 字符查询由应用层回退 LIKE）；
-- 2. rowid 约定：主题 = topics.id * 2，回复 = posts.id * 2 + 1；
-- 3. kind / topic_id / ref_id 用 UNINDEXED 存在索引表里，bm25 只对 title / body 加权。
-- ---------------------------------------------------------------------------

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  title,
  body,
  kind UNINDEXED,
  topic_id UNINDEXED,
  ref_id UNINDEXED,
  tokenize = 'trigram'
);

-- 主题：新增时入索引
CREATE TRIGGER IF NOT EXISTS topics_fts_ai AFTER INSERT ON topics BEGIN
  INSERT INTO search_index (rowid, title, body, kind, topic_id, ref_id)
  VALUES (
    new.id * 2,
    new.title,
    coalesce(new.excerpt, '') || ' ' || coalesce(new.tags, ''),
    'topic',
    new.id,
    new.id
  );
END;

-- 主题：内容变化 / 软删除 / 恢复时，整主题（含所有回复）重建索引
CREATE TRIGGER IF NOT EXISTS topics_fts_au AFTER UPDATE OF title, excerpt, tags, is_deleted ON topics BEGIN
  DELETE FROM search_index WHERE topic_id = new.id;
  INSERT INTO search_index (rowid, title, body, kind, topic_id, ref_id)
  SELECT
    new.id * 2,
    new.title,
    coalesce(new.excerpt, '') || ' ' || coalesce(new.tags, ''),
    'topic',
    new.id,
    new.id
  WHERE new.is_deleted = 0;
  INSERT INTO search_index (rowid, title, body, kind, topic_id, ref_id)
  SELECT p.id * 2 + 1, '', p.content, 'post', p.topic_id, p.id
  FROM posts p
  WHERE p.topic_id = new.id AND p.is_deleted = 0 AND new.is_deleted = 0;
END;

-- 主题：硬删除时清索引（后台帖子管理删除走这条路）
CREATE TRIGGER IF NOT EXISTS topics_fts_ad AFTER DELETE ON topics BEGIN
  DELETE FROM search_index WHERE topic_id = old.id;
END;

-- 回复：正文全文入索引
CREATE TRIGGER IF NOT EXISTS posts_fts_ai AFTER INSERT ON posts BEGIN
  INSERT INTO search_index (rowid, title, body, kind, topic_id, ref_id)
  VALUES (new.id * 2 + 1, '', new.content, 'post', new.topic_id, new.id);
END;

CREATE TRIGGER IF NOT EXISTS posts_fts_au AFTER UPDATE OF content, is_deleted, topic_id ON posts BEGIN
  DELETE FROM search_index WHERE rowid = new.id * 2 + 1;
  INSERT INTO search_index (rowid, title, body, kind, topic_id, ref_id)
  SELECT new.id * 2 + 1, '', new.content, 'post', new.topic_id, new.id
  WHERE new.is_deleted = 0;
END;

CREATE TRIGGER IF NOT EXISTS posts_fts_ad AFTER DELETE ON posts BEGIN
  DELETE FROM search_index WHERE rowid = old.id * 2 + 1;
END;
