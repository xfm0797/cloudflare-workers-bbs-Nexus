import type { Env } from '../env';

/**
 * 轻量级 bot / 爬虫防护。
 *
 * 目标：在不影响真实用户与搜索引擎收录的前提下，挡掉会消耗
 * Workers 请求数与 D1 读写额度的采集器、AI 训练爬虫与脚本扫描。
 * 这是「应用层」第一道闸；边缘层（Cloudflare Bot Fight Mode + 限流规则）
 * 见 README「防爬虫」一节。
 */

/** AI 训练 / 商业采集爬虫：一律拒绝，它们不带来流量，只消耗额度 */
const AI_AND_SEO_CRAWLERS =
  /(GPTBot|ChatGPT-User|OAI-SearchBot|CCBot|ClaudeBot|Claude-Web|anthropic-ai|Google-Extended|Bytespider|Amazonbot|Applebot-Extended|meta-externalagent|FacebookBot|PerplexityBot|YouBot|Diffbot|omgili|Timpibot|ImagesiftBot|cohere-ai|cohere-training|AhrefsBot|SemrushBot|MJ12bot|DotBot|Barkrowler|DataForSeoBot|MegaIndex|BLEXBot|SeznamBot|serpstatbot|Screaming Frog|SiteAuditBot|PetalBot|YisouSpider|Qwantify|Grapeshot|ZoominfoBot|Scrapy)/i;

/** 搜索引擎：放行（收录需要），但禁止其访问后台与 API */
const SEARCH_ENGINES =
  /(Googlebot|Google-InspectionTool|Storebot-Google|Bingbot|BingPreview|Baiduspider|YandexBot|DuckDuckBot|Sogou (web|inst|spider)|360Spider|HaosouSpider|Applebot|NaverBot|Yeti)/i;

/** 社交平台链接预览：放行（分享卡片依赖它） */
const SOCIAL_PREVIEW =
  /(Twitterbot|facebookexternalhit|TelegramBot|Discordbot|Slackbot|LinkedInBot|WhatsApp|Pinterestbot|redditbot|Mastodon|Embedly|SkypeUriPreview)/i;

/** 通用脚本 / 命令行客户端：论坛没有公开 API 场景，直接拒绝 */
const SCRIPT_CLIENTS =
  /(python-requests|python-urllib|aiohttp|httpx\/|curl\/|Wget\/|Go-http-client|go-http-client|Java\/|okhttp|libwww-perl|HTTPClient|node-fetch|axios\/|undici|Deno\/|scrapy|PhantomJS|HeadlessChrome|puppeteer|playwright|Selenium|masscan|Nmap|sqlmap|Nikto|zgrab|nuclei|ffuf|wfuzz|gobuster|dirbuster|WPScan|Censys|Shodan)/i;

/** 典型漏洞扫描路径：命中即拒，且不触发任何数据库查询 */
const SCAN_PATHS =
  /^\/(wp-admin|wp-login\.php|wp-content|wp-includes|wp-json|xmlrpc\.php|\.env|\.git|\.svn|\.hg|phpmyadmin|pma|myadmin|admin\.php|administrator|config\.(json|php|ya?ml|xml)|actuator|solr|jmx-console|web-console|console|vendor\/|\.aws|\.ssh|backup|bak|db\.sql|dump\.sql|database\.sql|\.DS_Store|HNAP1|cgi-bin|owa|autodiscover|ecp|\.well-known\/security\.txt|server-status|telescope|_ignition|\.idea|\.vscode)/i;

const BOT_HEADERS: Record<string, string> = {
  'content-type': 'text/plain; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
};

function deny(reason: string, status = 403, message = 'Forbidden'): Response {
  return new Response(message, { status, headers: { ...BOT_HEADERS, 'x-bot-guard': reason } });
}

export interface GuardDecision {
  blocked: boolean;
  reason?: string;
  /** 是否已通过搜索引擎 / 社交预览验证（用于放宽限流） */
  trustedBot?: boolean;
}

/**
 * 纯判定函数，不产生副作用，方便单测与在 index.ts 里复用。
 */
export function inspectRequest(req: Request, env: Env): GuardDecision {
  // 允许用 BOT_GUARD=off 临时关闭（例如接入监控探针时）
  if ((env.BOT_GUARD || '').toLowerCase() === 'off') return { blocked: false };

  const url = new URL(req.url);
  const path = url.pathname;

  if (SCAN_PATHS.test(path)) return { blocked: true, reason: 'scan-path' };

  // 健康检查允许空 UA（监控系统常用）；robots / sitemap / feed 对所有 UA 开放，
  // 既不查库，也让守规矩的爬虫能读到我们的规则。
  if (path === '/healthz') return { blocked: false };
  if (path === '/robots.txt' || path === '/sitemap.xml' || path === '/feed.xml') {
    return { blocked: false, trustedBot: true };
  }

  const ua = (req.headers.get('user-agent') || '').trim();
  if (!ua) return { blocked: true, reason: 'no-ua' };

  if (SEARCH_ENGINES.test(ua)) {
    // 搜索引擎不得进入后台 / API / 搜索页（防止被当成内容抓取入口）
    if (path.startsWith('/admin') || path.startsWith('/api/') || path.startsWith('/search')) {
      return { blocked: true, reason: 'search-bot-offlimits' };
    }
    return { blocked: false, trustedBot: true };
  }

  if (SOCIAL_PREVIEW.test(ua)) {
    if (path.startsWith('/admin') || path.startsWith('/api/')) {
      return { blocked: true, reason: 'social-bot-offlimits' };
    }
    return { blocked: false, trustedBot: true };
  }

  if (AI_AND_SEO_CRAWLERS.test(ua)) return { blocked: true, reason: 'ai-crawler' };
  if (SCRIPT_CLIENTS.test(ua)) return { blocked: true, reason: 'script-client' };

  return { blocked: false };
}

/**
 * 直接返回响应（命中拦截时）或 null（放行）。
 */
export function guardRequest(req: Request, env: Env): Response | null {
  const decision = inspectRequest(req, env);
  if (!decision.blocked) return null;
  return deny(decision.reason || 'blocked');
}

/** 429：给匿名突发流量降速时使用，附带 Retry-After */
export function tooManyRequests(retryAfter: number): Response {
  return new Response('Too Many Requests', {
    status: 429,
    headers: {
      ...BOT_HEADERS,
      'retry-after': String(Math.max(1, retryAfter)),
      'x-bot-guard': 'rate-limit',
    },
  });
}
