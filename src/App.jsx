import { useState, useMemo } from 'react'
import { usePortfolios } from './hooks/usePortfolios'
import { useTransactions } from './hooks/useTransactions'
import { usePrices } from './hooks/usePrices'
import { PortfolioSwitcher } from './components/PortfolioSwitcher'
import { Dashboard } from './components/Dashboard'
import { HoldingsTable } from './components/HoldingsTable'
import { TransactionManager } from './components/TransactionManager'
import { CsvImporter } from './components/CsvImporter'

const TABS = ['Dashboard', 'Holdings', 'Transactions', 'Import CSV']

export default function App() {
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [portfolioId, setPortfolioId] = useState(null)

  const { portfolios, loading: loadingPortfolios, createPortfolio, deletePortfolio } = usePortfolios()
  const { transactions, loading: loadingTx, upsertTransaction, deleteTransaction, reload: reloadTx } = useTransactions(portfolioId)

  const assets = useMemo(() => {
    const seen = new Map()
    for (const tx of transactions) {
      if (tx.asset && !seen.has(tx.asset.id)) seen.set(tx.asset.id, tx.asset)
    }
    return [...seen.values()]
  }, [transactions])

  const coingeckoIds = useMemo(() => assets.map(a => a.coingecko_id), [assets])
  const { prices, lastUpdated, loading: loadingPrices, refresh: refreshPrices } = usePrices(coingeckoIds)

  async function handlePortfolioDelete(id) {
    await deletePortfolio(id)
    setPortfolioId(null)
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-surface-1 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-accent font-semibold tracking-tight">DeFiReTracker</span>
            <span className="text-border">|</span>
            {loadingPortfolios ? (
              <span className="text-xs text-gray-600">Loading…</span>
            ) : (
              <PortfolioSwitcher
                portfolios={portfolios}
                selected={portfolioId}
                onSelect={setPortfolioId}
                onCreate={async name => {
                  const { data } = await createPortfolio(name)
                  if (data) setPortfolioId(data.id)
                }}
                onDelete={handlePortfolioDelete}
              />
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500">
            {lastUpdated && (
              <span>
                Prices updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={refreshPrices}
              disabled={loadingPrices}
              className="px-2.5 py-1 rounded border border-border hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
            >
              {loadingPrices ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="border-b border-border bg-surface-1 px-6">
        <div className="max-w-7xl mx-auto flex gap-0">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-accent text-gray-100'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          {!portfolioId && activeTab !== 'Import CSV' && (
            <div className="mb-4 bg-surface-1 border border-border rounded-lg p-4 text-sm text-gray-400">
              Create or select a portfolio above to get started.
            </div>
          )}

          {activeTab === 'Dashboard' && (
            <Dashboard
              transactions={transactions}
              assets={assets}
              prices={prices}
            />
          )}

          {activeTab === 'Holdings' && (
            <HoldingsTable
              transactions={transactions}
              assets={assets}
              prices={prices}
            />
          )}

          {activeTab === 'Transactions' && (
            <TransactionManager
              portfolioId={portfolioId}
              transactions={transactions}
              onUpsert={upsertTransaction}
              onDelete={deleteTransaction}
            />
          )}

          {activeTab === 'Import CSV' && (
            <CsvImporter
              portfolioId={portfolioId}
              onImported={reloadTx}
            />
          )}
        </div>
      </main>
    </div>
  )
}
