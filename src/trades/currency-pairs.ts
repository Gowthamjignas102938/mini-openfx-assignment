/**
 * The fixed set of currency pairs this app can actually trade, each backed
 * by a real, currently live Binance symbol (verified directly against
 * Binance's bookTicker, not just that a symbol is listed — some listed
 * pairs, like AUDUSDT/BTCAUD, return 0.00000000 bid/ask because they're
 * delisted). `base`/`quote` use this project's own currency codes (e.g.
 * "USD", not Binance's "USDT" asset code) and follow Binance's own
 * base/quote convention: a symbol's price is quote-currency units per 1
 * unit of base currency (e.g. BTCUSDT's price is USD per 1 BTC).
 *
 * This is meant to be the single source of truth for which pairs are
 * "officially" tradeable, and `GET /v1/prices/pairs` does read from here.
 * `TradesService`'s conversion logic (`convertAmount()`/
 * `CURRENCY_TO_BINANCE_ASSET` in `trades.service.ts`) currently does NOT —
 * it independently re-derives direction by concatenating currency codes,
 * so it will accept any live Binance symbol whose two assets match the
 * requested currencies, not only the five listed below. That's a known
 * gap (see README's "Assumptions & scope"), not something fixed here
 * silently — closing it would mean `TradesService` importing and checking
 * against this list too.
 */
export interface CurrencyPair {
  symbol: string;
  base: string;
  quote: string;
}

export const TRADEABLE_PAIRS: readonly CurrencyPair[] = [
  { symbol: 'BTCUSDT', base: 'BTC', quote: 'USD' },
  { symbol: 'EURUSDT', base: 'EUR', quote: 'USD' },
  { symbol: 'BTCEUR', base: 'BTC', quote: 'EUR' },
  { symbol: 'USDTMXN', base: 'USD', quote: 'MXN' },
  { symbol: 'BTCMXN', base: 'BTC', quote: 'MXN' },
];
