# cf-bbs · Nexus

一个可以直接跑在 **Cloudflare Workers + D1** 上的轻量社区论坛。SSR 渲染、零运行时依赖、内置多语言与多平台 OAuth 登录。

```bash
npm install
npx wrangler d1 create cf-bbs          # 把返回的 database_id 填进 wrangler.toml
npm run db:migrate && npm run db:seed  # 本地
npm run dev                            # http://localhost:8787
```

首次打开会自动进入 `/setup`，创建第一个管理员账号（同时生成一篇欢迎主题），随后即可使用。

## 界面预览

| 首页（亮色） | 首页（暗色） |
| --- | --- |
| ![home-light](docs/screenshots/home-light.png) | ![home-dark](docs/screenshots/home-dark.png) |

| 主题详情 | 管理后台 |
| --- | --- |
| ![topic](docs/screenshots/topic.png) | ![admin](docs/screenshots/admin.png) |

移动端与登录页：`docs/screenshots/mobile.png`、`docs/screenshots/login.png`。

---

## 特性

**轻量 · 高性能**

- 单个 Worker、零运行时依赖（不引入 Hono/React/ORM），全部逻辑约 5k 行 TypeScript
- 服务端直出 HTML，首屏无 JS 依赖；CSS/JS 由 Workers Static Assets 直接返回，不消耗 Worker 调用
- 页面级 SQL 都走索引，列表分页、计数、关系数据一次查询完成；写操作使用 `DB.batch()` 保证一致性
- 点赞 / 收藏 / 回复预览为渐进增强：没有 JS 也能用（表单回退）

**功能**

- 板块、主题、楼层回复、Markdown（代码块 / 引用 / 列表 / 图片 / @提及）
- 点赞、收藏、通知（回复 / 提及）、举报与版务处理
- 角色：成员 / 版主 / 管理员；置顶、加精、锁定、删除
- 搜索、用户主页、个人设置、密码修改、账号绑定
- 管理后台：概览指标、用户管理、板块 CRUD、举报队列、站点设置（站名 / 公告 / 关闭注册）
- RSS、sitemap.xml、robots.txt、OG 标签、canonical
- 亮色 / 暗色 / 跟随系统，响应式（移动端底部导航化）

**安全**

- 会话：HMAC-SHA256 签名令牌（HttpOnly + SameSite=Lax + Secure），支持 `token_version` 全端下线
- 密码：PBKDF2-SHA256（默认 10 万次迭代，可用 `PASSWORD_ITERATIONS` 调整）
- CSRF：双提交 Cookie + 表单隐藏域 / `X-CSRF-Token`，常量时间比较
- XSS：Markdown 先整体转义再生成标签，链接仅允许 `http(s)` 与站内路径
- 响应头：CSP、X-Frame-Options、nosniff、Referrer-Policy、HSTS、Permissions-Policy
- 限流：登录/注册、发帖、API 三档内存限流（可在控制台叠加 WAF Rate Limiting）

**国际化**

- 内置 `zh-CN` / `en-US` 两套完整词条，服务端按 `Cookie → 用户偏好 → Accept-Language` 协商
- 板块名与描述本身也是双语字段；页脚可一键切换语言
- 新增语言：在 `src/lib/i18n.ts` 里加一份字典 + 一处 `LOCALES` 即可

---

## OAuth 登录

内置 6 种登录方式，**配了环境变量即自动出现在登录页**，未配置则隐藏：

| Provider | 变量 | 回调地址 |
| --- | --- | --- |
| GitHub | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | `https://你的域名/auth/github/callback` |
| Google | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `https://你的域名/auth/google/callback` |
| GitLab | `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` | `https://你的域名/auth/gitlab/callback` |
| Gitee | `GITEE_CLIENT_ID` / `GITEE_CLIENT_SECRET` | `https://你的域名/auth/gitee/callback` |
| Discord | `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | `https://你的域名/auth/discord/callback` |
| 通用 OIDC | `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_NAME` | `https://你的域名/auth/oidc/callback` |

通用 OIDC 兼容 Keycloak、Authentik、Auth0、Okta、Linux.do 等任何提供 `.well-known/openid-configuration` 的服务；`OIDC_NAME` 用于自定义按钮文案（如 `Linux.do`）。

设置方式：

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET      # 必填，32 位以上随机串
```

已有账号可在「设置 → 已绑定账号」中绑定/解绑第三方登录；OAuth 首次登录时若邮箱已验证并且站点存在同邮箱账号，会自动合并。

---

## 部署

### 方式 A：一键部署（本地一条命令）

```bash
npx wrangler login   # 只需第一次
npm run ship
```

`scripts/deploy.mjs` 会串起整条链路，任何一步失败立即停下并打印真实错误：

1. 检查依赖与 Cloudflare 登录态
2. `wrangler.toml` 里 `database_id` 仍是占位值时，自动 `d1 create` 并写回
3. 首次部署自动生成 48 字节随机 `SESSION_SECRET` 并写入（已存在则不动，不会让现有会话失效）
4. 应用 D1 迁移（无变更自动跳过）
5. 写入初始板块（`INSERT OR IGNORE`，可重复执行）
6. TypeScript 严格校验 → `wrangler deploy`
7. 轮询 `/healthz` 确认线上可用，并输出站点与后台地址

常用参数：

| 命令 | 作用 |
|---|---|
| `npm run ship` | 完整部署 |
| `npm run ship -- --skip-seed` | 不动板块数据（日常发布最常用） |
| `npm run ship -- --skip-migrate` | 跳过数据库迁移 |
| `npm run ship:dry` | 只打包校验，不真正发布 |
| `npm run ship -- --rotate-secret` | 强制轮换 `SESSION_SECRET`（会让所有已登录用户下线） |
| `npm run ship -- --yes` | 全程不询问（CI / 定时任务） |

> 密钥处理是保守的：只有确认线上**没有** `SESSION_SECRET` 时才自动生成写入；查询失败会跳过并提示，绝不会因为一次网络抖动把全员登出。

### 方式 B：GitHub Actions（推送即部署）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/xfm0797/cloudflare-workers-bbs-Nexus)

仓库已带 `.github/workflows/deploy.yml`：**push 到 `main` 自动发布**，也可以在 Actions 页面点 **Run workflow** 手动触发（可勾选是否迁移、是否写入初始板块）。

首次启用需在仓库 `Settings → Secrets and variables → Actions` 配置：

| 类型 | 名称 | 说明 |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | **必填**。Cloudflare 后台创建，权限：`Workers Scripts:Edit`、`D1:Edit`、`Account Settings:Read` |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | 可选，账号 ID（多账号时建议填） |
| Secret | `SESSION_SECRET` | 可选，填了则每次部署同步会话密钥（不填则沿用线上已有值） |
| Variable | `D1_DATABASE_ID` | 可选，fork 后用自己的数据库时覆盖 `wrangler.toml` 里的 id |

> 用别人的仓库部署自己的站：先 Fork → 改 `wrangler.toml` 的 `name` 与 `routes`（或删掉 `[[routes]]` 用 workers.dev 域名）→ 按上表配好密钥 → 点 Run workflow。

### 方式 C：手动分步

1. **创建 D1**

   ```bash
   npx wrangler d1 create cf-bbs
   ```

   将输出的 `database_id` 写入 `wrangler.toml`。

2. **初始化线上库**

   ```bash
   npx wrangler d1 migrations apply cf-bbs --remote
   npx wrangler d1 execute cf-bbs --remote --file=./seed.sql
   ```

3. **设置密钥**

   ```bash
   npx wrangler secret put SESSION_SECRET
   ```

   可选：在 `wrangler.toml` 的 `[vars]` 里修改 `SITE_NAME` / `SITE_TAGLINE` / `ALLOW_REGISTRATION`。

4. **发布**

   ```bash
   npm run deploy
   ```

5. 绑定自定义域名（Workers → Settings → Domains & Routes），然后把 OAuth 回调地址改成正式域名。

> 免费版 Workers 单次请求 CPU 上限较低，PBKDF2 10 万次迭代可能触顶。建议使用付费计划，或把 `PASSWORD_ITERATIONS` 调到 `50000`。

---

## 目录结构

```
src/
├── index.ts            # Worker 入口：上下文、CSRF、安全头、限流、错误处理
├── router.ts           # 极简路由（method + /path/:param）
├── types.ts            # 运行时上下文与视图数据类型
├── env.d.ts            # 绑定与密钥类型
├── lib/
│   ├── auth.ts         # 会话签名、PBKDF2、CSRF、OAuth state
│   ├── oauth.ts        # 6 个 Provider 的授权/换取/资料拉取
│   ├── db.ts           # 全部 SQL 与领域操作（主题、回复、通知、统计…）
│   ├── markdown.ts     # 安全 Markdown → HTML
│   ├── i18n.ts         # 中英词条、相对时间、日期格式化
│   ├── utils.ts        # Cookie、编码、限流、摘要
│   └── types.ts        # 数据模型
├── routes/             # home / topic / auth / user / admin / api / feeds
└── views/              # layout（壳 + 侧栏）、pages、admin、ui（图标/头像/分页）
public/                 # app.css、app.js、favicon.svg（Workers Assets）
migrations/0001_init.sql
seed.sql                # 6 个初始板块
```

## 数据模型

`users` `oauth_accounts` `categories` `topics` `posts` `likes` `bookmarks` `notifications` `reports` `settings`

- 所有内容软删除（`is_deleted`），便于审计与恢复
- `topics.reply_count / like_count / views` 与 `categories.*_count` 为冗余计数，写入时同批更新，保证列表查询零 JOIN 聚合
- 用户名/邮箱通过 `lower()` 唯一索引实现大小写不敏感唯一

## 运营相关

- 首个注册用户（或 `/setup` 创建的账号）自动成为管理员
- 关闭注册：后台「站点设置」或 `ALLOW_REGISTRATION=false`
- 举报入口在每条回复的操作区，处理结果在「后台 → 举报」
- 版主只能处理举报与内容版务；用户/板块/站点设置仅管理员可见

## 防爬虫与额度保护

免费版 Workers（10 万请求/天）和 D1（500 万行读/天）很容易被采集器、AI 训练爬虫和漏洞扫描器吃掉。本项目做了三层防护，**第一层在代码里已经生效，第二、三层需要在 Cloudflare 后台点一下**。

### 第 1 层：应用层拦截（已内置，`src/lib/botguard.ts`）

请求进入路由和数据库之前先过 `guardRequest()`，命中即返回 `403`，**不产生任何 D1 查询**：

| 规则 | 处理 |
| --- | --- |
| AI 训练 / 商业采集爬虫（GPTBot、CCBot、ClaudeBot、Bytespider、AhrefsBot、SemrushBot、MJ12bot…） | 直接 403 |
| 脚本客户端（curl、python-requests、Go-http-client、Scrapy、HeadlessChrome、sqlmap、nuclei…） | 直接 403 |
| 空 User-Agent | 直接 403 |
| 漏洞扫描路径（`/wp-login.php`、`/.env`、`/.git`、`/phpmyadmin`、`/actuator`…） | 直接 403 |
| 搜索引擎（Googlebot、Bingbot、Baiduspider、YandexBot…） | 放行，但禁止访问 `/admin`、`/api/`、`/search` |
| 社交预览（Twitterbot、TelegramBot、Discordbot、facebookexternalhit…） | 放行，分享卡片需要 |

同一层还有匿名请求限流（用 Cache API 计数，跨 isolate 共享）：页面 180 次/分/IP、`/api/` 120 次/分、`/search` 20 次/分，超限返回 `429` + `Retry-After`。

`robots.txt` 同时声明拒绝上述 AI 爬虫（双保险），并把 `/admin`、`/api/`、`/search`、`/notifications` 等排除在收录之外。

需要临时放行（例如接监控探针）：`wrangler secret put BOT_GUARD` 写入 `off`，或在 `wrangler.toml` 的 `[vars]` 里设 `BOT_GUARD = "off"`。

### 第 2 层：Bot Fight Mode（建议开启，边缘拦截不消耗 Worker 额度）

Cloudflare 控制台 → 选择域名 → **Security → Bots** → 打开 **Bot Fight Mode**。
所有已知 bot 会被边缘直接挑战/拦截，请求**不计入** Workers 调用数，是省钱最有效的一步。

### 第 3 层：限流规则（建议开启）

**Security → WAF → Rate limiting rules** → Create rule：

- 匹配：`http.request.uri.path ne "/app.css" and http.request.uri.path ne "/app.js"`
- 计数特征：IP
- 阈值：10 秒内 60 次请求
- 动作：Block，持续时间 10 秒

免费版可建 1 条规则，足够挡住单 IP 的高频抓取。

### 用量监控

Workers & Pages → `cf-bbs` → Metrics 查看请求数与 CPU；D1 → `cf-bbs` → Metrics 查看行读/行写。
若某天请求数异常飙升，先在 **Security → Events** 里按 UA / 路径筛选，再把新的 UA 关键词补进 `botguard.ts` 的正则。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 本地开发（含本地 D1） |
| `npm run ship` | **一键部署**（建库 → 密钥 → 迁移 → 种子 → 校验 → 发布 → 健康检查） |
| `npm run ship:dry` | 一键部署的演练模式，只打包不发布 |
| `npm run typecheck` | TypeScript 严格模式校验 |
| `npm run db:migrate` | 应用迁移（加 `:remote` 为线上） |
| `npm run db:seed` | 写入初始板块 |
| `npm run demo` | 本地灌入演示数据（2 个用户 + 3 个主题 + 回复点赞） |
| `npm run deploy` | 仅发布 Worker（不含建库/迁移） |
| `npm run tail` | 实时查看线上日志 |

## 本地调试小工具

- `.dev.vars` 中设置 `DEV_LOGIN=1` 后，可访问 `/dev/login/:username` 免密登录（线上不设置该变量，路由恒为 404）
- `scripts/shot-mobile.cjs`：通过 CDP 设备模拟截取任意宽度的移动端截图
  （`node scripts/shot-mobile.cjs <url> <out.png> <width> <height>`，加 `DARK=1` 截暗色）

## License

MIT
