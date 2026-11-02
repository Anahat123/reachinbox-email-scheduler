# ReachInbox — Email Job Scheduler

A full-stack email scheduler: an Express + BullMQ backend that schedules and sends emails through Ethereal SMTP with rate limiting, idempotency and restart safety, and a Next.js dashboard (Google login) to compose, schedule and track them.

| | |
|---|---|
| **Backend** | TypeScript, Express, BullMQ + Redis, PostgreSQL (Prisma), Nodemailer → Ethereal, Elasticsearch, Bull Board |
| **Frontend** | Next.js 15 (App Router), TypeScript, Tailwind CSS, TanStack Query, TipTap editor |
| **Infra** | Postgres, Redis (AOF persistence) and Elasticsearch via Docker Compose |
| **Integrations** | Google OAuth (login), Slack OAuth + incoming webhook (rate-limit alerts) |

---

## Contents

1. [Quick start](#quick-start)
2. [Configuration](#configuration)
3. [Architecture](#architecture)
4. [Rate limiting, delay & concurrency](#rate-limiting-delay--concurrency)
5. [Persistence & idempotency](#persistence--idempotency)
6. [Behaviour under load](#behaviour-under-load)
7. [API](#api)
8. [Features → requirements](#features--requirements)
9. [Tests](#tests)
10. [Assumptions & trade-offs](#assumptions--trade-offs)

---

## Quick start

**Prerequisites:** Docker Desktop, Node.js 20+ (developed on 22), and for Slack, an [ngrok](https://ngrok.com) account.

```bash
# 1. Infrastructure: Postgres, Redis, Elasticsearch
docker compose up -d

# 2. Backend (API + worker)
cd backend
cp .env.example .env          # then fill in JWT_SECRET, Google and Slack keys (see below)
npm install
npx prisma migrate deploy
npm run dev                   # API on http://localhost:4000 + BullMQ worker

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

`npm run dev` in `backend/` starts **two processes**: the HTTP API (`src/server.ts`) and the BullMQ worker (`src/worker.ts`). They can also be run separately (`npm run dev:api`, `npm run dev:worker`) and the worker can be scaled to several processes.

| URL | What |
|---|---|
| http://localhost:3000 | Dashboard |
| http://localhost:4000/admin/queues | Bull Board — live queue view (requires being signed in) |
| http://localhost:4000/health | Health of DB / Redis / Elasticsearch |

### Ethereal Email
Nothing to set up. On first boot the API creates `ETHEREAL_SENDER_COUNT` (default 3) Ethereal test accounts through the Ethereal API and stores them as senders. Every sent email has a **"View in Ethereal"** link on its detail page.

### Google OAuth (login)
1. [Google Cloud Console](https://console.cloud.google.com) → create a project → **Google Auth Platform** → *Get started* (audience: **External**) and add your Gmail under **Audience → Test users**.
2. **Clients → Create client → Web application**
   - Authorized JavaScript origin: `http://localhost:3000`
   - Authorized redirect URI: `http://localhost:4000/api/auth/google/callback`
3. Put the Client ID / secret in `backend/.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and restart the backend.

### Slack (rate-limit alerts)
Slack only redirects to `https` URLs, so the OAuth callback goes through ngrok.

1. `ngrok config add-authtoken <token>`, then claim your free static domain in the ngrok dashboard.
2. [api.slack.com/apps](https://api.slack.com/apps) → **Create New App → From a manifest**:
   ```yaml
   display_information:
     name: ReachInbox Alerts
   features:
     bot_user:
       display_name: ReachInbox Alerts
       always_online: false
   oauth_config:
     redirect_urls:
       - https://YOUR-DOMAIN.ngrok-free.dev/api/slack/callback
     scopes:
       bot:
         - incoming-webhook
   settings:
     org_deploy_enabled: false
     socket_mode_enabled: false
     token_rotation_enabled: false
   ```
3. Copy **Client ID / Client Secret** (Basic Information) into `backend/.env` together with `SLACK_REDIRECT_URI=https://YOUR-DOMAIN.ngrok-free.dev/api/slack/callback`, restart the backend.
4. Run the tunnel: `ngrok http 4000 --url=https://YOUR-DOMAIN.ngrok-free.dev`
5. In the dashboard: user menu → **Connect Slack** → pick a channel → Allow.

The tunnel is only needed for the connect step; alerts are sent by the backend straight to Slack's webhook.

---

## Configuration

All backend settings live in `backend/.env` (see [`backend/.env.example`](backend/.env.example)); they are validated on startup with zod.

| Variable | Default | Purpose |
|---|---|---|
| `WORKER_CONCURRENCY` | `5` | Parallel jobs per worker process |
| `MIN_DELAY_BETWEEN_SENDS_MS` | `2000` | Minimum gap between any two sends (global, Redis-backed) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `50` | Hourly cap per sender (Redis counters) |
| `SEND_MAX_ATTEMPTS` | `3` | SMTP retries (exponential backoff from 30s) before an email is `failed` |
| `ETHEREAL_SENDER_COUNT` | `3` | Number of Ethereal sender accounts to create |
| `DATABASE_URL`, `REDIS_URL`, `ELASTICSEARCH_URL` | docker-compose values | Infra |
| `GOOGLE_*`, `SLACK_*` | — | OAuth apps |
| `JWT_SECRET` | — | Signs the session cookie and OAuth state |

Frontend: `BACKEND_URL` (default `http://localhost:4000`). Next.js proxies `/api/*` to the backend, so the browser talks to a single origin and the httpOnly session cookie just works.

---

## Architecture

```
                    ┌──────────────── Next.js dashboard (:3000) ───────────────┐
                    │  Login · Scheduled · Sent · Compose · Email detail        │
                    └───────────────────────────┬───────────────────────────────┘
                                                │ /api/* (proxied)
┌───────────────────────────────────────────────▼──────────────────────────────────────────┐
│ Express API (:4000)                                                                      │
│  auth (Google OAuth) · emails (schedule/list/search) · slack (OAuth) · Bull Board        │
│                                                                                          │
│  POST /api/emails/schedule                                                               │
│    1. validate + dedupe recipients                                                       │
│    2. plan send times (delay + hourly limit)                                             │
│    3. INSERT campaign + one Email row per recipient   ──► PostgreSQL (source of truth)   │
│    4. queue.addBulk(delayed job, jobId = email.id)    ──► Redis / BullMQ (AOF on)        │
│    5. index documents                                 ──► Elasticsearch (search)         │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                                │ delayed job becomes due
┌───────────────────────────────────────────────▼──────────────────────────────────────────┐
│ BullMQ worker(s)  concurrency = WORKER_CONCURRENCY, limiter = 1 job / MIN_DELAY          │
│   a. already sent/failed?            → skip              (idempotency)                   │
│   b. hourly quota (Redis Lua)        → over? move job to next hour, alert Slack once     │
│   c. claim row scheduled → sending   → lost race? skip   (no double send)                │
│   d. send via Nodemailer → Ethereal  → mark sent (+ messageId, preview URL)              │
│   e. SMTP error                      → retry with backoff, `failed` on last attempt      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**How scheduling works.** Each recipient becomes one `Email` row and one **BullMQ delayed job** whose `delay` is `scheduledAt − now`. BullMQ stores the absolute due time in Redis, so nothing polls the database and **no cron is involved** (no `node-cron`, no OS cron, no repeatable jobs; `cron-parser` appears in `node_modules` only as a BullMQ dependency for a feature we don't use).

**Code map (backend/src)**

| Path | Responsibility |
|---|---|
| `server.ts`, `app.ts` | HTTP API bootstrap, routes, Bull Board |
| `worker.ts` | Worker process: reconcile on boot, BullMQ `Worker`, graceful shutdown |
| `queue/emailQueue.ts` | Queue definition, job options, `jobId = email.id` |
| `queue/processEmail.ts` | The job processor (guards a–e above) |
| `services/scheduler.service.ts` | Send-time planning, campaign creation, enqueue, reconcile |
| `services/rateLimiter.ts` | Atomic Redis Lua quota, deferral ranking, Slack alert dedupe |
| `services/slack.service.ts` | Slack OAuth, webhook posting, alert message |
| `services/search.service.ts` | Elasticsearch index + search |
| `services/mailer.service.ts` | Nodemailer transports per sender |

**Frontend (frontend/src)** — `app/` routes (`login`, `dashboard/(inbox)/scheduled|sent`, `dashboard/compose`, `dashboard/emails/[id]`), `components/ui` (Button, Input, Badge, Avatar, Popover, EmptyState, Spinner), `components/{layout,emails,compose}` for feature components, `lib/api.ts` typed API client, `lib/types.ts` API types, `hooks/queries.ts` all React Query hooks.

---

## Rate limiting, delay & concurrency

| Mechanism | Value | Where | Shared across workers? |
|---|---|---|---|
| **Min delay between sends** | **2 seconds** (`MIN_DELAY_BETWEEN_SENDS_MS`) | BullMQ worker `limiter: { max: 1, duration }` | Yes — BullMQ's limiter lives in Redis |
| **Per-campaign delay** | "Delay between 2 emails" in Compose | Send times are spaced when scheduling | n/a (stored per email) |
| **Hourly limit per sender** | `MAX_EMAILS_PER_HOUR_PER_SENDER` (50) | Redis key `rl:sender:{id}:{YYYYMMDDHH}` | Yes |
| **Hourly limit per campaign** | "Hourly Limit" in Compose | Redis key `rl:campaign:{id}:{YYYYMMDDHH}` | Yes |
| **Concurrency** | `WORKER_CONCURRENCY` (5) per process | BullMQ `concurrency` | Each process adds its own |

**Hourly limit enforcement.** Before sending, the worker runs one Lua script that reads both counters for the current UTC clock hour and increments them **only if both are under their limit**. Being a single Lua script, the check-and-increment is atomic across any number of worker processes or machines (a test fires 20 concurrent requests at a limit of 3 and exactly 3 succeed). Keys expire after 2 hours. If the SMTP send then fails, the slot is given back.

**When the limit is reached** the job is **not dropped or failed**: the worker calls `job.moveToDelayed(nextHourStart + rank × delay)` and throws BullMQ's `DelayedError` (which does not count as an attempt). `rank` comes from a Redis counter per campaign and target hour, so deferred emails keep their original order and spacing. The `Email` row's `scheduledAt` and `deferredCount` are updated so the dashboard shows the new time.

In addition, the planner already respects `min(campaign limit, sender limit)` when it computes send times, so a single large campaign is spread across hours up front and the Scheduled tab shows realistic times. Runtime deferral handles what the planner can't know (e.g. several campaigns on one sender).

**Why the concurrency is safe.** Parallel jobs never share mutable in-memory state; every decision goes through Postgres or Redis atomics:
the quota is a Lua script, and the "claim" is `UPDATE … SET status='sending' WHERE id=? AND status='scheduled'`; only the worker whose update changed a row sends. With the 2s limiter, concurrency mainly lets slow SMTP round-trips overlap rather than increasing the start rate.

**Slack alert.** The moment a sender uses its last slot of the hour (or a job is refused), the worker posts to the user's Slack. A `SET NX` key per user + sender + hour makes sure 1,000 deferred jobs produce **one** message, not 1,000. The integration is read from the DB on every alert, so connecting/disconnecting takes effect immediately without a redeploy; if the user never connected Slack, the alert is simply skipped. A revoked webhook (404/410) removes the stored integration.

---

## Persistence & idempotency

**Restart safety**
- Delayed jobs live in Redis, which runs with **AOF persistence** (`appendonly yes`) and `maxmemory-policy noeviction` (required by BullMQ). Stopping the API/worker, or restarting Redis itself, keeps every future job with its absolute due time.
- Jobs that became due while the worker was down run as soon as it starts (still subject to the min-delay limiter).
- On startup the worker runs **`reconcileQueue()`**: it scans `Email` rows still `scheduled` and re-adds any whose job is missing from Redis (e.g. a crash between the DB commit and `addBulk`, or a wiped Redis). Because `jobId = email.id`, running it repeatedly never creates duplicates.
- `SIGINT`/`SIGTERM` → `worker.close()` lets in-flight sends finish before exit.

**Never sending twice** — three independent guards:
1. **Queue level:** `jobId = email.id`, BullMQ ignores a second job with the same id.
2. **DB status:** the worker skips emails already `sent`/`failed`.
3. **Atomic claim:** `scheduled → sending` conditional update; concurrent workers can't both win.

Plus API-level idempotency: the Compose screen sends an `Idempotency-Key` header (one per compose session), and `(userId, idempotencyKey)` is unique, so a double click or retry returns the existing campaign instead of creating a new one. Recipients are de-duplicated within a campaign (`@@unique([campaignId, recipient])`).

*Verified manually:* scheduled emails 40s ahead → stopped API + worker → restarted Redis → started again after the due time: all emails sent once each (`attempts = 1`).

---

## Behaviour under load

**1,000+ emails scheduled for the same time** (e.g. hourly limit 200, delay 2s):
1. One request inserts all rows in chunks of 1,000 (single transaction) and enqueues in `addBulk` chunks of 500.
2. The planner spreads them: 200 in the current hour (2s apart), the next 200 from the start of the next hour, and so on — 5 hours for 1,000.
3. The worker's limiter guarantees ≥ 2s between sends regardless of how many jobs are due; Redis counters guarantee the hourly cap even with several workers.
4. Anything that still exceeds a quota is moved to the next hour, in order. Nothing is dropped or failed for rate-limit reasons.

See it without sending anything:
```bash
cd backend
npm run load-test                       # prints the per-hour plan for 1,000 emails
npm run load-test -- --send 1000        # actually schedules them (to @example.com via Ethereal)
```

---

## API

All endpoints except `/health` and the OAuth callbacks need a session (`session` cookie set by Google login, or `Authorization: Bearer <token>`).

| Method & path | Description |
|---|---|
| `GET /api/auth/google` → `/callback` | Google OAuth login, sets the session cookie, redirects to `/dashboard` |
| `GET /api/auth/me` · `POST /api/auth/logout` | Current user · logout |
| `POST /api/emails/schedule` | Schedule a campaign (body below; optional `Idempotency-Key` header) |
| `GET /api/emails?tab=scheduled\|sent&page=&q=` | Paginated list; `q` searches via Elasticsearch |
| `GET /api/emails/counts` · `GET /api/emails/:id` | Tab counts · email detail |
| `GET /api/senders` · `GET /api/config` | Sender accounts · effective limits |
| `GET /api/slack/status` · `GET /api/slack/connect` · `GET /api/slack/callback` · `DELETE /api/slack` · `POST /api/slack/test` | Slack integration |
| `/admin/queues` | Bull Board |

**Testing with curl/Postman.** `npm run dev-token` (backend) prints a session token for a local test user. This is a developer convenience for API testing only; it is not reachable over HTTP and the dashboard only signs in through Google.

```bash
TOKEN=$(npm --prefix backend run -s dev-token)
SENDER=$(curl -s -H "Authorization: Bearer $TOKEN" localhost:4000/api/senders | jq -r '.senders[0].id')

curl -X POST localhost:4000/api/emails/schedule \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-1' \
  -d "{\"senderId\":\"$SENDER\",\"subject\":\"Hello\",\"body\":\"<p>Hi!</p>\",
       \"recipients\":[\"a@example.com\",\"b@example.com\"],
       \"startAt\":\"$(date -u -v+1M +%Y-%m-%dT%H:%M:%SZ)\",\"delayMs\":2000,\"hourlyLimit\":50}"
```

---

## Features → requirements

### Backend
| Requirement | Implementation |
|---|---|
| Accept scheduling requests via API | `POST /api/emails/schedule` (zod-validated) |
| Store in relational DB | PostgreSQL via Prisma (`User`, `Sender`, `Campaign`, `Email`, `SlackIntegration`) |
| BullMQ delayed jobs, no cron | One delayed job per email, `jobId = email.id` |
| Multiple senders via Ethereal | 3 auto-created Ethereal accounts, chosen per campaign ("From") |
| Searchable via Elasticsearch | Indexed on create and on every status change; dashboard search box |
| Live BullMQ dashboard | Bull Board at `/admin/queues` |
| Survives restarts, no duplicates | Redis AOF + reconcile-on-boot + 3 idempotency guards |
| Configurable worker concurrency | `WORKER_CONCURRENCY` |
| Min delay between sends | BullMQ limiter, 2s default (`MIN_DELAY_BETWEEN_SENDS_MS`) |
| Hourly limit, per sender, env-configurable, multi-worker safe | Redis Lua counters keyed by sender + hour (`MAX_EMAILS_PER_HOUR_PER_SENDER`) |
| Over limit → reschedule to next hour, keep order | `moveToDelayed` + per-campaign rank |
| Slack OAuth + live alert on limit hit | Connect Slack → OAuth v2 → incoming webhook stored per user; one alert per sender per hour |
| Slack not connected / reconnect | Skipped silently; looked up on every alert, no redeploy |
| Behaviour under load | Planner + limiter + counters, `npm run load-test` |

### Frontend
| Requirement | Implementation |
|---|---|
| Real Google login → dashboard | Google OAuth (server-side code flow), httpOnly session cookie |
| Name, email, avatar, logout | User card at the top of the sidebar (as in the Figma), menu with Logout |
| Scheduled / Sent tabs + Compose button | Sidebar navigation with live counts |
| Compose: subject, body, CSV/TXT upload with count, start time, delay, hourly limit | Compose page: chips + "+N", "N recipients" counter and toast, Send Later popover, rich-text editor |
| Scheduled table: email, subject, scheduled time, status | Time badge + "Scheduled"/"Sending…" |
| Sent table: email, subject, sent time, status | "Sent"/"Failed" badge + sent time |
| Loading / empty / error states | Skeleton rows, empty states, toasts, retry button |
| Code quality | Reusable `components/ui`, typed API client and responses, React Query hooks, no duplicated fetch logic |
| Live updates | Lists and counts refresh every 5s, so emails move from Scheduled to Sent on their own |

---

## Tests

```bash
docker compose up -d
npm --prefix backend test
```

18 tests (Vitest) against real Postgres/Redis, isolated from dev data (database `reachinbox_test`, Redis DB 1, index `emails_test`; created and migrated automatically):

- **planSendTimes** — spacing, 1,000 emails at 200/hour → exactly 200 per hour, order preserved.
- **rateLimiter** — sender vs campaign limits, **20 concurrent acquires at a limit of 3 → exactly 3**, hour rollover, release, one Slack alert per hour.
- **processEmail** — sends once; duplicate delivery skipped; **two workers on the same email → one send**; interrupted send not retried; over-limit job deferred to next hour (not dropped); SMTP failure retried then marked failed.

---

## Assumptions & trade-offs

- **At-most-once on hard crash.** If the worker process is killed *between* handing the email to SMTP and recording `sent` (a window of milliseconds), the email is left in `sending`; on retry it is marked `failed` with "Interrupted mid-send" instead of being sent again. The assignment prioritises never sending duplicates, so this errs on that side. Graceful shutdown waits for in-flight sends, so a normal stop/restart never hits this.
- **After downtime**, emails that became due while the worker was down are sent as soon as it starts, spaced by the global 2s limiter rather than the campaign's own delay.
- **Hourly windows are UTC clock hours** (`10:00–10:59`), not rolling 60-minute windows — simpler, predictable keys, and what "emails per hour" usually means for providers.
- **Global min delay.** The 2s limiter applies across all senders (models provider throttling); per-sender spacing comes from each campaign's delay.
- **Elasticsearch is best-effort.** Postgres is the source of truth; if ES is down, scheduling and sending continue and indexing errors are logged.
- **Senders are shared** Ethereal accounts (not per user); limits are per sender as required.
- **Slack via ngrok.** Slack requires an https redirect URL; ngrok's free plan shows a one-time "Visit Site" interstitial during connect.
- **Figma differences.** The paperclip/attachment feature is not implemented (no attachment support in the backend). The email/password fields on the login card are shown to match the design but only point users to Google login, as the assignment requires Google OAuth. Rows show the recipient address (no contact names are stored). Star/archive/delete icons were left out because they have no backing feature.
- **Docker** runs the infrastructure only; the API, worker and frontend run with `npm run dev`.
- **Google OAuth app is in "Testing" mode**, so only accounts added as test users can sign in.
