import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Balance } from '../api/types';

export function BalancesView() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getBalances();
      setBalances(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-md">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Balances</h2>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="divide-y divide-slate-200 rounded-md border border-slate-200">
        {balances.map((b) => (
          <div key={b.currency} className="flex items-center justify-between px-4 py-3">
            <span className="font-medium text-slate-900">{b.currency}</span>
            <span className="font-mono text-sm text-slate-700">{b.amount}</span>
          </div>
        ))}
        {!loading && balances.length === 0 && !error && (
          <p className="px-4 py-3 text-sm text-slate-500">No balances found.</p>
        )}
      </div>
    </div>
  );
}
