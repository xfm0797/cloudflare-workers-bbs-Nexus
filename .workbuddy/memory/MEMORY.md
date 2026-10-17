# cf-bbs 项目长期笔记

## 项目定位
- `D:/xfm-work/cloudflare-workers-bbs` = cf-bbs（Nexus）：零运行时依赖的论坛社区，跑在 Cloudflare Workers + D1，SSR 直出 HTML。
- 设计原则：不引入 Hono/React/ORM；自写 `src/router.ts`（method + /path/:param）+ `src/views/` 模板函数；静态资源走 Workers Assets（`public/`）。

## 关键约定
- 版本式变更走 `migrations/`（wrangler d1 migrations），种子板块在 `seed.sql`；内容全部软删除（is_deleted），计数列（reply_count/like_count/views）写入时用 `DB.batch()` 同批维护。
- 安全模式：会话 = HMAC-SHA256 签名 cookie（`token_version` 控制全端下线）；CSRF = 双提交 cookie（`bbs_csrf`）+ 表单 `_csrf`/header `X-CSRF-Token`，在 index.ts 统一校验；Markdown 先整体 HTML 转义再生成标签。
- cookie 的 `secure` 属性按 `url.protocol === 'https:'` 动态决定（否则本地 http 下 curl/浏览器拿不到 cookie）。
- i18n 词条集中在 `src/lib/i18n.ts`，新增语言 = 加一份字典 + LOCALES 一项；板块名/描述是双语字段（name/name_en）。
- OAuth：provider 配置了 env 即出现在登录页；通用 OIDC 覆盖 Keycloak/Authentik/Linux.do 等（`OIDC_NAME` 自定义文案）。
- `DEV_LOGIN=1`（仅 .dev.vars）启用 `/dev/login/:username` 免密登录调试路由；线上必须不设置。
- `npm run demo` 灌演示数据；`node scripts/shot-mobile.cjs <url> <out> <w> <h>`（DARK=1）截移动端/暗色截图——headless Chrome 最小窗口宽约 500px，截窄屏必须走 CDP 设备模拟。

## 本地环境
- 本地 D1 state 在 `.wrangler/state`（重置 = 删掉后重新 migrate+seed+setup）。
- 截图存于 `docs/screenshots/`，README 已引用。
