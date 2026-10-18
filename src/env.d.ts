/// <reference types="@cloudflare/workers-types" />

/** Workers 原生 Rate Limiting binding 的最小接口（避免依赖 workers-types 版本） */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  SITE_NAME?: string;
  SITE_TAGLINE?: string;
  SITE_URL?: string;
  ALLOW_REGISTRATION?: string;
  DEV_LOGIN?: string;
  PASSWORD_ITERATIONS?: string;
  /** 设为 off 可临时关闭应用层 bot 拦截（默认开启） */
  BOT_GUARD?: string;

  /** 外部图床：根地址（如 https://img.lovou.eu.org），与 IMGBED_AUTH_CODE 同时配置才会启用上传 */
  IMGBED_URL?: string;
  /** 外部图床认证码（secret，切勿写进 wrangler.toml 的 vars） */
  IMGBED_AUTH_CODE?: string;
  /** 可选：上传渠道 telegram / cfr2 / s3 */
  IMGBED_CHANNEL?: string;
  /** 可选：上传目录，如 img/bbs */
  IMGBED_FOLDER?: string;
  /** 可选：单张图片大小上限（MB），默认 8 */
  IMGBED_MAX_MB?: string;
  /** 可选：设为 1 让图床做服务端压缩（默认关闭，部分渠道压缩会失败） */
  IMGBED_COMPRESS?: string;
  /** 可选：设为 1 允许图床失败时自动切换渠道重试（默认关闭） */
  IMGBED_AUTO_RETRY?: string;

  /** Resend 发信：API Key 与发件人需同时配置才会真正发信 */
  RESEND_API_KEY?: string;
  /** 发件人，形如 `Nexus <noreply@example.com>`（域名需在 Resend 验证） */
  MAIL_FROM?: string;
  /** 可选：Reply-To 地址 */
  MAIL_REPLY_TO?: string;
  /** 设为 true 时未验证邮箱的用户不能发帖 / 回复 */
  REQUIRE_EMAIL_VERIFICATION?: string;

  /** Workers 原生限流 binding（wrangler.toml 的 [[ratelimits]]），本地未配置时回退到 Cache 计数 */
  RL_PAGE?: RateLimitBinding;
  RL_USER?: RateLimitBinding;
  RL_SEARCH?: RateLimitBinding;

  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITLAB_CLIENT_ID?: string;
  GITLAB_CLIENT_SECRET?: string;
  GITEE_CLIENT_ID?: string;
  GITEE_CLIENT_SECRET?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;

  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_NAME?: string;
}
