# cf-bbs · Nexus

[中文](README.md) | [English](README.en.md)

A lightweight community forum that runs directly on **Cloudflare Workers + D1**. Server-side rendered, zero runtime dependencies, with built-in i18n and multi-provider OAuth login.

```bash
npm install
npx wrangler d1 create cf-bbs          # put the returned database_id into wrangler.toml
npm run db:migrate && npm run db:seed  # local
npm run dev                            # http://localhost:8787
```

The first visit redirects to `/setup` where you create the first admin account (a welcome topic is generated too).

## Screenshots

| Home (light) | Home (dark) |
| --- | --- |
| ![home-light](docs/screenshots/home-light.png) | ![home-dark](docs/screenshots/home-dark.png) |

| Topic detail | Admin dashboard |
| --- | --- |
| ![topic](docs/screenshots/topic.png) | ![admin](docs/screenshots/admin.png) |

Mobile & login page: `docs/screenshots/mobile.png`, `docs/screenshots/login.png`.

---

## Features

**Lightweight · High performance**

- Single Worker, zero runtime dependencies (no Hono/React/ORM), ~6k lines of TypeScript in total
- Server-rendered HTML with no JS required for first paint; CSS/JS served via Workers Static Assets without consuming Worker invocations
- All page-level SQL is index-backed; pagination, counters, and relations resolved in one query; writes use `DB.batch()` for consistency
- Likes / bookmarks / reply previews are progressive enhancements — everything works without JS (form fallback)

**Functionality**

- Categories, topics, threaded replies, Markdown (code blocks / quotes / lists / images / @mentions)
- **Direct messages**: per-user-pair conversations with a bubble UI, unread badges, mark-as-read on open; banned/muted users cannot send or receive
- **Tag system**: tag topics when posting; `/tags` tag cloud + `/tags/:name` topic list
- **Mentions tab**: profile page `?tab=mentions` aggregates topics where the user was mentioned; mentions trigger notifications automatically
- **Drafts**: composing topics, replies, and DMs auto-saves to local storage — never lose content to an accidental close
- Likes, bookmarks, notifications (reply / mention), reporting and moderation
- Roles: member / moderator / admin; pin, feature, lock, delete
- **User mute**: admins can mute for 1 hour up to 30 days; muted users cannot post, reply, or DM — lifts automatically on expiry
- Search, user profiles, settings, password change, account linking
- Admin dashboard: overview metrics, user management (roles / bans / mutes), **content management (topics + replies, hard delete)**, category CRUD, report queue, **audit log**, site settings (name / announcement / registration toggle)
- RSS, sitemap.xml, robots.txt, OG tags, canonical
- Light / dark / follow-system themes, responsive (mobile bottom navigation)

**Security**

- Sessions: HMAC-SHA256 signed tokens (HttpOnly + SameSite=Lax + Secure), `token_version` for global sign-out
- Passwords: PBKDF2-SHA256 (100k iterations by default, adjustable via `PASSWORD_ITERATIONS`)
- CSRF: double-submit cookie + hidden field / `X-CSRF-Token`, constant-time comparison
- XSS: Markdown is fully escaped before tag generation; links restricted to `http(s)` and same-site paths
- Headers: CSP, X-Frame-Options, nosniff, Referrer-Policy, HSTS, Permissions-Policy
- Rate limiting: separate tiers for auth, posting, DMs, and API (stackable with WAF Rate Limiting)

**Internationalization**

- Complete `zh-CN` / `en-US` dictionaries; server negotiates via `Cookie → user preference → Accept-Language`
- Category names and descriptions are bilingual fields; one-click language switch in the footer
- Adding a language: add a dictionary + one `LOCALES` entry in `src/lib/i18n.ts`

---

## OAuth Login

Six built-in providers — **configure the env vars and the button appears on the login page automatically**:

| Provider | Variables | Callback URL |
| --- | --- | --- |
| GitHub | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | `https://your.domain/auth/github/callback` |
| Google | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `https://your.domain/auth/google/callback` |
| GitLab | `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` | `https://your.domain/auth/gitlab/callback` |
| Gitee | `GITEE_CLIENT_ID` / `GITEE_CLIENT_SECRET` | `https://your.domain/auth/gitee/callback` |
| Discord | `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | `https://your.domain/auth/discord/callback` |
| Generic OIDC | `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_NAME` | `https://your.domain/auth/oidc/callback` |

Generic OIDC works with Keycloak, Authentik, Auth0, Okta, Linux.do, and any provider exposing `.well-known/openid-configuration`; `OIDC_NAME` customizes the button label.

Setup:

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET      # required, 32+ random chars
```

Existing accounts can link/unlink providers in "Settings → Linked accounts"; on first OAuth login, if the email is verified and a local account with the same email exists, they are merged automatically.

---

## Image Bed Integration (Editor Uploads)

Connect an external image bed (Sanyue ImgHub / CloudFlare-ImgBed style services exposing `POST /upload?authCode=`): while posting or replying, **click the image button, paste a screenshot, or drag & drop** — images upload automatically and insert `![filename](direct link)`.

How it works: the browser only talks to your site's `/api/upload`; the Worker forwards uploads to the image bed — **the auth code never leaves the server**. Requires login, validates image types, limits per-image size (8MB default) and 30 uploads / 10 minutes per user.

Configuration (both values must exist or the upload UI stays hidden):

```toml
# wrangler.toml [vars]
IMGBED_URL = "https://img.lovou.eu.org"   # image bed root URL
# IMGBED_FOLDER = "bbs"                   # optional: upload folder
# IMGBED_CHANNEL = "telegram"             # optional: telegram / cfr2 / s3
# IMGBED_MAX_MB = "8"                     # optional: per-image limit (MB)
# IMGBED_COMPRESS = "1"                   # optional: let the bed compress (off by default)
# IMGBED_AUTO_RETRY = "1"                 # optional: auto-switch channel on failure (off by default)
```

> `serverCompress=false&autoRetry=false` are sent by default: the former 400s on some channels, the latter merges unconfigured-channel errors into a misleading 500.

```bash
npx wrangler secret put IMGBED_AUTH_CODE   # the auth code from the image bed settings
```

A successful upload returns `data[0].src`; relative paths are resolved to absolute URLs. The domain is allowed by the CSP `img-src https:` whitelist and renders inline.

---

## Email Verification (Resend)

A verification email is sent on signup; clicking the link verifies the address (token valid 24h, single use, only the SHA-256 digest stored). The settings page shows verification status with a "resend" action; changing the email resets the status and re-sends.

![Email verification settings card](docs/screenshots/email-verify-card.png)

```bash
npx wrangler secret put RESEND_API_KEY   # create in the Resend dashboard
npx wrangler secret put MAIL_FROM        # e.g. "Nexus <noreply@lovou.pw>", domain must be verified in Resend
# optional
npx wrangler secret put MAIL_REPLY_TO
```

Behavior switches in `wrangler.toml`:

```toml
SITE_URL = "https://forum.lovou.pw"           # prefix for email links; required with a custom domain
REQUIRE_EMAIL_VERIFICATION = "true"           # true = unverified users cannot post / reply
```

- Without `RESEND_API_KEY` / `MAIL_FROM`: signup works normally, the verification link is only printed in `wrangler tail` logs, no banner is shown, and nobody gets locked out by mandatory verification
- With `REQUIRE_EMAIL_VERIFICATION`: unverified users can still browse / search, but posting and replying are blocked back to the editor with a persistent banner; existing users verify via "Settings → Email verification → Resend"
- Resend rate limits: 60s cooldown per account + 3 emails / 10 minutes per user
- Until your sending domain is verified in Resend, emails can only go to your own account address — verify the domain before going live

---

## Full-text Search (FTS5)

Search uses D1's built-in FTS5 virtual table (defined in `migrations/0000_init.sql`), indexing topic titles / excerpts / tags and **reply bodies**:

- `trigram` tokenizer: no dictionary needed; both Chinese and English match as substrings, with `snippet()` highlights
- `bm25` relevance ranking — title weight 8, body weight 1
- Queries shorter than 3 characters (e.g. two-character Chinese words) automatically fall back to `LIKE`; index errors also fall back instead of returning 500
- Triggers keep the index in sync: topic create / title change / soft delete / restore, reply create / edit / soft delete / hard delete

Rebuild the index (after bulk imports, or if you suspect drift):

```bash
npm run search:reindex              # local
npm run search:reindex -- --remote  # production
```

> trigram is substring matching: long concatenated Chinese words must appear contiguously; spaces yield AND semantics (e.g. `forum interface`).

---

## Deployment

### Option A: One-command deploy

```bash
npx wrangler login   # first time only
npm run ship
```

`scripts/deploy.mjs` chains the whole pipeline and stops at the first failure with the real error:

1. Check dependencies and Cloudflare login state
2. Auto `d1 create` and write back if `database_id` is still a placeholder
3. Generate a 48-byte random `SESSION_SECRET` on first deploy (existing values are never touched)
4. Apply D1 migrations (skipped automatically when there are none)
5. Seed initial categories (`INSERT OR IGNORE`, safe to repeat)
6. Strict TypeScript check → `wrangler deploy`
7. Poll `/healthz` and print the site and admin URLs

Common flags:

| Command | Effect |
|---|---|
| `npm run ship` | Full deploy |
| `npm run ship -- --skip-seed` | Leave category data untouched (most common for daily releases) |
| `npm run ship -- --skip-migrate` | Skip database migrations |
| `npm run ship:dry` | Bundle and verify only, no publish |
| `npm run ship -- --rotate-secret` | Force-rotate `SESSION_SECRET` (signs everyone out) |
| `npm run ship -- --yes` | No prompts (CI / scheduled tasks) |

> Secret handling is conservative: a `SESSION_SECRET` is only generated when confirmed **absent** in production; a failed lookup is skipped with a warning — a network blip will never log everyone out.

### Option B: GitHub Actions (push to deploy)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/xfm0797/cloudflare-workers-bbs-Nexus)

The repo ships `.github/workflows/deploy.yml`: **pushing to `main` deploys automatically**, or trigger manually from the Actions page (with toggles for migrations and seeding). Without secrets configured, the pipeline only runs the type check and skips gracefully — no failed runs.

Configure in `Settings → Secrets and variables → Actions`:

| Type | Name | Notes |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | **Required.** Create in the Cloudflare dashboard with `Workers Scripts:Edit`, `D1:Edit`, `Account Settings:Read` |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Optional; recommended with multiple accounts |
| Secret | `SESSION_SECRET` | Optional; if set, synced on every deploy (otherwise production keeps its current value) |
| Variable | `D1_DATABASE_ID` | Optional; overrides the id in `wrangler.toml` after forking |

> Deploying your own site from someone else's repo: Fork → remove the `[[routes]]` block from `wrangler.toml` (otherwise it binds the original author's domain) → optionally rename `name` → set `CLOUDFLARE_API_TOKEN` (and your `D1_DATABASE_ID`) → Run workflow.

### Option C: Manual steps

1. **Create D1**

   ```bash
   npx wrangler d1 create cf-bbs
   ```

   Write the `database_id` into `wrangler.toml`.

2. **Initialize the production database**

   ```bash
   npx wrangler d1 migrations apply cf-bbs --remote
   npx wrangler d1 execute cf-bbs --remote --file=./seed.sql
   ```

3. **Set secrets**

   ```bash
   npx wrangler secret put SESSION_SECRET
   ```

   Optional: adjust `SITE_NAME` / `SITE_TAGLINE` / `ALLOW_REGISTRATION` in `wrangler.toml` `[vars]`.

4. **Publish**

   ```bash
   npm run deploy
   ```

5. Bind a custom domain (Workers → Settings → Domains & Routes), then update the OAuth callback URLs.

> Free-tier Workers have a low per-request CPU limit; PBKDF2 at 100k iterations may hit it. Use a paid plan or set `PASSWORD_ITERATIONS` to `50000`.

---

## Project Structure

```
src/
├── index.ts            # Worker entry: context, CSRF, security headers, rate limiting, errors
├── router.ts           # Minimal router (method + /path/:param)
├── types.ts            # Runtime context and view data types
├── env.d.ts            # Bindings and secret types
├── lib/
│   ├── auth.ts         # Session signing, PBKDF2, CSRF, OAuth state
│   ├── oauth.ts        # Authorization/exchange/profile for the 6 providers
│   ├── db.ts           # All SQL and domain operations (topics, replies, DMs, audit, stats…)
│   ├── markdown.ts     # Safe Markdown → HTML
│   ├── i18n.ts         # zh/en dictionaries, relative time, date formatting
│   ├── utils.ts        # Cookies, encoding, rate limiting, digests
│   └── types.ts        # Data models
├── routes/             # home / topic / auth / user / messages / tags / admin / api / feeds
└── views/              # layout (shell + sidebar), pages, admin, messages, tags, ui (icons/avatar/pagination)
public/                 # app.css, app.js, favicon.svg (Workers Assets)
migrations/0000_init.sql # Full initial schema (email verification / FTS / DMs / audit & mute)
seed.sql                # 6 initial categories
```

## Data Model

`users` `oauth_accounts` `email_tokens` `categories` `topics` `posts` `likes` `bookmarks` `notifications` `reports` `conversations` `messages` `audit_logs` `settings`

- Content uses soft delete (`is_deleted`) for author self-deletion and audit; admin moderation deletes are **hard deletes** that clean up replies, likes, bookmarks, notifications and reclaim counters
- `topics.reply_count / like_count / views` and `categories.*_count` are denormalized counters updated in the same batch as writes — list queries need zero JOIN aggregation
- Usernames/emails are case-insensitively unique via `lower()` unique indexes
- Each user pair has exactly one DM conversation (columns ordered by id lexicographically) with per-side unread counters

## Operations

- The first registered user (or the account created via `/setup`) becomes admin automatically
- Close registration: admin "Site settings" or `ALLOW_REGISTRATION=false`
- Admin "Posts": dual topic/reply views with search and status filters; pin / lock / feature; deletion is a hard delete (irreversible — double-check before acting)
- Admin "Audit log": role changes, bans/mutes, moderation actions, category CRUD, and report handling are all recorded (admins only)
- Mute: pick a duration (1h / 24h / 7d / 30d) from the user row action menu; lifts automatically on expiry
- The report button lives in each reply's action area; outcomes appear in "Admin → Reports"

## Anti-bot & Quota Protection

Free-tier Workers (100k requests/day) and D1 (5M row reads/day) are easy prey for scrapers, AI-training crawlers, and vulnerability scanners. This project adds three layers — **the first is in code and active; the second and third need one click in the Cloudflare dashboard**.

### Layer 1: Application-level blocking (built in, `src/lib/botguard.ts`)

Requests pass `guardRequest()` before routing and database access; a hit returns `403` with **zero D1 queries**:

| Rule | Action |
| --- | --- |
| AI-training / commercial crawlers (GPTBot, CCBot, ClaudeBot, Bytespider, AhrefsBot, SemrushBot, MJ12bot…) | 403 |
| Script clients (curl, python-requests, Go-http-client, Scrapy, HeadlessChrome, sqlmap, nuclei…) | 403 |
| Empty User-Agent | 403 |
| Vulnerability-scan paths (`/wp-login.php`, `/.env`, `/.git`, `/phpmyadmin`, `/actuator`…) | 403 |
| Search engines (Googlebot, Bingbot, Baiduspider, YandexBot…) | Allowed, but blocked from `/admin`, `/api/`, `/search` |
| Social previews (Twitterbot, TelegramBot, Discordbot, facebookexternalhit…) | Allowed (needed for share cards) |

The same layer rate-limits per IP via the **native Workers Rate Limiting binding** (`[[ratelimits]]` in `wrangler.toml`; counters bypass D1 and cost no extra invocations), returning `429` + `Retry-After`:

| Subject | Quota |
|---|---|
| Anonymous visitors (no `bbs_sess`) | 40 req/min |
| Signed-in users | 180 req/min |
| `/search` | 10 req/min |

> CSS/JS/icons are served from Workers Assets without hitting the Worker, so "40/min" effectively means ~40 page views per minute — normal usage never hits it.
> Local development without the binding falls back to Cache API / in-memory buckets (same thresholds, see `src/index.ts`).

`robots.txt` also disallows the AI crawlers (belt and braces) and excludes `/admin`, `/api/`, `/search`, `/notifications` from indexing.

To temporarily allow a client (e.g. a monitoring probe): `wrangler secret put BOT_GUARD` with `off`, or set `BOT_GUARD = "off"` in `wrangler.toml` `[vars]`.

### Layer 2: Bot Fight Mode (one command)

```bash
CLOUDFLARE_API_TOKEN=xxx npm run guard            # auto-detects the domain from wrangler.toml
CLOUDFLARE_API_TOKEN=xxx npm run guard -- --zone lovou.pw
```

`scripts/edge-guard.mjs` writes the following, **idempotently**:

| Item | Config |
|---|---|
| Bot Fight Mode | On, with JS Detections (prerequisite on the free plan) |
| AI crawlers | `ai_bots_protection = block` |
| WAF custom rules ×4 | Scan paths → Block; script clients (curl/python-requests/Scrapy/sqlmap…) → Block; AI crawlers (GPTBot/CCBot/ClaudeBot/Bytespider…) → Block; empty UA → Managed Challenge |
| Rate limiting rule ×1 | Same-coloco same IP **60 req / 10s** → `429` (exempting `/app.css` `/app.js` `/favicon.svg`) |

Token permissions: **Zone → Zone WAF:Edit, Bot Management:Edit, Zone:Read**.
This layer runs at the Cloudflare edge — blocked requests never reach the Worker and **consume no quota**, making it the most effective cost saver.

> **Field-tested (2026-10, Free plan)**: Bot Fight Mode, AI crawler blocking, and all 4 WAF custom rules work (curl / GPTBot / scan paths all get Cloudflare 403 pages).
> However, **rate limiting rules write successfully but do not execute at the edge on this free account** (even `expression: "true"` never triggers),
> so rate limiting is actually carried by the Layer-1 Workers Rate Limiting binding; the edge rule is kept as configuration backup.
> On Pro or higher, adjust with `npm run guard -- --limit 100 --window 10` and re-run.

You can also configure manually: **Security → Bots** for Bot Fight Mode; **Security → WAF → Custom rules** per the table above.

### Layer 3: Usage monitoring & tuning

Workers & Pages → `cf-bbs` → Metrics for requests and CPU; D1 → `cf-bbs` → Metrics for row reads/writes.
If requests spike one day, filter by UA / path in **Security → Events**, add the new UA keywords to `scripts/edge-guard.mjs` and `src/lib/botguard.ts`, then re-run `npm run guard`.

## Common Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Local dev (with local D1) |
| `npm run ship` | **One-command deploy** (create DB → secrets → migrate → seed → check → publish → health check) |
| `npm run ship:dry` | Dry-run deploy: bundle and verify only |
| `npm run guard` | **Configure Cloudflare edge protection** (Bot Fight Mode / WAF / rate limiting), needs `CLOUDFLARE_API_TOKEN` |
| `npm run typecheck` | Strict TypeScript check |
| `npm run db:migrate` | Apply migrations (append `:remote` for production) |
| `npm run db:seed` | Seed initial categories |
| `npm run demo` | Load local demo data (2 users + 3 topics + replies/likes) |
| `npm run deploy` | Publish the Worker only (no DB setup/migrations) |
| `npm run tail` | Tail production logs |

## Local Debugging Tools

- With `DEV_LOGIN=1` in `.dev.vars`, visit `/dev/login/:username` for passwordless login (the variable is never set in production, where the route is always 404)
- `scripts/shot-mobile.cjs`: CDP device-emulation screenshots at any viewport width
  (`node scripts/shot-mobile.cjs <url> <out.png> <width> <height>`, add `DARK=1` for dark mode)
- `scripts/ratelimit-check.cjs`: hammer a URL with a real browser engine and report status-code distribution to verify rate limiting
  (`node scripts/ratelimit-check.cjs "https://your.site/" 60 80` = 60 requests, 80ms apart)

## License

MIT
