import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Price, TradeablePair } from '../api/types';

export function PricesView() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [price, setPrice] = useState<Price | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pairs, setPairs] = useState<TradeablePair[]>([]);
  const [pairsLoading, setPairsLoading] = useState(true);
  const [pairsError, setPairsError] = useState<string | null>(null);

  // Fetched once on mount — these are the fixed, backend-defined tradeable
  // pairs, not something that needs re-fetching on user action the way a
  // manual lookup does.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.getTradeablePairs();
        if (!cancelled) setPairs(result);
      } catch (err) {
        if (!cancelled) {
          setPairsError(err instanceof ApiError ? err.message : 'Something went wrong.');
        }
      } finally {
        if (!cancelled) setPairsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFetchPrice() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getPrice(symbol.trim());
      setPrice(result);
    } catch (err) {
      setPrice(null);
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Prices</h2>

      <div className="mb-6">
        <h3 className="mb-2 text-sm font-medium text-slate-700">Tradeable pairs</h3>

        {pairsLoading && <p className="text-sm text-slate-500">Loading…</p>}

        {pairsError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{pairsError}</p>
        )}

        {!pairsLoading && !pairsError && (
          <table className="w-full overflow-hidden rounded-md border border-slate-200 text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                <th className="px-3 py-2 font-medium">Pair</th>
                <th className="px-3 py-2 font-medium">Bid</th>
                <th className="px-3 py-2 font-medium">Ask</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((pair) => (
                <tr
                  key={pair.symbol}
                  onClick={() => setSymbol(pair.symbol)}
                  className="cursor-pointer border-t border-slate-200 hover:bg-slate-50"
                >
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {pair.base}/{pair.quote}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-700">{pair.bid}</td>
                  <td className="px-3 py-2 font-mono text-slate-700">{pair.ask}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
          disabled={loading || !symbol.trim()}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Fetching…' : 'Get Price'}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {price && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-slate-200 p-4 text-sm">
          <dt className="text-slate-500">Symbol</dt>
          <dd className="font-medium text-slate-900">{price.symbol}</dd>
          <dt className="text-slate-500">Bid</dt>
          <dd className="font-medium text-slate-900">{price.bid}</dd>
          <dt className="text-slate-500">Ask</dt>
          <dd className="font-medium text-slate-900">{price.ask}</dd>
          <dt className="text-slate-500">Fetched at</dt>
          <dd className="font-medium text-slate-900">
            {new Date(price.timestamp).toLocaleTimeString()}
          </dd>
          <dt className="text-slate-500">Source</dt>
          <dd className="font-medium text-slate-900">{price.source}</dd>
        </dl>
      )}
    </div>
  );
}
