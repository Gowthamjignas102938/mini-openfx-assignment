# MiniOpenFX — Project Memory & Working Agreement

This file is read automatically by Claude Code at the start of every session in
this folder. It exists so a fresh session picks up exactly where a prior one
(here, or in the Claude chat this project was planned in) left off — read it
in full before doing anything else, including before answering a question
that seems simple.

## What this project is

An API-only FX quoting + trading service (no UI in the graded scope) built
against a real assignment brief. A client can: fetch indicative currency
prices, view balances per currency, execute a trade converting one currency
into another, and retrieve trade history. Modelled loosely on real
cross-border FX/payments platforms (we researched the real company "OpenFX"
for grounding — B2B, API-integrated, no end-user UI — which is why "API-only"
is the actual shape of the business being modelled, not a corner being cut).

The brief explicitly evaluates: product thinking (sensible scope, stated
assumptions), API design, data modelling, code quality, and reliability
(expiry handling, validation). Simplicity and correctness are rewarded over
feature count — do not add scope the brief didn't ask for without flagging it
first.

## Locked-in scope decisions (do not silently change these)

- **Single hardcoded demo wallet.** No auth, no `clients`/users table. Every
  endpoint operates on "the" one wallet.
- **Balances are seeded automatically at startup** with fixed starting
  amounts. No funding/deposit endpoint.
- **A fetched price is valid for 15 seconds.** A trade attempted against an
  older price must be rejected and forced to re-fetch. This is the project's
  answer to the brief's "reliability: expiry handling" criterion.
- **Simple financial model, on purpose:** one `trades` table, one `balances`
  table. No separate persisted `quotes` resource, no `ledger_entries` /
  cached-balances split. The 15-second validity check happens inline inside
  the trade request, not as its own stored object.
- **Stack, exactly as the brief names it — do not substitute:** TypeScript,
  NestJS (with Express), PostgreSQL, Redis (price cache), Drizzle ORM, Jest
  for tests, GitHub Actions CI (lint, typecheck, test).
- **Frontend: React + Tailwind CSS** — but explicitly a *bonus*, built only
  after the graded backend (Modules 00–13 in the field guide) is solid and
  submittable. Never let frontend work displace backend/test/CI work.
- **Deliberately considered and rejected**, worth naming in the README's
  trade-offs section rather than silently forgetting: a richer
  indicative-price / firm-quote / ledger-entries model, idempotency keys, a
  real `clients` + API-key auth table, and an alternate stack (Hono, Zod,
  Vitest, Neon serverless Postgres). All reasonable ideas, all consciously
  set aside for a simpler, faster-to-build shape given the time available.

## Working agreement — how to operate in this project

> **MODE CHANGE (2026-09-15):** attempt-first is over. Claude now writes the
> real implementations directly instead of handing over tasks. The reason for
> attempt-first hasn't gone away, though — the person still wants to deeply
> understand this project — so the teaching obligation moves to explanation:
> every module still gets a plain-language walkthrough of what was built and
> why, at the point it's built, not deferred to the end. Rules 1 and 5–7 below
> still apply in full; rules 2–4 (hand over the task, don't write whole files
> unprompted) are superseded — writing whole files/modules directly is now the
> default, not a fallback.

1. **Explain the concept before any code** — plain language, define new terms
   as they come up, assume nothing is obvious.
2. ~~Hand over a task, not a solution, by default.~~ **Superseded by the mode
   change above** — Claude now implements modules directly.
3. ~~Do not generate whole files or apply large edits unprompted.~~
   **Superseded** — whole files/modules are written directly now.
4. ~~A fallback is fine when the person is stuck.~~ **Moot** — there's no
   attempt to fall back from anymore.
5. **Whenever code is written or changed, explain exactly what changed and
   why, in plain terms a beginner can follow** — not a terse diff summary.
   Assume the person will be asked to explain this code later and needs to
   actually understand it, not just have it work. This is the load-bearing
   rule post-mode-change: it's the entire mechanism by which the person still
   learns the project.
6. **When something breaks, walk through the diagnosis out loud** — what the
   error actually means, what it rules in/out, before stating the fix.
7. **Build and commit one module at a time**, in order, with its own
   explanation and its own commit — never a giant multi-module rewrite in one
   pass. Update "Current status" below as each module actually lands, so this
   file stays accurate without needing to be relayed back from Claude chat.

## Current status

Last updated by Claude, 2026-09-15, after the Module 8 audit and the
mode change to direct implementation.

- **Module 00 (orientation/product thinking): done.** Scope decisions above
  are final.
- **Module 01 (environment/tooling): done.** Repo initialized, connected to
  GitHub (`github.com/Gowthamjignas102938/mini-openfx`).
- **Module 02 (NestJS foundations): done.** Observe SDK fully removed
  (confirmed gone from `main.ts`, `package.json`, and `nest-cli.json`;
  `npm run start:dev` boots with zero errors). `RatesModule`
  (`GET /rates/hello`) is still present — its teaching purpose has been
  served and it's safe to delete; not yet done, low priority cleanup.
- **Module 03/04 (database): done.** Postgres via Docker (isolated
  container/port/volume), Drizzle schema (`balances`, `trades`), migration
  applied to a real database, idempotent seed script
  (`onConflictDoNothing`). Verified end-to-end.
- **Module 05/06 (prices + Redis cache): done.** `GET /prices` fetches
  Binance bid/ask, cached in Redis with a 15s TTL (cache-aside) — this TTL
  *is* the mechanism behind the project's price-validity rule. Upstream
  failures map to 400 (bad symbol)/502 (unreachable or malformed), never a
  bare 500. Verified: repeat calls inside the window return an identical
  cached timestamp; `TTL` on the key reads exactly 15.
- **Module 07 (balances): done.** `GET /balances`, `GET /balances/:currency`
  (404 on unknown currency).
- **Module 08 (trades): done, re-audited 2026-09-15.** `POST /trades` calls
  `PricesService.getCachedPriceOnly()` (Redis-only, never calls Binance;
  409 on a cache miss), then executes debit + credit + trade-insert inside
  one `db.transaction()`. Re-verified live after the audit: cache-miss still
  409s, a real trade moves exact amounts and inserts a correct row,
  insufficient funds still rolls back completely (checked directly against
  the database, not just the HTTP response).
- **Module 09 (trade history): done.** `GET /trades`, newest-first (ordered
  by `id`, not `created_at`, to stay unambiguous on same-millisecond
  trades), optional `?limit=` clamped to [1, 200] with a default of 50.
  Verified live.
- **Module 10 (versioning/errors/validation): not started.** No
  `class-validator`/`ValidationPipe` yet — `POST /trades`'s body is just a
  TypeScript interface, so a malformed request throws unhandled rather than
  a clean 400. No API versioning (`/v1/...`) yet either.
- **Module 11 (testing): not started.** Vitest is installed; nothing
  written. Note: the brief's locked-in stack says Jest, but the actual
  scaffold shipped with Vitest — flagged, not yet resolved either way.
- **Module 12 (CI/CD): not started.** No GitHub Actions workflow.
- **Module 13 (docs/demo/deployment): not started.** No README yet; no
  Loom video; no deployment.
- **Module 14 (React + Tailwind frontend): explicitly deferred.** Bonus
  only, after 00–13 are solid — do not start this without being asked.

A living project overview (architecture, data model, the 15s-expiry
mechanism, trade-offs) is maintained in Notion — ask the person for the
link if it's not already in context, rather than assuming it's stale.

## First thing to do in a new session

Don't assume the above is still accurate. Inspect the actual repo (file
tree, `git log`, `package.json`, and the contents of `src/`) and reconcile
reality against "Current status" above before doing anything else — this
project has already had cases this session where a file was believed
changed/saved but wasn't. Report back, in plain language, what's actually
implemented and verified, what's implemented but unverified, and what
genuinely hasn't been started.
