import { useState } from 'react';
import { PricesView } from './views/PricesView';
import { BalancesView } from './views/BalancesView';
import { TradeView } from './views/TradeView';
import { TradeHistoryView } from './views/TradeHistoryView';

const TABS = [
  { key: 'prices', label: 'Prices', Component: PricesView },
  { key: 'balances', label: 'Balances', Component: BalancesView },
  { key: 'trade', label: 'Trade', Component: TradeView },
  { key: 'history', label: 'Trade History', Component: TradeHistoryView },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('prices');

  const ActiveComponent = TABS.find((t) => t.key === activeTab)?.Component ?? PricesView;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <h1 className="text-xl font-semibold text-slate-900">MiniOpenFX</h1>
          <p className="text-sm text-slate-500">FX quoting + trading, demo wallet</p>
        </div>
      </header>

      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl gap-1 px-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <ActiveComponent />
      </main>
    </div>
  );
}

export default App;
