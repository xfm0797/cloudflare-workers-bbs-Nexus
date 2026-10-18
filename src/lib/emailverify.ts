import type { Env } from '../env';
import type { User } from './types';
import { randomToken, uuid } from './utils';
import { mailConfigured, sendMail, verificationMail } from './mail';
import type { Locale } from './i18n';

/** 验证链接有效期：24 小时 */
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

/** 重发间隔：同账号 60 秒内只发一次（路由层还会做 3 次/10 分钟限流） */
export const RESEND_COOLDOWN_MS = 60 * 1000;

export function verificationRequired(env: Env): boolean {
  return /^(1|true|yes|on)$/i.test((env.REQUIRE_EMAIL_VERIFICATION || '').trim());
}

/** 该用户是否因为未验证邮箱而被限制发言（发信未配置时不做拦截，避免把所有人锁死） */
export function needsEmailVerification(env: Env, user: User | null): boolean {
  return !!user && verificationRequired(env) && !user.email_verified && mailConfigured(env);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface IssueResult {
  ok: boolean;
  /** 邮件是否真的发出去了；未配置 Resend 时为 false */
  sent: boolean;
  /** 失败原因：no_email / mail_not_configured / send_failed / network / rate_limited */
  error?: string;
  url: string;
  /** 仅在未配置发信时返回，方便本地调试 */
  devToken?: string;
}

/**
 * 签发验证令牌并发信。
 * @param origin 站点 origin，用于拼接验证链接（优先使用 env.SITE_URL）
 */
export async function issueVerification(
  env: Env,
  user: Pick<User, 'id' | 'email' | 'username' | 'display_name' | 'locale'>,
  origin: string,
  siteName: string,
): Promise<IssueResult> {
  const email = (user.email || '').trim().toLowerCase();
  if (!email) return { ok: false, sent: false, error: 'no_email', url: '' };

  const base = (env.SITE_URL || origin || '').replace(/\/+$/, '');
  const now = Date.now();
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const url = `${base}/verify-email?token=${encodeURIComponent(token)}`;

  // 旧令牌作废，避免多封邮件里的链接同时可用
  await env.DB.prepare(
    "UPDATE email_tokens SET used_at = ? WHERE user_id = ? AND purpose = 'verify' AND used_at IS NULL",
  )
    .bind(now, user.id)
    .run();

  await env.DB.prepare(
    'INSERT INTO email_tokens (id, user_id, email, token_hash, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(uuid(), user.id, email, tokenHash, 'verify', now + VERIFY_TTL_MS, now)
    .run();

  if (!mailConfigured(env)) {
    console.warn('[email] Resend 未配置，验证链接：', url);
    return { ok: true, sent: false, error: 'mail_not_configured', url, devToken: token };
  }

  const locale = (user.locale === 'en-US' ? 'en-US' : 'zh-CN') as Locale;
  const mail = verificationMail({ siteName, url, email, locale });
  const result = await sendMail(env, { to: email, subject: mail.subject, html: mail.html, text: mail.text });

  if (!result.ok) {
    console.error('[email] 验证邮件发送失败：', result.error, result.status);
    return { ok: false, sent: false, error: result.error || 'send_failed', url };
  }
  return { ok: true, sent: true, url };
}

export interface ConsumeResult {
  ok: boolean;
  error?: 'invalid' | 'expired' | 'used' | 'email_changed' | 'no_email';
  userId?: string;
  email?: string;
}

/** 消费验证令牌：成功即把用户标记为已验证 */
export async function consumeVerification(env: Env, rawToken: string): Promise<ConsumeResult> {
  const token = (rawToken || '').trim();
  if (!token || token.length > 200) return { ok: false, error: 'invalid' };

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    "SELECT id, user_id, email, expires_at, used_at FROM email_tokens WHERE token_hash = ? AND purpose = 'verify'",
  )
    .bind(tokenHash)
    .first<{ id: string; user_id: string; email: string; expires_at: number; used_at: number | null }>();

  if (!row) return { ok: false, error: 'invalid' };
  if (row.used_at) return { ok: false, error: 'used' };
  if (row.expires_at < Date.now()) return { ok: false, error: 'expired' };

  const user = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?')
    .bind(row.user_id)
    .first<{ id: string; email: string | null }>();
  if (!user) return { ok: false, error: 'invalid' };
  if ((user.email || '').toLowerCase() !== row.email.toLowerCase()) {
    // 令牌签发后用户又改过邮箱，旧链接作废
    return { ok: false, error: 'email_changed' };
  }

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE email_tokens SET used_at = ? WHERE id = ?').bind(now, row.id),
    env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(row.user_id),
  ]);

  return { ok: true, userId: row.user_id, email: row.email };
}

/** 是否允许立刻重发（避免连点） */
export async function canResend(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT created_at FROM email_tokens WHERE user_id = ? AND purpose = 'verify' ORDER BY created_at DESC LIMIT 1",
  )
    .bind(userId)
    .first<{ created_at: number }>();
  return !row || Date.now() - row.created_at > RESEND_COOLDOWN_MS;
}

/** 供设置页展示：最近一次发信时间 */
export async function lastVerificationSentAt(env: Env, userId: string): Promise<number | null> {
  const row = await env.DB.prepare(
    "SELECT created_at FROM email_tokens WHERE user_id = ? AND purpose = 'verify' ORDER BY created_at DESC LIMIT 1",
  )
    .bind(userId)
    .first<{ created_at: number }>();
  return row?.created_at ?? null;
}
