# MiniOpenFX — Frontend

A minimal React + Tailwind CSS client for the MiniOpenFX API. No auth (the backend has none), no router (four tabs on one page). Functional over polished — this isn't a design-evaluated part of the assignment.

## Setup

```bash
npm install
cp .env.example .env   # defaults to http://localhost:3000/v1
npm run dev
```

Requires the backend running separately (`../README.md`) with CORS enabled (`app.enableCors()` in `main.ts`).

## Views

- **Prices** — look up a Binance symbol, see the current bid/ask.
- **Balances** — all three wallet balances at a glance.
- **Trade** — fetch a price first (starts a visible countdown mirroring the backend's real 15s Redis TTL), then submit. Handles and clearly displays every error the backend can return: `409` (stale/missing price), `400` (insufficient funds, unknown currency, validation failures).
- **Trade History** — a table using the backend's actual `?limit=` cap (no cursor-based pagination — the backend doesn't have one, so this doesn't pretend to).

## Structure

- `src/api/client.ts` — one small typed `fetch` wrapper; normalizes every backend error response into a single readable `ApiError.message`.
- `src/views/` — one component per capability, each fetching its own data.
- `src/App.tsx` — tab shell, no routing library.
