-- ===========================================================================
-- 邮箱验证令牌（Resend 发信）
-- 只存 token 的 SHA-256 摘要，明文只出现在邮件链接里
-- ===========================================================================

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
