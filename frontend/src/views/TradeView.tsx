import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Price, Trade } from '../api/types';

const PREVIEW_DEBOUNCE_MS = 300;

// Trade currencies are limited to ones with a real, currently live Binance
// symbol (verified directly against Binance's bookTicker, not just that a
// symbol is listed — some listed pairs, like AUDUSDT/BTCAUD, return
// 0.00000000 bid/ask because they're delisted). USD -> BTCUSDT, EUR ->
// EURUSDT/BTCEUR, MXN -> USDTMXN/BTCMXN all have live prices. INR (no
// Binance pair at all) and AUD (listed but dead) are left out — they still
// appear as real seeded balances on the Balances tab, just not tradeable.
const CURRENCIES = ['USD', 'BTC', 'EUR', 'MXN'];
const PRICE_VALIDITY_SECONDS = 15;

export function TradeView() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('BTC');
  const [fromAmount, setFromAmount] = useState('100');

  const [price, setPrice] = useState<Price | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<Trade | null>(null);

  const [preview, setPreview] = useState<{ toAmount: string; toCurrency: string } | null>(null);

  const hasValidPrice = price !== null && secondsLeft > 0;

  // Client-side countdown mirroring the backend's real 15s Redis TTL — a UX
  // hint, not the source of truth. The server's cache is what actually
  // decides; this just helps the person understand why a late submit fails.
  useEffect(() => {
    if (fetchedAt === null) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - fetchedAt) / 1000);
      setSecondsLeft(Math.max(0, PRICE_VALIDITY_SECONDS - elapsed));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [fetchedAt]);

  // Live "you'll get ~X" estimate, debounced so it doesn't fire on every
  // keystroke. Reuses the exact same conversion math as the real trade
  // (via GET /v1/trades/preview -> TradesService.previewTrade(), which
  // shares convertAmount()/toBinanceAsset() with executeTrade()) rather
  // than re-implementing it here. Only runs while there's still a live
  // cached price — a stale/expired quote can't be previewed, same as it
  // can't be traded against.
  useEffect(() => {
    if (!hasValidPrice) {
      setPreview(null);
      return;
    }
    const amount = Number(fromAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .previewTrade({ fromCurrency, toCurrency, fromAmount: amount, symbol: symbol.trim() })
        .then((result) => {
          if (!cancelled) setPreview({ toAmount: result.toAmount, toCurrency });
        })
        .catch(() => {
          // A 409 (price expired mid-typing) or any other preview failure —
          // this is just an estimate, not the real trade, so fail quietly
          // rather than showing a scary error while someone is still typing.
          if (!cancelled) setPreview(null);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // hasValidPrice (not raw secondsLeft) is the dependency on purpose: it
    // only flips true<->false at the moment a price is fetched or expires,
    // whereas secondsLeft changes every second. Depending on secondsLeft
    // directly would tear down and restart this debounce timer once a
    // second the whole time a price is valid, firing a preview request
    // roughly every second instead of only when the person actually types.
  }, [fromAmount, fromCurrency, toCurrency, symbol, hasValidPrice]);

  async function handleFetchPrice() {
    setPriceLoading(true);
    setPriceError(null);
    setResult(null);
    try {
      const fetched = await api.getPrice(symbol.trim());
      setPrice(fetched);
      setFetchedAt(Date.now());
    } catch (err) {
      setPrice(null);
      setFetchedAt(null);
      setPriceError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setPriceLoading(false);
    }
  }

  async function handleSubmitTrade() {
    setSubmitting(true);
    setSubmitError(null);
    setResult(null);
    try {
      const trade = await api.createTrade({
        fromCurrency,
        toCurrency,
        fromAmount: Number(fromAmount),
        symbol: symbol.trim(),
      });
      setResult(trade);
      // A used or expired quote can't be reused — clear it so the next
      // trade has to start from a fresh GET /v1/prices, same as the API
      // itself enforces server-side.
      setPrice(null);
      setFetchedAt(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
        // A 409 specifically means "your cached price is gone" — reflect
        // that in the UI immediately rather than leaving a stale quote
        // displayed as if it were still usable.
        if (err.statusCode === 409) {
          setPrice(null);
          setFetchedAt(null);
        }
      } else {
        setSubmitError('Something went wrong.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Trade</h2>

      <div className="space-y-4 rounded-md border border-slate-200 p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Symbol</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. BTCUSDT"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <button
              onClick={handleFetchPrice}
              disabled={priceLoading || !symbol.trim()}
              className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {priceLoading ? 'Fetching…' : 'Fetch Price'}
            </button>
          </div>
        </div>

        {priceError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{priceError}</p>
        )}

        {price && (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
            <p>
              Bid <span className="font-mono font-medium">{price.bid}</span> · Ask{' '}
              <span className="font-mono font-medium">{price.ask}</span>
            </p>
            <p className={secondsLeft > 0 ? 'text-slate-500' : 'font-medium text-red-600'}>
              {secondsLeft > 0
                ? `Valid for ${secondsLeft}s`
                : 'Expired — fetch a new price before trading.'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">From</label>
            <select
              value={fromCurrency}
              onChange={(e) => setFromCurrency(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">To</label>
            <select
              value={toCurrency}
              onChange={(e) => setToCurrency(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Amount</label>
          <input
            type="number"
            min="0"
            step="any"
            value={fromAmount}
            onChange={(e) => setFromAmount(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          {preview && (
            <p className="mt-1 text-xs text-slate-500">
              ≈ {preview.toAmount} {preview.toCurrency}{' '}
              <span className="text-slate-400">(estimate)</span>
            </p>
          )}
        </div>

        <button
          onClick={handleSubmitTrade}
          disabled={submitting || !hasValidPrice || Number(fromAmount) <= 0}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Executing…' : 'Execute Trade'}
        </button>

        {!hasValidPrice && (
          <p className="text-center text-xs text-slate-400">
            Fetch a price first — a trade can only execute against one that's currently cached.
          </p>
        )}

        {submitError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>
        )}

        {result && (
          <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            <p className="font-medium">Trade #{result.id} executed.</p>
            <p>
              {result.fromAmount} {result.fromCurrency} → {result.toAmount} {result.toCurrency}{' '}
              at rate {result.rate}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
