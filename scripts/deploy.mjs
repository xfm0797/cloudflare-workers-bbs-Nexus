#!/usr/bin/env node
/**
 * 一键部署：检测环境 → 补全 D1 / 会话密钥 → 迁移 → 板块种子 → 发布 Worker → 健康检查
 *
 *   npm run ship               完整部署
 *   npm run ship -- --skip-seed      跳过板块种子
 *   npm run ship -- --skip-migrate   跳过数据库迁移
 *   npm run ship -- --dry-run        只打包校验，不真正发布
 *   npm run ship -- --yes            全程不询问（CI 用）
 *
 * 需要先 `npx wrangler login`（或设置 CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID）。
 * 零依赖，只用 Node 内置模块。
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const OPT = {
  skipMigrate: flag('skip-migrate'),
  skipSeed: flag('skip-seed'),
  dryRun: flag('dry-run'),
  rotateSecret: flag('rotate-secret'),
  yes: flag('yes') || !!process.env.CI,
};

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const WRANGLER_TOML = `${ROOT}wrangler.toml`;
const DB_NAME = 'cf-bbs';
const SECRET_NAME = 'SESSION_SECRET';

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

const steps = [];
let stepNo = 0;
function step(title) {
  stepNo += 1;
  const label = `[${stepNo}] ${title}`;
  steps.push(label);
  console.log(`\n${c.cyan('▶')} ${c.bold(label)}`);
}
function ok(msg) {
  console.log(`  ${c.green('✓')} ${msg}`);
}
function info(msg) {
  console.log(`  ${c.dim(msg)}`);
}
function warn(msg) {
  console.log(`  ${c.yellow('!')} ${msg}`);
}
function fail(msg) {
  console.log(`  ${c.red('✗')} ${msg}`);
}

/** 运行命令；capture=true 时返回输出而不是直接透传到终端 */
function run(cmd, args, { capture = false, input, allowFail = false } = {}) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: capture ? ['pipe', 'pipe', 'pipe'] : [input ? 'pipe' : 'inherit', 'inherit', 'inherit'],
    input,
    env: { ...process.env, CI: process.env.CI || (OPT.yes ? '1' : '') },
    shell: process.platform === 'win32',
  });
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  if (res.status !== 0 && !allowFail) {
    fail(`命令失败：${cmd} ${args.join(' ')}`);
    if (capture && out.trim()) console.log(c.out?.trim?.() || out.trim());
    process.exit(res.status || 1);
  }
  return { code: res.status ?? 1, out };
}

function wrangler(args, opts = {}) {
  return run('npx', ['wrangler', ...args], opts);
}

function readToml() {
  return readFileSync(WRANGLER_TOML, 'utf8');
}

function dbIdFromToml(toml) {
  const m = toml.match(/database_id\s*=\s*"([^"]+)"/);
  return m ? m[1] : '';
}

const PLACEHOLDER_ID = /^0{8}-0{4}-0{4}-0{4}-0{12}$/;

// ---------------------------------------------------------------------------

console.log(c.bold('\nNexus 一键部署'));
info(`工作目录 ${ROOT}`);
if (OPT.dryRun) warn('dry-run 模式：只做校验与打包，不会真正发布');

/* 1. 依赖 ------------------------------------------------------------------ */
step('检查依赖');
if (!existsSync(`${ROOT}node_modules`)) {
  info('未安装依赖，执行 npm install …');
  run('npm', ['install', '--no-audit', '--no-fund']);
}
ok('依赖就绪');

/* 2. 身份 ------------------------------------------------------------------ */
step('检查 Cloudflare 凭据');
const hasToken = !!process.env.CLOUDFLARE_API_TOKEN;
if (hasToken) {
  ok('使用环境变量 CLOUDFLARE_API_TOKEN');
} else {
  const who = wrangler(['whoami'], { capture: true, allowFail: true });
  if (!/logged in|Account Name|email/i.test(who.out) || /not authenticated|not logged in/i.test(who.out)) {
    fail('未登录 Cloudflare');
    info('请在项目目录执行：npx wrangler login');
    info('或设置 CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID 后重试。');
    process.exit(1);
  }
  const line = who.out.split('\n').find((l) => /@|Account Name/.test(l));
  ok(`已登录${line ? c.dim(`（${line.replace(/[│╭╰─]/g, '').trim()}）`) : ''}`);
}

/* 3. D1 数据库 ------------------------------------------------------------- */
step('准备 D1 数据库');
let toml = readToml();
let dbId = dbIdFromToml(toml);

if (PLACEHOLDER_ID.test(dbId) || !dbId) {
  info(`wrangler.toml 里 database_id 还是占位值，尝试创建 ${DB_NAME} …`);
  const created = wrangler(['d1', 'create', DB_NAME], { capture: true, allowFail: true });
  const idMatch = created.out.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (created.code !== 0 || !idMatch) {
    fail('创建 D1 失败，请手动执行 npx wrangler d1 create ' + DB_NAME);
    if (created.out.trim()) console.log(c.dim(created.out.trim()));
    process.exit(1);
  }
  dbId = idMatch[1];
  toml = toml.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${dbId}"`);
  writeFileSync(WRANGLER_TOML, toml, 'utf8');
  ok(`已创建数据库并写回 wrangler.toml：${dbId}`);
} else {
  ok(`使用已有数据库 ${c.dim(dbId)}`);
}

/* 4. 会话密钥 -------------------------------------------------------------- */
step('同步会话密钥');
if (OPT.dryRun) {
  info('dry-run 跳过');
} else {
  // 先向线上查询已有 secret。只有明确“不存在”时才生成；
  // 查询失败一律不动，避免误覆盖导致全员掉线。
  const list = wrangler(['secret', 'list'], { capture: true, allowFail: true });
  const raw = list.out;
  let known = 'unknown';
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try {
      const arr = JSON.parse(raw.slice(start, end + 1));
      if (Array.isArray(arr)) {
        known = arr.some((s) => s && s.name === SECRET_NAME) ? 'present' : 'missing';
      }
    } catch {
      /* 保持 unknown */
    }
  }
  if (process.env.SHIP_DEBUG) {
    console.error(`  ${c.dim(`[debug] secret list → code=${list.code} known=${known}`)}`);
    console.error(c.dim(raw.trim().slice(0, 200)));
  }

  if (OPT.rotateSecret) {
    const secret = randomBytes(48).toString('base64url');
    wrangler(['secret', 'put', SECRET_NAME], { capture: true, input: `${secret}\n` });
    ok(`已轮换 ${SECRET_NAME}（旧会话将全部失效）`);
  } else if (known === 'present') {
    ok(`${SECRET_NAME} 已存在，保持不变`);
  } else if (known === 'missing') {
    const secret = randomBytes(48).toString('base64url');
    wrangler(['secret', 'put', SECRET_NAME], { capture: true, input: `${secret}\n` });
    ok(`首次部署，已生成并写入 ${SECRET_NAME}（${secret.length} 字符）`);
  } else {
    warn(`无法确认 ${SECRET_NAME} 是否存在，已跳过以免覆盖线上密钥`);
    info(`如确需设置：npx wrangler secret put ${SECRET_NAME}（或本轮加 --rotate-secret 强制轮换）`);
  }
}

/* 5. 数据库迁移 ------------------------------------------------------------ */
step('应用数据库迁移');
if (OPT.skipMigrate) {
  warn('已跳过（--skip-migrate）');
} else {
  const args = ['d1', 'migrations', 'apply', DB_NAME, '--remote'];
  const res = wrangler(args, OPT.dryRun ? { capture: true, allowFail: true } : {});
  if (OPT.dryRun) info('dry-run 跳过实际执行');
  else ok(res.code === 0 ? '迁移已应用（无变更时自动跳过）' : '迁移命令返回非零，请检查上方输出');
}

/* 6. 板块种子 -------------------------------------------------------------- */
step('写入初始板块');
if (OPT.skipSeed || OPT.dryRun) {
  warn(OPT.dryRun ? 'dry-run 跳过' : '已跳过（--skip-seed）');
} else {
  run('npx', ['wrangler', 'd1', 'execute', DB_NAME, '--remote', '--file=./seed.sql', '--yes']);
  ok('板块数据就绪（INSERT OR IGNORE，可重复执行）');
}

/* 7. 类型检查 -------------------------------------------------------------- */
step('TypeScript 严格校验');
run('npx', ['tsc', '--noEmit']);
ok('类型检查通过');

/* 8. 发布 ------------------------------------------------------------------ */
step(OPT.dryRun ? '打包校验（不发布）' : '发布 Worker');
const deployArgs = ['wrangler', 'deploy'];
if (OPT.dryRun) deployArgs.push('--dry-run', '--outdir', '.wrangler/dist');
const dep = run('npx', deployArgs, { capture: true });
const depOut = dep.out;
process.stdout.write(
  depOut
    .split('\n')
    .filter((l) => /Uploaded |Deployed |Version ID|https:\/\//i.test(l))
    .join('\n') + '\n',
);

// 优先用 wrangler.toml 里配置的自定义域（workers.dev 在部分网络下不可直连）
const routeMatch = readToml().match(/pattern\s*=\s*"([^"]+)"/);
const customDomain = routeMatch ? `https://${routeMatch[1]}` : '';
const urls = [...depOut.matchAll(/https:\/\/[^\s"'│]+/g)].map((m) => m[0].replace(/[.,)]+$/, ''));
const custom = urls.find((u) => !u.includes('workers.dev') && !u.includes('dash.cloudflare.com'));
const workerUrl = urls.find((u) => u.includes('workers.dev'));
const target = customDomain || custom || workerUrl || '';

if (OPT.dryRun) {
  ok('打包成功（未发布）');
} else if (target) {
  ok(`已发布 → ${c.cyan(target)}`);
} else {
  warn('已发布，但没能从输出里解析出地址，请查看 Cloudflare 后台');
}

/* 9. 健康检查 -------------------------------------------------------------- */
if (!OPT.dryRun && target) {
  step('线上健康检查');
  const candidates = [target, workerUrl].filter((u, i, arr) => u && arr.indexOf(u) === i);
  let healthy = false;
  for (const base of candidates) {
    for (let i = 0; i < 3 && !healthy; i += 1) {
      try {
        const res = await fetch(`${base.replace(/\/$/, '')}/healthz`, {
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; cf-bbs-deploy-check/1.0)' },
          signal: AbortSignal.timeout(8_000),
        });
        if (res.ok) {
          ok(`${base}/healthz → ${res.status} · ${(await res.text()).slice(0, 80)}`);
          healthy = true;
          break;
        }
        info(`${base} 返回 ${res.status}，稍后重试…`);
      } catch (err) {
        info(`${base} 探测失败：${err.name === 'TimeoutError' ? '超时' : err.message}`);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (healthy) break;
    if (base !== candidates[candidates.length - 1]) info('换一个地址继续探测…');
  }
  if (!healthy) {
    warn('健康检查未通过：多为本机 DNS/代理未覆盖该域名，不影响线上访问；请用浏览器打开确认');
  }
}

/* 汇总 -------------------------------------------------------------------- */
console.log(`\n${c.green(c.bold('部署完成'))} ${c.dim(`(${steps.length} 步)`)}`);
if (!OPT.dryRun && target) {
  console.log(`  ${c.bold('站点')}  ${target}`);
  console.log(`  ${c.bold('后台')}  ${target.replace(/\/$/, '')}/admin`);
  info('首次访问会自动进入 /setup 创建管理员；已有用户则直接进首页');
}
console.log('');
