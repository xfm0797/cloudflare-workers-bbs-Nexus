import type { Env } from '../env';

/**
 * 邮件发送：Resend（https://resend.com）
 *
 * 需要的环境变量：
 *   RESEND_API_KEY   必填，resend 后台创建
 *   MAIL_FROM        必填，形如 `Nexus <noreply@yourdomain.com>`，域名需在 Resend 验证
 *   MAIL_REPLY_TO    可选，回复地址
 *   SITE_URL         可选，邮件里的链接前缀（默认取请求 origin）
 *
 * 未配置时 mailConfigured() 返回 false，注册流程会跳过发信并只在日志里打印链接。
 */

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface MailResult {
  ok: boolean;
  id?: string;
  error?: string;
  status?: number;
}

export function mailConfigured(env: Env): boolean {
  return !!(env.RESEND_API_KEY || '').trim() && !!(env.MAIL_FROM || '').trim();
}

export async function sendMail(env: Env, opts: MailOptions): Promise<MailResult> {
  const key = (env.RESEND_API_KEY || '').trim();
  const from = (env.MAIL_FROM || '').trim();
  if (!key || !from) return { ok: false, error: 'mail_not_configured' };

  const payload: Record<string, unknown> = {
    from,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  };
  const replyTo = (opts.replyTo || env.MAIL_REPLY_TO || '').trim();
  if (replyTo) payload.reply_to = replyTo;

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(15_000) : undefined,
    });
  } catch (err) {
    console.error('resend_network_error', (err as Error)?.message || err);
    return { ok: false, error: 'network' };
  }

  const text = await res.text();
  if (!res.ok) {
    // 常见：401 key 无效、403 域名未验证、422 收件人非法、429 超配额
    console.error('resend_http_error', res.status, text.slice(0, 300));
    return { ok: false, error: res.status === 429 ? 'rate_limited' : 'send_failed', status: res.status };
  }

  try {
    const data = JSON.parse(text) as { id?: string };
    return { ok: true, id: data.id };
  } catch {
    return { ok: true };
  }
}

/** 验证邮件（中英双语，跟着用户语言走） */
export function verificationMail(input: {
  siteName: string;
  url: string;
  email: string;
  locale: 'zh-CN' | 'en-US';
}): { subject: string; html: string; text: string } {
  const { siteName, url, email, locale } = input;
  const zh = locale !== 'en-US';
  const subject = zh ? `验证你的邮箱 · ${siteName}` : `Verify your email · ${siteName}`;

  const title = zh ? '验证你的邮箱地址' : 'Verify your email address';
  const intro = zh
    ? `感谢注册 <strong>${escape(siteName)}</strong>。点击下面的按钮完成邮箱验证，链接 24 小时内有效。`
    : `Thanks for signing up for <strong>${escape(siteName)}</strong>. Click the button below to verify your email. The link expires in 24 hours.`;
  const button = zh ? '验证邮箱' : 'Verify email';
  const fallback = zh ? '按钮打不开？复制这个链接到浏览器：' : 'Button not working? Copy this link into your browser:';
  const ignore = zh
    ? '如果这不是你的操作，请忽略这封邮件，你的账号不会被激活。'
    : 'If you did not create this account, you can safely ignore this email.';
  const expiry = zh ? '此邮件由系统自动发送，请勿直接回复。' : 'This message was sent automatically. Please do not reply.';

  const html = `<!doctype html>
<html lang="${zh ? 'zh-CN' : 'en'}">
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e4e8ef;overflow:hidden;">
        <tr><td style="padding:28px 28px 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a94a3;">${escape(siteName)}</td></tr>
        <tr><td style="padding:0 28px;">
          <h1 style="margin:8px 0 12px;font-size:22px;line-height:1.3;color:#0f1319;">${title}</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#57606e;">${intro}</p>
          <p style="margin:0 0 24px;">
            <a href="${escapeAttr(url)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#4f46e5;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${button}</a>
          </p>
          <p style="margin:0 0 8px;font-size:12.5px;color:#8a94a3;">${fallback}</p>
          <p style="margin:0 0 24px;font-size:12.5px;line-height:1.6;word-break:break-all;color:#57606e;">${escape(url)}</p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.7;color:#8a94a3;">${ignore}</p>
        </td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #eef1f6;font-size:12px;color:#8a94a3;">${expiry}<br />${escape(email)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    title,
    '',
    zh ? `感谢注册 ${siteName}，点击下面的链接完成邮箱验证（24 小时内有效）：` : `Thanks for signing up for ${siteName}. Verify your email (valid for 24 hours):`,
    url,
    '',
    ignore,
    expiry,
  ].join('\n');

  return { subject, html, text };
}

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escape(value).replace(/'/g, '&#39;');
}
