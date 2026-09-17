# MiniOpenFX

An API-only FX quoting + trading service. A client can fetch an indicative
currency price, view balances per currency, execute a trade converting one
currency into another, and retrieve trade history — all over a small,
versioned REST API. No UI in the graded scope: this is modelled loosely on
real cross-border FX/payments platforms (B2B, API-integrated, no end-user
UI), so "API-only" is the actual shape of the product being modelled, not a
corner being cut.

- **Loom walkthrough:** _add link here before submitting_
- **Deployed instance:** [Live app](https://miniopenfx-frontend.onrender.com) · [API base](https://miniopenfx-api.onrender.com/v1) — see [DEPLOY.md](./DEPLOY.md) for how this was deployed (Render Blueprint: Postgres + Redis + Dockerized API + static frontend, all co-located in `singapore` since Binance blocks US-region IPs). Free-tier caveats apply — see DEPLOY.md (the API may take ~30s to wake up from an idle spin-down on first request).

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
| `currency`   | `varchar(3)`, PK      | `USD` / `INR` / `BTC` / `EUR` / `MXN`, seeded at startup |
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

Every route lives under `/v1`, except the root health check. Every `/v1/*`
route requires an `X-API-Key` header matching the server's `API_KEY`
environment variable — one shared secret for the whole API, not a
per-client key (there's still no `clients` table; see Design decisions
below). A request with a missing or wrong key gets `401 Unauthorized`
before it reaches any route handler.

### `GET /`

No `X-API-Key` required — health checks and uptime monitors can't be
expected to send a secret header.

```bash
curl http://localhost:3000/
```
```
Hello World!
```

### `GET /v1/prices?symbol=`

Fetches Binance bid/ask for a symbol, cache-aside via Redis (15s TTL).

```bash
curl "http://localhost:3000/v1/prices?symbol=BTCUSDT" \
  -H "X-API-Key: $API_KEY"
```
```json
{"symbol":"BTCUSDT","bid":77567.44,"ask":77567.45,"timestamp":1789451780622,"source":"binance"}
```

Errors: `400` if `symbol` is missing or Binance rejects it as unknown; `502`
if Binance is unreachable or returns something unparseable.

### `GET /v1/prices/pairs`

Lists the five currency pairs this app actually treats as tradeable
(`TRADEABLE_PAIRS` in `src/trades/currency-pairs.ts`), each with a live
bid/ask pulled through the same cache-aside `getPrice()` path as the
endpoint above — so listing pairs costs no extra Binance calls beyond
normal caching. Powers the frontend's Prices tab table (click a row to
fill the lookup above).

```bash
curl http://localhost:3000/v1/prices/pairs \
  -H "X-API-Key: $API_KEY"
```
```json
[{"symbol":"BTCUSDT","base":"BTC","quote":"USD","bid":77567.44,"ask":77567.45},
 {"symbol":"EURUSDT","base":"EUR","quote":"USD","bid":1.0842,"ask":1.0843},
 {"symbol":"BTCEUR","base":"BTC","quote":"EUR","bid":71532.10,"ask":71534.90},
 {"symbol":"USDTMXN","base":"USD","quote":"MXN","bid":18.42,"ask":18.44},
 {"symbol":"BTCMXN","base":"BTC","quote":"MXN","bid":1429000.0,"ask":1429500.0}]
```

### `GET /v1/balances`

```bash
curl http://localhost:3000/v1/balances \
  -H "X-API-Key: $API_KEY"
```
```json
[{"currency":"INR","amount":"0.000000","updatedAt":"..."},{"currency":"USD","amount":"10000.000000","updatedAt":"..."},{"currency":"BTC","amount":"0.000000","updatedAt":"..."}]
```

### `GET /v1/balances/:currency`

```bash
curl http://localhost:3000/v1/balances/USD \
  -H "X-API-Key: $API_KEY"
```

`404` if the currency doesn't exist.

### `POST /v1/trades`

Executes a trade against a **currently cached** price — fetch one via
`GET /v1/prices` first.

```bash
curl -X POST http://localhost:3000/v1/trades \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
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

### `GET /v1/trades/preview`

Read-only: shows what a trade *would* return, against the same currently
cached price `POST /v1/trades` would use, without touching the database or
balances at all (no transaction, no writes — just `convertAmount()` run
against the cached price). Powers the Trade tab's live "≈ X CURRENCY"
estimate as the amount field is typed (debounced client-side).

```bash
curl "http://localhost:3000/v1/trades/preview?fromCurrency=USD&toCurrency=BTC&fromAmount=100&symbol=BTCUSDT" \
  -H "X-API-Key: $API_KEY"
```
```json
{"fromAmount":"100.000000","toAmount":"0.001289","rate":"77567.44000000","symbol":"BTCUSDT"}
```

Errors: same `409 Conflict` as `POST /v1/trades` if no valid price is
currently cached for `symbol`; `400` for the same validation failures
(currencies must differ and be exactly 3 characters, `fromAmount` must be
a positive number).

### `GET /v1/trades`

Trade history, newest-first.

```bash
curl "http://localhost:3000/v1/trades?limit=10" \
  -H "X-API-Key: $API_KEY"
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

# 5. Seed starting balances (USD 10000, INR 0, BTC 0, EUR 0, MXN 0) — safe to re-run
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
npm run test:e2e     # e2e tests over real HTTP via supertest
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
- **Auth / multi-tenancy.** Still no `clients` table — a single hardcoded
  demo wallet. What auth exists (added later, once the brief's assignment
  wrapper explicitly required protecting the API) is one shared `API_KEY`
  checked on every `/v1/*` request, not per-client keys. The brief doesn't
  require multi-client auth, and adding one would be scope the evaluation
  criteria doesn't ask for.
- **The shared API key isn't a real secret once it's in the React
  frontend.** If the frontend calls this API directly with the key
  embedded client-side (e.g. a `VITE_API_KEY` baked into the Vite build and
  read into a fetch header), anyone can read it straight out of the
  browser's network tab or the shipped JS bundle — a build-time env var in
  a static frontend isn't confidential. Worth naming honestly rather than
  implying this makes the API actually private: for this assignment's
  scope (a single shared secret, no real per-user accounts either way) it
  keeps casual/automated hits off the API, which is the actual goal here,
  not defense against a targeted attacker with browser dev tools open. A
  real deployment would need the frontend to talk to a backend-for-frontend
  or session layer instead of holding the shared secret itself.
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

- A single demo wallet holds five currencies: `USD`, `INR`, `BTC`, `EUR`,
  `MXN`.
- "Indicative price" means whatever Binance's `bookTicker` returns for the
  given symbol — this project doesn't independently source or validate
  prices beyond that.
- **Which currencies are actually tradeable is limited by what Binance
  genuinely quotes live, not just what's listed.** Each candidate was
  checked directly against Binance's `bookTicker` endpoint, not just its
  symbol list, since some listed symbols are delisted and return
  `0.00000000`/`0.00000000`:
  - `USD` trades via `BTCUSDT`; `EUR` via `EURUSDT`/`BTCEUR`; `MXN` via
    `USDTMXN`/`BTCMXN` — all confirmed live. The frontend's Trade tab lists
    `USD`/`BTC`/`EUR`/`MXN`.
  - `INR` has **no** Binance pair at all (not even a delisted one) — left
    out of trading entirely.
  - `AUD` **was requested and rejected**: `AUDUSDT`/`BTCAUD` are listed in
    Binance's symbol list but delisted (`status: BREAK`), and their live
    `bookTicker` returns zero bid/ask — same practical failure as `INR`,
    just less obvious from the symbol list alone.
  - `USDT` was also requested and rejected as a *separate* tradeable
    currency: it's already what `USD` maps to internally
    (`CURRENCY_TO_BINANCE_ASSET` in `trades.service.ts`), so there's no
    distinct Binance pair to convert between "USD" and "USDT" as two
    different things.
  - Both `INR` and `AUD` still appear as real seeded balances on the
    Balances tab — they're just excluded from the Trade tab's dropdowns.
  - One real limitation this leaves: there's no direct `EUR`/`MXN` Binance
    symbol (only `EURMXN`-shaped guesses, both invalid), so a trade
    directly between those two specifically still hits "Cannot determine
    trade direction" — same as any other pair without a matching Binance
    symbol. Not a bug; this project only ever resolves one Binance symbol
    per trade, never a triangulated route through a third currency.
- A trade's `symbol` (e.g. `BTCUSDT`) **is** validated against its
  `fromCurrency`/`toCurrency` pair — `convertAmount()` in `trades.service.ts`
  rejects a mismatch with `400 Cannot determine trade direction` (this
  wasn't always true; see the conversion-direction bugfix below). What's
  **not** enforced: whether that symbol is actually one of the five pairs
  this project treats as "tradeable" (`TRADEABLE_PAIRS` in
  `currency-pairs.ts`) — any live Binance symbol whose two assets match
  `fromCurrency`/`toCurrency` will execute, even one outside that fixed
  list. Noted as a known gap rather than fixed silently; restricting trades
  to exactly the five listed pairs would be a real (if small) scope
  decision, not a bug fix.
- No pagination beyond a simple `limit` on trade history — no cursor-based
  paging, matching the "simpler model" decision above.

## What I'd do next

- **Deployed** — see the links at the top of this file and [DEPLOY.md](./DEPLOY.md)
  for the Render Blueprint setup (Postgres + Redis + Dockerized API +
  static frontend).
- **Frontend built and deployed** — a React + Vite app covering Prices
  (with the tradeable-pairs table), Trade (with the live preview),
  Balances, and Trade History, talking to the API with the shared
  `X-API-Key`.
- **Trade `symbol`-vs-currency validation is in place** — `convertAmount()`
  rejects a mismatched symbol with `400`; see "Assumptions & scope" above
  for the one remaining related gap (a trade isn't restricted to exactly
  the five `TRADEABLE_PAIRS`, just to *some* live Binance symbol matching
  the requested currencies).
- Restrict `POST /v1/trades` / `GET /v1/trades/preview` to exactly the
  five pairs in `TRADEABLE_PAIRS`, instead of accepting any live Binance
  symbol whose two assets match the requested currencies.
- Per-client API keys / real multi-tenancy, if this ever needed to serve
  more than one demo wallet.
