import { get } from '../router';
import { createSessionCookie, signToken } from '../lib/auth';
import { getUserByUsername } from '../lib/db';
import { escapeHtml } from '../lib/utils';

/**
 * 仅限本地开发的辅助路由（.dev.vars 中设置 DEV_LOGIN=1 才生效，线上为 404）：
 *   /dev/login/:username          302 设置会话 Cookie（供 curl / 脚本调试）
 *   /dev/login/:username?js=1     返回一段设置 Cookie 的 HTML（供无头浏览器调试）
 */
get('/dev/login/:username', async (ctx) => {
  if (ctx.env.DEV_LOGIN !== '1') return ctx.html('Not Found', 404);

  const user = await getUserByUsername(ctx.env, ctx.params.username);
  if (!user) return ctx.html('user not found', 404);

  const secure = ctx.url.protocol === 'https:';
  const next = (ctx.query.get('next') || '/').startsWith('/') ? ctx.query.get('next') || '/' : '/';

  if (ctx.query.get('js') === '1') {
    const now = Math.floor(Date.now() / 1000);
    const token = await signToken(
      { uid: user.id, ver: user.token_version, typ: 'session', iat: now, exp: now + 60 * 60 * 24 * 30 },
      ctx.env.SESSION_SECRET,
    );
    const safeToken = escapeHtml(token);
    const safeNext = escapeHtml(next);
    return ctx.html(
      `<!doctype html><meta charset="utf-8"><script>document.cookie='bbs_sess='+encodeURIComponent('${safeToken}')+';path=/';location.replace('${safeNext}');</script>`,
    );
  }

  const cookie = await createSessionCookie(user, ctx.env.SESSION_SECRET, secure);
  return new Response(null, { status: 302, headers: { location: next, 'set-cookie': cookie, 'cache-control': 'no-store' } });
});
