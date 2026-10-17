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
