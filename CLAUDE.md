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
- **Frontend: React + Tailwind CSS** — **changed 2026-09-15: no longer an
  optional bonus, now a mandatory part of the project.** Sequencing is
  unchanged: it's still built only after the graded backend (Modules
  00–13) is solid and submittable, on the person's own explicit
  instruction. Never let frontend work displace backend/test/CI work in
  progress.
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

Last updated by Claude, 2026-09-16, after adding the tradeable-pairs list
and live trade preview on top of the Module 14 frontend.

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
- **Module 10 (versioning/errors/validation): done.** Every route now lives
  under `/v1/...` (`app.enableVersioning`), except the root `GET /` health
  route, explicitly `VERSION_NEUTRAL`. Global `ValidationPipe`
  (whitelist + forbidNonWhitelisted + transform) plus `CreateTradeDto`
  actually validate `POST /trades`'s body at runtime. Verified live: bad
  type, missing field, unknown extra field, wrong-length currency, and
  negative amount are all rejected with a specific 400.
- **Module 11 (testing): done.** Switched Vitest → Jest (resolves the
  stack discrepancy; asked the person directly rather than deciding
  alone, since CLAUDE.md flags stack substitutions as a no-silent-change
  item — chose Jest per the brief). Configured for this project's native
  ESM + nodenext (ts-jest ESM preset, --experimental-vm-modules). 15
  unit/integration tests (`PricesService` unit-tested with mocked
  HTTP/Redis; `TradesService`/`BalancesService` integration-tested
  against the real Postgres container, since transaction/atomicity is
  exactly what's under test) + 1 e2e test via supertest
  (`npm run test:e2e`). `npm run typecheck` added. All green.
- **Module 12 (CI/CD): done.** `.github/workflows/ci.yml`: Postgres +
  Redis as service containers, then npm ci → lint → typecheck → build →
  migrate → seed → unit/integration tests → e2e tests. Simulating this
  locally first (fresh throwaway containers, no `.env`, real env vars)
  caught a real bug — test fixtures used `.update()`, a silent no-op on
  an unseeded database — fixed to `onConflictDoUpdate` (upsert). Pushed
  and confirmed genuinely green on GitHub Actions (run 34938582400, all
  green in 46s), not just locally.
- **Module 13 (docs/demo/deployment): README done, two pieces genuinely
  need the person, not Claude.** `README.md` has architecture, data
  model, API reference (every curl example actually run and its real
  response captured — not hand-typed), setup instructions (matches
  what CI runs), testing, and design decisions/trade-offs. Also removed
  the long-flagged `RatesModule` placeholder (teaching purpose served
  back in Module 02). Still open: (1) record and link the 5-10 min Loom
  walkthrough the brief requires — a presentation-plan outline for it
  already exists in the Notion doc; (2) optional bonus deployment
  (Render/Railway/Fly.io) — not attempted, no cloud credentials
  available and it's explicitly bonus, not mandatory.
- **Module 14 (React + Tailwind frontend): done.** Backend re-verified
  solid first (per explicit instruction) — `/v1` versioning, validation,
  and error handling spot-checked live; full suite green; GitHub Actions
  green. That check caught a real bug the *previous* push had introduced
  (a cross-file test race — `TradesService`/`BalancesService` specs share
  one real Postgres database as fixture, and Jest runs spec files in
  parallel workers by default; GitHub's runner hit the race, 5 local
  reproduction attempts didn't — fixed with `maxWorkers: 1`). Built
  `frontend/`: Vite + React + TS + Tailwind CSS v4, no router (four tabs,
  not four routes). Four views — Prices, Balances, Trade (fetch-then-
  submit with a live 15s countdown mirroring the backend's real Redis
  TTL; every error case — 409 stale price, 400 insufficient funds/unknown
  currency/validation — shown with the backend's own specific message),
  Trade History (the backend's real `?limit=` cap, no fake pagination).
  `app.enableCors()` added to the backend's `main.ts` — never needed
  before since nothing browser-based talked to the API. Verified for real
  in an actual browser (claude-in-chrome): all four views clicked
  through against the real backend, including both the trade success
  path and a live 409 (the 15s window genuinely expired mid-test),
  console clean. A second real regression caught and fixed after that:
  adding `frontend/` under the repo root broke the backend's
  `npm run typecheck`, since the root `tsconfig.json`'s default `**/*`
  include (from the Module 11 rootDir change) picked up frontend's React
  files with no idea how to typecheck them — fixed by excluding
  `frontend` in the root tsconfig; confirmed both typecheck independently
  clean.
- **Independent adversarial code review (2026-09-15): done, findings fixed.**
  On the person's explicit request, delegated a full review to a genuinely
  fresh agent — zero context from this conversation, instructed to treat
  every claim in CLAUDE.md/README/Notion as unverified rather than trust
  the project's own account of itself. It found two critical bugs and one
  high-severity issue, all independently re-confirmed by manual code trace
  before fixing (not taken on faith), and all re-attempted live against
  the fix afterward to prove the exploits are actually closed:
  - **Same-currency trade minted money.** `executeTrade()` read `toBalance`
    before debiting `fromBalance`; a `fromCurrency === toCurrency` trade
    silently erased the debit while the credit still applied — a $100
    same-currency "trade" turned into a ~$7.69M balance increase,
    repeatable at will. Fixed at the validation layer (a custom
    `IsDifferentCurrency` class-validator constraint in
    `create-trade.dto.ts`), rejecting the request with `400` before it
    ever reaches `TradesService`.
  - **No row locking — lost updates under concurrency.** Two concurrent
    trades against the same currency could both read the same starting
    balance and both commit, leaving `balances` and `trades` mutually
    inconsistent. Fixed with `SELECT ... FOR UPDATE` on both balance rows
    in one statement, locked in a fixed alphabetical-by-currency order
    (not from/to order, which flips by trade direction) so two concurrent
    trades on the same pair in opposite directions can't deadlock each
    other.
  - **Money arithmetic used plain JS `Number()`/`String()`** on Postgres
    `numeric` strings — floating point, not exact decimal, contradicting
    the README's explicit claim. Replaced with `decimal.js` throughout
    `TradesService`; schema and string I/O unchanged, only the math.
  - Regression tests added for all three (a DTO unit test, a real e2e
    HTTP test proving the DB is never touched, a concurrent-trades test,
    and a decimal-divergence test with an empirically-verified diverging
    value) — the review noted zero coverage existed for any of them.
  - Also fixed while in there: `@nestjs/observe` fully removed (flagged
    dead weight since Module 02, never actually uninstalled until now);
    one stray uncommitted formatting diff cleaned up.
  - **Deliberately left alone, not by oversight:** the review's two
    low-severity findings — inconsistent manual validation on GET
    endpoints (cosmetic, not exploitable) and fully open CORS (acceptable
    given the locked no-auth scope decision) — were flagged and
    consciously not touched, on the person's explicit instruction.
  - Verified twice before pushing: once against the persistent local
    database, once against a fresh throwaway Postgres/Redis with no
    `.env` (same conditions as CI). Confirmed genuinely green on GitHub
    Actions afterward, not just locally.

- **Second real bug, found by hand during a manual walkthrough (2026-09-16):**
  not by an adversarial review this time — caught while explaining
  `TradesService.executeTrade()` line by line and actually running a live
  trade through the API to demonstrate it, which produced 7,716,670 "BTC"
  from a 100 USD trade.
  - **Conversion always multiplied, never divided.** `toAmount` was computed
    as `fromAmount.times(price.bid)` unconditionally. A Binance symbol like
    `BTCUSDT` quotes price as "USDT per 1 BTC" — multiplying is only correct
    going base -> quote (BTC -> USD); the ordinary "buy BTC with USD"
    direction (quote -> base) needs division. Every quote-to-base trade
    silently over-credited the recipient currency.
  - Root cause of it shipping unnoticed: the *existing* test for this method
    only ever exercised the buggy direction (USD -> BTC) and asserted the
    wrong multiplied result (~1000 BTC from 10 USD) as if it were correct —
    a test that encodes the bug it should have caught.
  - Fixed with a new `convertAmount()` helper in `trades.service.ts` that
    resolves which currency is the symbol's base vs. quote side (mapping
    this project's `USD` to Binance's `USDT` asset code, since Binance has
    no literal "USD" asset), multiplies or divides accordingly, and rejects
    with `400` if the symbol doesn't match the currency pair at all rather
    than guessing.
  - Regression tests added for both directions explicitly (quote -> base
    and base -> quote), asserting the actual numeric result, plus a test for
    the symbol-mismatch rejection. The previous test's incorrect expected
    value was corrected rather than left alongside the new ones.
  - Verified twice: full suite (`npm test`, `npm run test:e2e`) green, and a
    real live trade against the running app (100 USD -> BTC at a real fetched
    price) produced the mathematically correct 0.001317 BTC with matching
    balance changes, not just a passing assertion.

- **Post-Module-14 frontend/backend additions (2026-09-16): done.** Two
  small features layered on top of the already-shipped frontend, each its
  own commit:
  - **`GET /v1/prices/pairs`**: returns `{symbol, base, quote, bid, ask}`
    for the five fixed tradeable pairs, fetched through the existing
    `getPrice()` cache-aside method (no new/separate Binance-calling path).
    The pair list itself was pulled out of a comment in `TradeView.tsx`
    into one real shared constant, `src/trades/currency-pairs.ts`
    (`TRADEABLE_PAIRS`), so it has a single source of truth on the backend.
    The Prices tab now fetches this on mount and shows all five as a
    clickable table above the existing manual symbol lookup (clicking a
    row fills the lookup input); the manual lookup itself is unchanged.
  - **`GET /v1/trades/preview`**: a read-only `TradesService.previewTrade()`
    that mirrors the first half of `executeTrade()` exactly — same
    `getCachedPriceOnly()` call, same 409 on a cache miss, same shared
    `convertAmount()`/`toBinanceAsset()` conversion math — but stops before
    any balance lookup, row lock, or `db.transaction()`. Zero DB access.
    The Trade tab now shows a debounced (~300ms) "≈ X CURRENCY (estimate)"
    line under the Amount field while a cached price is still valid;
    any preview failure (expired price mid-typing, or otherwise) just
    clears the estimate rather than showing an error, since it's a
    low-stakes UI hint, not the real trade.
  - New tests: two service tests for `getTradeablePairs()` (cache hit and
    cache-miss-falls-through-to-Binance) in `prices.service.spec.ts`; four
    tests for `previewTrade()` in a new, deliberately separate
    `trades.service.preview.spec.ts` — separate specifically because it
    needs no real Postgres (previewTrade never touches the database),
    unlike `trades.service.spec.ts`'s real-Postgres integration tests for
    `executeTrade()`.
  - Verified: `npm run lint`, `npm run typecheck`, and `npm test` all green
    on both the backend and (via its own `tsc -b`/`oxlint`) the frontend,
    aside from one pre-existing, unrelated failure in
    `balances.service.spec.ts` (asserts only 3 seeded currencies; the seed
    now has 5, since EUR/MXN were added per the commit above Module 13's
    entry) — confirmed via `git stash` that this failure predates and is
    unrelated to both of these additions.
  - Not done, flagged rather than silently skipped: `TradeView.tsx`'s own
    hardcoded `CURRENCIES` array/comment was left as-is rather than also
    deriving it from the new pairs endpoint — the frontend (Vite) and
    backend (Nest) are separate TS projects with separate `tsconfig`s (see
    the Module 14 entry above on why `frontend/` is excluded from the root
    one), so `TradeView.tsx` can't directly import `currency-pairs.ts`;
    unifying it would mean having `TradeView` call `GET /v1/prices/pairs`
    itself, which wasn't part of what was asked for this pass.

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
