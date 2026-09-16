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
 * This is the single source of truth for which pairs are tradeable —
 * both `GET /v1/prices/pairs` and `TradesService`'s conversion logic
 * should read from here rather than re-deriving the list.
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
