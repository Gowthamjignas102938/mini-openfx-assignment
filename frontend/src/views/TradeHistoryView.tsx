import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Trade } from '../api/types';

export function TradeHistoryView() {
  const [limit, setLimit] = useState(50);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getTradeHistory(limit);
      setTrades(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Trade History</h2>
        <div className="flex items-center gap-2 text-sm">
          {/* The backend only supports a ?limit= cap (max 200) — no
              cursor-based pagination, matching the project's deliberately
              simpler data model. This "Show last N" input is the accurate
              reflection of that, not a stand-in for real paging. */}
          <label className="text-slate-500">Show last</label>
          <input
            type="number"
            min={1}
            max={200}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 1)}
            className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button
            onClick={load}
            disabled={loading}
            className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">From</th>
              <th className="px-3 py-2 font-medium">To</th>
              <th className="px-3 py-2 font-medium">Rate</th>
              <th className="px-3 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {trades.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2 text-slate-500">{t.id}</td>
                <td className="px-3 py-2 font-mono">
                  {t.fromAmount} {t.fromCurrency}
                </td>
                <td className="px-3 py-2 font-mono">
                  {t.toAmount} {t.toCurrency}
                </td>
                <td className="px-3 py-2 font-mono">{t.rate}</td>
                <td className="px-3 py-2 text-slate-500">
                  {new Date(t.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && trades.length === 0 && !error && (
          <p className="px-3 py-4 text-center text-sm text-slate-500">No trades yet.</p>
        )}
      </div>
    </div>
  );
}
