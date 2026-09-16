# Deploying MiniOpenFX (Render)

Chosen over Railway/Fly.io because Render's `render.yaml` **Blueprint** can
declare the API, the Postgres database, the Redis instance, and the static
frontend as one version-controlled file — the whole infrastructure is
reviewable in a PR, not clicked together by hand in a dashboard. Everything
below except account creation and one URL cross-check is already done and
committed to this repo.

## What's already in place

- **`Dockerfile`** — multi-stage build for the NestJS API. Production image
  runs `npm ci --omit=dev`, so `drizzle-kit` (a devDependency) is not shipped.
- **`src/db/migrate.ts`** — a small production migration runner using
  `drizzle-orm`'s own programmatic migrator (not the `drizzle-kit` CLI, which
  isn't in the production image). Compiles to `dist/db/migrate.js`.
- **`render.yaml`** — the Blueprint: `miniopenfx-db` (Postgres),
  `miniopenfx-redis` (Redis-compatible Key Value store), `miniopenfx-api`
  (the Dockerized NestJS service), and `miniopenfx-frontend` (the static
  Vite build). Migrations + seed run automatically on every container boot
  (chained into the Dockerfile's `CMD`, since `preDeployCommand` needs a
  paid Render plan and this is deployed on `plan: free`) — both steps are
  idempotent, so this is safe on every cold start or restart, not just the
  first one.

## The part only you can do (needs your Render login)

1. Push this branch (already done if you're reading this after the commit).
2. On [render.com](https://render.com) → **New** → **Blueprint** → connect
   the `mini-openfx` GitHub repo → Render reads `render.yaml` and shows the
   four resources above → **Apply**.
3. Set `API_KEY` on `miniopenfx-api` in the Render dashboard to a real
   generated secret before going live — it's `sync: false` in `render.yaml`
   specifically so it's never committed; Render will prompt for it during
   Apply, or it can be added afterward under the service's Environment tab.
   Then set `VITE_API_KEY` on `miniopenfx-frontend` to that exact same
   value — Render can't cross-reference one service's manual secret into
   another, so this one has to be copied by hand.
4. First deploy takes a few minutes (Postgres provisions, the Docker image
   builds, then the container boots — running migrations, then the seed,
   then the actual server, in that order, per the Dockerfile's `CMD`).
5. Once `miniopenfx-api` has a real URL, check it matches
   `VITE_API_BASE_URL` in `render.yaml` (`https://miniopenfx-api.onrender.com/v1`).
   Render usually keeps the exact name you gave the service, but if it
   suffixed it for uniqueness, update that one line and push again — the
   frontend won't be able to reach the API otherwise.
6. Open the `miniopenfx-frontend` URL — that's your deployed app.

## Known free-tier caveats (worth knowing, not blockers)

- **Free Postgres self-destructs 30 days after creation** (14-day grace
  period first). Fine for a demo; for anything longer-lived, upgrade the
  `miniopenfx-db` plan in `render.yaml` before day 30.
- **Free Redis (`keyvalue`) is in-memory only** — a restart or plan change
  clears it. Harmless here: every cached price is meant to expire in 15
  seconds anyway (see the Field Guide, module 04).
- **Free web services spin down after 15 minutes idle** — the first request
  after a quiet period will be noticeably slow (cold start) while Render
  boots the container back up.
- Render's Blueprint field names shift occasionally between doc versions —
  if the dashboard's blueprint editor flags a schema error on `render.yaml`,
  paste the exact error back into Claude Code; it's almost always one field
  name (this file was written against Render's Sept 2026 Blueprint spec).

## Not done here, worth doing before this is more than a demo

- `app.enableCors()` in `src/bootstrap.ts` currently allows every origin —
  fine while the frontend URL isn't final, worth locking to the real
  frontend origin once deployed.
- No `DATABASE_URL`/`REDIS_URL` are needed in `.env` for production — Render
  injects both automatically via the `fromDatabase`/`fromService` links in
  `render.yaml`. `.env` stays a local-only file (already gitignored).
