#!/usr/bin/env node
/**
 * 一键配置 Cloudflare 边缘防护（幂等，可反复执行）
 *
 *   CLOUDFLARE_API_TOKEN=xxx node scripts/edge-guard.mjs
 *   CLOUDFLARE_API_TOKEN=xxx node scripts/edge-guard.mjs --zone lovou.pw --limit 60 --window 10
 *
 * Token 需要权限：Zone → Zone WAF:Edit、Bot Management:Edit、Zone:Read
 *
 * 会写入三样东西：
 *   1. Bot Fight Mode（含 JS Detections）+ AI 爬虫阻断
 *   2. WAF 自定义规则：扫描路径 / 脚本客户端 / AI 训练爬虫 → Block，空 UA → 托管质询
 *   3. 限流规则：同机房同 IP 10 秒 60 次 → 429
 *
 * 这些规则在 Cloudflare 边缘执行，命中后请求不会进入 Worker，不消耗调用额度。
 */
const API = 'https://api.cloudflare.com/client/v4';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const LIMIT = Number(arg('limit', '60'));
const WINDOW = Number(arg('window', '10'));
const MITIGATION = Number(arg('mitigation', String(WINDOW)));

if (!TOKEN) {
  console.error('缺少 CLOUDFLARE_API_TOKEN 环境变量');
  process.exit(1);
}

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};
const ok = (m) => console.log(`  ${c.green('✓')} ${m}`);
const warn = (m) => console.log(`  ${c.yellow('!')} ${m}`);

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const detail = (json.errors || []).map((e) => `${e.code} ${e.message}`).join('; ');
    throw new Error(`${method} ${path} → ${res.status} ${detail || ''}`);
  }
  return json.result;
}

/** 解析 zone：--zone / CF_ZONE_ID / 从 wrangler.toml 的 routes 推断 */
async function resolveZone() {
  const explicitId = arg('zone-id', process.env.CF_ZONE_ID);
  if (explicitId) {
    const z = await api('GET', `/zones/${explicitId}`);
    return { id: z.id, name: z.name };
  }
  let name = arg('zone', process.env.CF_ZONE_NAME);
  if (!name) {
    const { readFileSync } = await import('node:fs');
    const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
    const m = toml.match(/pattern\s*=\s*"([^"]+)"/);
    if (m) {
      const parts = m[1].split('.');
      name = parts.slice(-2).join('.');
      // 常见多段公共后缀
      if (['eu.org', 'com.cn', 'net.cn', 'org.cn', 'github.io'].includes(parts.slice(-2).join('.'))) {
        name = parts.slice(-3).join('.');
      }
    }
  }
  if (!name) throw new Error('无法确定 zone，请用 --zone <域名> 指定');
  const zones = await api('GET', `/zones?name=${encodeURIComponent(name)}`);
  if (!zones.length) throw new Error(`账号下找不到域名 ${name}`);
  return { id: zones[0].id, name: zones[0].name };
}

const RULES = () => [
  {
    action: 'block',
    description: 'Block vulnerability scan paths',
    enabled: true,
    expression:
      '(lower(http.request.uri.path) contains "/wp-" or lower(http.request.uri.path) contains "/.env" or ' +
      'lower(http.request.uri.path) contains "/.git" or lower(http.request.uri.path) contains "phpmyadmin" or ' +
      'lower(http.request.uri.path) contains "/xmlrpc.php" or lower(http.request.uri.path) contains "/actuator" or ' +
      'lower(http.request.uri.path) contains "/.aws" or lower(http.request.uri.path) contains "/vendor/" or ' +
      'lower(http.request.uri.path) contains "/config.json" or lower(http.request.uri.path) contains "/server-status")',
  },
  {
    action: 'block',
    description: 'Block script clients and scanners',
    enabled: true,
    expression:
      '(http.user_agent contains "curl/" or http.user_agent contains "python-requests" or ' +
      'http.user_agent contains "Python-urllib" or http.user_agent contains "Go-http-client" or ' +
      'http.user_agent contains "Scrapy" or http.user_agent contains "sqlmap" or http.user_agent contains "nuclei" or ' +
      'http.user_agent contains "masscan" or http.user_agent contains "zgrab" or http.user_agent contains "Nikto" or ' +
      'http.user_agent contains "Wget")',
  },
  {
    action: 'block',
    description: 'Block AI training crawlers',
    enabled: true,
    expression:
      '(http.user_agent contains "GPTBot" or http.user_agent contains "CCBot" or http.user_agent contains "ClaudeBot" or ' +
      'http.user_agent contains "anthropic-ai" or http.user_agent contains "Bytespider" or http.user_agent contains "ImagesiftBot" or ' +
      'http.user_agent contains "PerplexityBot" or http.user_agent contains "Google-Extended" or ' +
      'http.user_agent contains "Applebot-Extended" or http.user_agent contains "cohere-ai" or ' +
      'http.user_agent contains "Meta-ExternalAgent")',
  },
  {
    action: 'managed_challenge',
    description: 'Challenge empty user agents',
    enabled: true,
    expression: '(http.user_agent eq "")',
  },
];

console.log(c.bold('\nCloudflare 边缘防护配置'));
const zone = await resolveZone();
console.log(`  ${c.bold('域名')} ${zone.name} ${c.dim(`(${zone.id})`)}`);

/* 1. Bot Fight Mode + AI 爬虫阻断 ------------------------------------------ */
console.log(`\n${c.cyan('▶')} Bot Fight Mode`);
try {
  const bm = await api('PUT', `/zones/${zone.id}/bot_management`, {
    fight_mode: true,
    enable_js: true,
    ai_bots_protection: 'block',
  });
  ok(`fight_mode=${bm.fight_mode} · enable_js=${bm.enable_js} · ai_bots_protection=${bm.ai_bots_protection}`);
} catch (err) {
  warn(`未能开启（可能当前套餐不支持）：${err.message}`);
}

/* 2. WAF 自定义规则 -------------------------------------------------------- */
console.log(`\n${c.cyan('▶')} WAF 自定义规则`);
try {
  const rs = await api('PUT', `/zones/${zone.id}/rulesets/phases/http_request_firewall_custom/entrypoint`, {
    name: 'cf-bbs guard',
    description: 'Block scanners, script clients and AI crawlers at the edge',
    rules: RULES(),
  });
  for (const r of rs.rules || []) ok(`${r.action.padEnd(17)} ${r.description}`);
} catch (err) {
  warn(`写入失败（免费版最多 5 条自定义规则）：${err.message}`);
}

/* 3. 限流规则 -------------------------------------------------------------- */
console.log(`\n${c.cyan('▶')} 限流规则`);
try {
  const rs = await api('PUT', `/zones/${zone.id}/rulesets/phases/http_ratelimit/entrypoint`, {
    name: 'cf-bbs rate limit',
    description: 'Protect Worker free-tier quota from request floods',
    rules: [
      {
        action: 'block',
        description: `Block an IP that exceeds ${LIMIT} requests per ${WINDOW}s`,
        enabled: true,
        expression: '(not http.request.uri.path in {"/app.css" "/app.js" "/favicon.svg"})',
        action_parameters: {
          response: {
            status_code: 429,
            content_type: 'text/plain',
            content: 'Too Many Requests - slow down.',
          },
        },
        ratelimit: {
          // 免费版只能在机房维度计数，故带上 cf.colo.id
          characteristics: ['cf.colo.id', 'ip.src'],
          period: WINDOW,
          requests_per_period: LIMIT,
          mitigation_timeout: MITIGATION,
        },
      },
    ],
  });
  for (const r of rs.rules || []) ok(`${r.action} ${r.ratelimit?.requests_per_period}/${r.ratelimit?.period}s → ${r.action_parameters?.response?.status_code || 'block'}`);
} catch (err) {
  warn(`写入失败（免费版仅 1 条限流规则）：${err.message}`);
}

console.log(`\n${c.green(c.bold('配置完成'))}`);
console.log(c.dim('  验证：浏览器访问应 200；curl / GPTBot 应 403；短时高频应 429。'));
console.log('');
