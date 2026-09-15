# MiniOpenFX

An API-only FX quoting + trading service. A client can fetch an indicative
currency price, view balances per currency, execute a trade converting one
currency into another, and retrieve trade history — all over a small,
versioned REST API. No UI in the graded scope: this is modelled loosely on
real cross-border FX/payments platforms (B2B, API-integrated, no end-user
UI), so "API-only" is the actual shape of the product being modelled, not a
corner being cut.

- **Loom walkthrough:** _add link here before submitting_
- **Deployed instance:** _not deployed — see [What I'd do next](#what-id-do-next)_

---

## Contents

- [Architecture](#architecture)
- [Data model](#data-model)
- [API reference](#api-reference)
- [Setup & running locally](#setup--running-locally)
- [Testing](#testing)
- [Design decisions & trade-offs](#design-decisions--trade-offs)
- [Assumptions & scope](#assumptions--scope)
- [What I'd do next](#what-id-do-next)

---

## Architecture

```
Client
  |
  v
NestJS API (versioned under /v1)
  |-- PricesModule   -> Binance REST API (bid/ask)  <-cache-aside, 15s TTL-> Redis
  |-- BalancesModule -> Postgres (balances)
  |-- TradesModule   -> Postgres (balances, trades), reads cached prices via PricesService
```

Each domain is its own NestJS module (controller + service, wired through
dependency injection). `PricesModule` is the only thing that talks to
Binance or Redis; `TradesModule` never touches either directly — it goes
through `PricesService.getCachedPriceOnly()`, which only ever reads Redis
and never calls Binance. That separation keeps "fetching a price" and
"trading against a price" as two distinct concerns that can't silently blur
into each other.

**Why this matters for reliability:** a fetched price is cached in Redis with
a 15-second TTL (`SET ... EX 15`). That TTL *is* the mechanism behind this
project's price-validity rule — Redis itself expires the cached price after
15 seconds, so a trade attempted against a stale price finds nothing cached
(`getCachedPriceOnly` returns `null`) and is rejected with `409 Conflict`,
forcing a fresh `GET /v1/prices` call. There's no separate stored "quote"
object and no manual timestamp comparison — the cache's own expiry
enforces the rule.

## Data model

Two tables, deliberately simple — see [Trade-offs](#design-decisions--trade-offs)
for what was consciously left out.

**`balances`**

| Column       | Type                  | Notes                                      |
|--------------|-----------------------|---------------------------------------------|
| `currency`   | `varchar(3)`, PK      | `USD` / `INR` / `BTC`, seeded at startup    |
| `amount`     | `numeric(18,6)`       | Exact decimal — handled as strings in TS, never floats |
| `updated_at` | `timestamp`           | defaults to `now()`                          |

**`trades`**

| Column                        | Type              | Notes                              |
|-------------------------------|-------------------|-------------------------------------|
| `id`                          | `serial`, PK      |                                      |
| `from_currency` / `to_currency` | `varchar(3)`   |                                      |
| `from_amount` / `to_amount`   | `numeric(18,6)`   |                                      |
| `rate`                        | `numeric(18,8)`   | the cached price's `bid` at execution time |
| `created_at`                  | `timestamp`       | defaults to `now()`                  |

## API reference

Every route lives under `/v1`, except the root health check.

### `GET /`

```bash
curl http://localhost:3000/
```
```
Hello World!
```

### `GET /v1/prices?symbol=`

Fetches Binance bid/ask for a symbol, cache-aside via Redis (15s TTL).

```bash
curl "http://localhost:3000/v1/prices?symbol=BTCUSDT"
```
```json
{"symbol":"BTCUSDT","bid":77567.44,"ask":77567.45,"timestamp":1789451780622,"source":"binance"}
```

Errors: `400` if `symbol` is missing or Binance rejects it as unknown; `502`
if Binance is unreachable or returns something unparseable.

### `GET /v1/balances`

```bash
curl http://localhost:3000/v1/balances
```
```json
[{"currency":"INR","amount":"0.000000","updatedAt":"..."},{"currency":"USD","amount":"10000.000000","updatedAt":"..."},{"currency":"BTC","amount":"0.000000","updatedAt":"..."}]
```

### `GET /v1/balances/:currency`

```bash
curl http://localhost:3000/v1/balances/USD
```

`404` if the currency doesn't exist.

### `POST /v1/trades`

Executes a trade against a **currently cached** price — fetch one via
`GET /v1/prices` first.

```bash
curl -X POST http://localhost:3000/v1/trades \
  -H "Content-Type: application/json" \
  -d '{"fromCurrency":"USD","toCurrency":"BTC","fromAmount":100,"symbol":"BTCUSDT"}'
```
```json
{"id":1,"fromCurrency":"USD","toCurrency":"BTC","fromAmount":"100.000000","toAmount":"7756744.000000","rate":"77567.44000000","createdAt":"..."}
```

Errors:
- `409 Conflict` — no valid price is currently cached for `symbol` (it
  either was never fetched, or its 15-second window has expired).
- `400 Bad Request` — validation failure (`fromCurrency`/`toCurrency` not
  exactly 3 characters, `fromAmount` not a positive number, an unknown
  extra field), an unknown currency, or insufficient balance.

Both balance updates and the trade-history insert happen inside one
database transaction — either all three writes land, or none do. Verified
directly: a deliberately oversized trade is rejected with `400` and leaves
balances and the `trades` table completely unchanged.

### `GET /v1/trades`

Trade history, newest-first.

```bash
curl "http://localhost:3000/v1/trades?limit=10"
```

`limit` is optional, clamped to `[1, 200]`, defaults to `50`.

## Setup & running locally

Requires Docker and Node 22+.

```bash
# 1. Install dependencies
npm install

# 2. Start Postgres + Redis (isolated to this project — own ports, own volumes)
docker compose up -d

# 3. Copy the env template (defaults already match docker-compose.yml)
cp .env.example .env

# 4. Apply migrations
npm run db:migrate

# 5. Seed starting balances (USD 10000, INR 0, BTC 0) — safe to re-run
npm run db:seed

# 6. Run the app
npm run start:dev
```

The API is now at `http://localhost:3000`.

## Testing

```bash
npm run lint        # oxlint
npm run typecheck    # tsc --noEmit
npm test             # unit + integration tests (needs Postgres + Redis running)
npm run test:e2e     # e2e test over real HTTP via supertest
```

`PricesService` is unit-tested with a mocked HTTP client and Redis client —
no real network calls. `TradesService` and `BalancesService` are
integration-tested against the real Postgres container, since what's
actually under test (transaction atomicity, insufficient-funds rollback) is
exactly the kind of behavior a mocked database couldn't meaningfully verify.

CI (`.github/workflows/ci.yml`) runs this same sequence — plus a real
migrate + seed — against fresh Postgres/Redis service containers on every
push.

## Design decisions & trade-offs

**Deliberately considered and rejected**, in favor of a simpler, faster-to-build
shape given the time available:

- **A richer indicative-price / firm-quote / ledger-entries model.** An
  earlier design sketch had separate `quotes` and `ledger_entries` tables, a
  firm quote issued before execution, and idempotency keys on trades. This
  build instead has one `trades` table and one `balances` table, with the
  15-second validity check happening inline (via Redis's own TTL expiry) at
  trade time, not as its own stored, stateful object.
- **Auth / multi-tenancy.** No `clients` table, no API keys — a single
  hardcoded demo wallet. The brief doesn't require multi-client auth, and
  adding one would be scope the evaluation criteria doesn't ask for.
- **A funding/deposit endpoint.** Balances are seeded automatically at
  startup instead (`npm run db:seed`, idempotent via `onConflictDoNothing`).
- **An alternate stack** (Hono, Zod, Vitest, Neon serverless Postgres) —
  considered, set aside in favor of the brief's named stack (NestJS,
  Drizzle, Jest, a locally-run Postgres/Redis via Docker).

**One substitution, flagged rather than silent:** the initial scaffold
shipped with Vitest instead of Jest. Vitest was kept briefly, then switched
to Jest to match the brief's named stack once testing was underway — this
did require real ESM configuration work (`ts-jest`'s ESM preset,
`--experimental-vm-modules`, a `moduleNameMapper` to resolve `.js` imports
back to `.ts` source) since this project runs as native ESM under
`moduleResolution: nodenext`.

## Assumptions & scope

- A single demo wallet holds three currencies: `USD`, `INR`, `BTC`.
- "Indicative price" means whatever Binance's `bookTicker` returns for the
  given symbol — this project doesn't independently source or validate
  prices beyond that.
- A trade's `symbol` (e.g. `BTCUSDT`) isn't cross-validated against its
  `fromCurrency`/`toCurrency` pair — a client could technically pass a
  `symbol` unrelated to the two currencies. Not enforced; noted as a known
  gap rather than fixed silently.
- No pagination beyond a simple `limit` on trade history — no cursor-based
  paging, matching the "simpler model" decision above.

## What I'd do next

- Deploy the service (Render/Railway/Fly.io) with a managed Postgres +
  Redis — explicit bonus, not done here for time reasons.
- Validate that a trade's `symbol` actually corresponds to its
  `fromCurrency`/`toCurrency` pair.
- The bonus React + Tailwind frontend (explicitly out of scope until the
  graded backend, Modules 00–13, is solid).
