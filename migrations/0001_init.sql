-- ===========================================================================
-- cf-bbs 初始化表结构 (D1 / SQLite)
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
