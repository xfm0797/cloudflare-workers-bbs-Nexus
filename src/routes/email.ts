import { get, post } from '../router';
import { canResend, consumeVerification, issueVerification } from '../lib/emailverify';
import { clusterRateLimit, rateLimit } from '../lib/utils';

/**
 * 邮箱验证链路
 *   GET  /verify-email?token=…        邮件里的验证链接
 *   POST /verify-email/resend         设置页「重新发送」
 */

get('/verify-email', async (ctx) => {
  const token = ctx.query.get('token') || '';
  if (!token) return ctx.redirect(ctx.user ? '/settings' : '/login', 'email.invalid', 'error');

  const result = await consumeVerification(ctx.env, token);
  const home = ctx.user ? '/settings' : '/login';

  if (result.ok) return ctx.redirect(home, 'email.verifiedOk');

  const key =
    result.error === 'expired'
      ? 'email.expired'
      : result.error === 'used'
        ? 'email.used'
        : result.error === 'email_changed'
          ? 'email.changed'
          : 'email.invalid';
  return ctx.redirect(home, key, 'error');
});

post('/verify-email/resend', async (ctx) => {
  if (!ctx.user) return ctx.redirect('/login?next=/settings');
  const user = ctx.user;

  if (user.email_verified) return ctx.redirect('/settings', 'email.alreadyVerified');
  if (!user.email) return ctx.redirect('/settings', 'email.noEmail', 'error');
  if (!(await canResend(ctx.env, user.id))) return ctx.redirect('/settings', 'email.cooldown', 'error');

  // 每人 3 封 / 10 分钟，避免被当成发信机
  let verdict: { ok: boolean; retryAfter: number };
  try {
    verdict = await clusterRateLimit(`verify-send:${user.id}`, 3, 600);
  } catch {
    verdict = rateLimit(`verify-send:${user.id}`, 3, 600_000);
  }
  if (!verdict.ok) return ctx.redirect('/settings', 'email.cooldown', 'error');

  const result = await issueVerification(ctx.env, user, ctx.url.origin, ctx.siteName);
  if (result.ok && result.sent) return ctx.redirect('/settings', 'email.sent');
  if (result.error === 'mail_not_configured') return ctx.redirect('/settings', 'email.notConfigured', 'error');
  return ctx.redirect('/settings', 'email.sendFailed', 'error');
});
