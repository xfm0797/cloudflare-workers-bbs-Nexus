import type { Env } from '../env';
import { fromBase64Url } from './utils';

export interface OAuthProfile {
  providerId: string;
  name: string;
  username?: string;
  email?: string;
  emailVerified: boolean;
  avatar?: string;
}

export interface OAuthProvider {
  id: string;
  label: string;
  color: string;
  monogram: string;
  configured: (env: Env) => boolean;
  authorizeUrl: (env: Env, redirectUri: string, state: string) => Promise<string>;
  profile: (env: Env, code: string, redirectUri: string) => Promise<OAuthProfile>;
}

const TIMEOUT = 10_000;

function timeout(): AbortSignal {
  return AbortSignal.timeout(TIMEOUT);
}

async function postForm(url: string, params: Record<string, string>, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', ...headers },
    body: new URLSearchParams(params).toString(),
    signal: timeout(),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = Object.fromEntries(new URLSearchParams(text));
  }
  if (!res.ok || data?.error) {
    throw new Error(`oauth_token_error:${res.status}:${data?.error || text.slice(0, 120)}`);
  }
  return data;
}

async function getJson(url: string, token: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'user-agent': 'cf-bbs', ...headers },
    signal: timeout(),
  });
  if (!res.ok) throw new Error(`oauth_profile_error:${res.status}`);
  return res.json();
}

function tokenOf(data: any): string {
  const token = data?.access_token;
  if (!token || typeof token !== 'string') throw new Error('oauth_token_missing');
  return token;
}

/* ------------------------------------------------------------------ GitHub */

const github: OAuthProvider = {
  id: 'github',
  label: 'GitHub',
  color: '#24292f',
  monogram: 'GH',
  configured: (env) => !!env.GITHUB_CLIENT_ID && !!env.GITHUB_CLIENT_SECRET,
  authorizeUrl: async (env, redirectUri, state) => {
    const u = new URL('https://github.com/login/oauth/authorize');
    u.searchParams.set('client_id', env.GITHUB_CLIENT_ID!);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('scope', 'read:user user:email');
    u.searchParams.set('state', state);
    return u.toString();
  },
  profile: async (env, code, redirectUri) => {
    const data = await postForm('https://github.com/login/oauth/access_token', {
      client_id: env.GITHUB_CLIENT_ID!,
      client_secret: env.GITHUB_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
    });
    const token = tokenOf(data);
    const user = await getJson('https://api.github.com/user', token);
    let email: string | undefined;
    let verified = false;
    try {
      const emails = (await getJson('https://api.github.com/user/emails', token)) as any[];
      const primary = emails.find((e) => e.primary) || emails.find((e) => e.verified);
      if (primary) {
        email = primary.email;
        verified = !!primary.verified;
      }
    } catch {
      /* 无邮箱权限时忽略 */
    }
    return {
      providerId: String(user.id),
      name: user.name || user.login,
      username: user.login,
      email,
      emailVerified: verified,
      avatar: user.avatar_url,
    };
  },
};

/* ------------------------------------------------------------------ Google */

const google: OAuthProvider = {
  id: 'google',
  label: 'Google',
  color: '#ea4335',
  monogram: 'G',
  configured: (env) => !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET,
  authorizeUrl: async (env, redirectUri, state) => {
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('client_id', env.GOOGLE_CLIENT_ID!);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', 'openid email profile');
    u.searchParams.set('state', state);
    u.searchParams.set('prompt', 'select_account');
    return u.toString();
  },
  profile: async (env, code, redirectUri) => {
    const data = await postForm('https://oauth2.googleapis.com/token', {
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    const token = tokenOf(data);
    const user = await getJson('https://www.googleapis.com/oauth2/v3/userinfo', token);
    return {
      providerId: String(user.sub),
      name: user.name || user.email,
      username: user.email ? String(user.email).split('@')[0] : undefined,
      email: user.email,
      emailVerified: !!user.email_verified,
      avatar: user.picture,
    };
  },
};

/* ------------------------------------------------------------------ GitLab */

const gitlab: OAuthProvider = {
  id: 'gitlab',
  label: 'GitLab',
  color: '#fc6d26',
  monogram: 'GL',
  configured: (env) => !!env.GITLAB_CLIENT_ID && !!env.GITLAB_CLIENT_SECRET,
  authorizeUrl: async (env, redirectUri, state) => {
    const u = new URL('https://gitlab.com/oauth/authorize');
    u.searchParams.set('client_id', env.GITLAB_CLIENT_ID!);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', 'read_user');
    u.searchParams.set('state', state);
    return u.toString();
  },
  profile: async (env, code, redirectUri) => {
    const data = await postForm('https://gitlab.com/oauth/token', {
      client_id: env.GITLAB_CLIENT_ID!,
      client_secret: env.GITLAB_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    const token = tokenOf(data);
    const user = await getJson('https://gitlab.com/api/v4/user', token);
    return {
      providerId: String(user.id),
      name: user.name || user.username,
      username: user.username,
      email: user.email,
      emailVerified: !!user.email,
      avatar: user.avatar_url,
    };
  },
};

/* ------------------------------------------------------------------ Gitee */

const gitee: OAuthProvider = {
  id: 'gitee',
  label: 'Gitee',
  color: '#c71d23',
  monogram: 'GE',
  configured: (env) => !!env.GITEE_CLIENT_ID && !!env.GITEE_CLIENT_SECRET,
  authorizeUrl: async (env, redirectUri, state) => {
    const u = new URL('https://gitee.com/oauth/authorize');
    u.searchParams.set('client_id', env.GITEE_CLIENT_ID!);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', 'user_info');
    u.searchParams.set('state', state);
    return u.toString();
  },
  profile: async (env, code, redirectUri) => {
    const data = await postForm('https://gitee.com/oauth/token', {
      client_id: env.GITEE_CLIENT_ID!,
      client_secret: env.GITEE_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    const token = tokenOf(data);
    const user = await getJson(`https://gitee.com/api/v5/user?access_token=${encodeURIComponent(token)}`, token);
    return {
      providerId: String(user.id),
      name: user.name || user.login,
      username: user.login,
      email: user.email,
      emailVerified: false,
      avatar: user.avatar_url,
    };
  },
};

/* ------------------------------------------------------------------ Discord */

const discord: OAuthProvider = {
  id: 'discord',
  label: 'Discord',
  color: '#5865f2',
  monogram: 'DC',
  configured: (env) => !!env.DISCORD_CLIENT_ID && !!env.DISCORD_CLIENT_SECRET,
  authorizeUrl: async (env, redirectUri, state) => {
    const u = new URL('https://discord.com/oauth2/authorize');
    u.searchParams.set('client_id', env.DISCORD_CLIENT_ID!);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', 'identify email');
    u.searchParams.set('state', state);
    return u.toString();
  },
  profile: async (env, code, redirectUri) => {
    const data = await postForm('https://discord.com/api/oauth2/token', {
      client_id: env.DISCORD_CLIENT_ID!,
      client_secret: env.DISCORD_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    const token = tokenOf(data);
    const user = await getJson('https://discord.com/api/users/@me', token);
    return {
      providerId: String(user.id),
      name: user.global_name || user.username,
      username: user.username,
      email: user.email,
      emailVerified: !!user.verified,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : undefined,
    };
  },
};

/* ------------------------------------------------------------------ 通用 OIDC */

interface OidcConfig {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  issuer: string;
}

const oidcCache = new Map<string, OidcConfig>();

async function discover(issuer: string): Promise<OidcConfig> {
  const cached = oidcCache.get(issuer);
  if (cached) return cached;
  const url = issuer.replace(/\/$/, '') + '/.well-known/openid-configuration';
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: timeout() });
  if (!res.ok) throw new Error(`oidc_discovery_failed:${res.status}`);
  const cfg = (await res.json()) as OidcConfig;
  if (!cfg.authorization_endpoint || !cfg.token_endpoint) throw new Error('oidc_discovery_invalid');
  oidcCache.set(issuer, cfg);
  return cfg;
}

function decodeJwtPayload(token: string): any {
  try {
    const part = token.split('.')[1];
    return JSON.parse(new TextDecoder().decode(fromBase64Url(part)));
  } catch {
    return {};
  }
}

const oidc: OAuthProvider = {
  id: 'oidc',
  label: 'SSO',
  color: '#0ea5e9',
  monogram: 'SSO',
  configured: (env) => !!env.OIDC_ISSUER && !!env.OIDC_CLIENT_ID && !!env.OIDC_CLIENT_SECRET,
  authorizeUrl: async (env, redirectUri, state) => {
    const cfg = await discover(env.OIDC_ISSUER!);
    const u = new URL(cfg.authorization_endpoint);
    u.searchParams.set('client_id', env.OIDC_CLIENT_ID!);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', 'openid email profile');
    u.searchParams.set('state', state);
    return u.toString();
  },
  profile: async (env, code, redirectUri) => {
    const cfg = await discover(env.OIDC_ISSUER!);
    const data = await postForm(cfg.token_endpoint, {
      client_id: env.OIDC_CLIENT_ID!,
      client_secret: env.OIDC_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    const token = tokenOf(data);
    let user: any = {};
    if (cfg.userinfo_endpoint) {
      try {
        user = await getJson(cfg.userinfo_endpoint, token);
      } catch {
        user = {};
      }
    }
    if (!user.sub && data.id_token) user = { ...decodeJwtPayload(data.id_token), ...user };
    return {
      providerId: String(user.sub || user.preferred_username || user.email),
      name: user.name || user.preferred_username || user.email || 'SSO User',
      username: user.preferred_username || (user.email ? String(user.email).split('@')[0] : undefined),
      email: user.email,
      emailVerified: user.email_verified === true,
      avatar: user.picture,
    };
  },
};

/* ------------------------------------------------------------------ 注册表 */

export const PROVIDERS: OAuthProvider[] = [github, google, gitlab, gitee, discord, oidc];

export function getProvider(env: Env, id: string): OAuthProvider | null {
  const p = PROVIDERS.find((x) => x.id === id);
  return p && p.configured(env) ? p : null;
}

export function enabledProviders(env: Env): OAuthProvider[] {
  return PROVIDERS.filter((p) => p.configured(env)).map((p) => ({
    ...p,
    label: p.id === 'oidc' ? env.OIDC_NAME || 'SSO' : p.label,
  }));
}

export function providerLabel(env: Env, id: string): string {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) return id;
  return p.id === 'oidc' ? env.OIDC_NAME || 'SSO' : p.label;
}
