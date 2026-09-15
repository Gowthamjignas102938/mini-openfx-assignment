import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Price } from '../api/types';

export function PricesView() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [price, setPrice] = useState<Price | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
