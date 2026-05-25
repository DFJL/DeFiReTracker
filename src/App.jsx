import { useState, useMemo, useEffect } from 'react'
import { usePortfolios } from './hooks/usePortfolios'
import { useTransactions } from './hooks/useTransactions'
import { usePrices } from './hooks/usePrices'
import { PortfolioSwitcher } from './components/PortfolioSwitcher'
import { Dashboard } from './components/Dashboard'
import { HoldingsTable } from './components/HoldingsTable'
import { TransactionManager } from './components/TransactionManager'
import { CsvImporter } from './components/CsvImporter'
import { PolymarketTracker } from './components/PolymarketTracker'
import { supabase } from './lib/supabase'

const TABS = ['Dashboard', 'Holdings', 'Transactions', 'Import CSV', 'Polymarket']

export default function App() {
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [portfolioId, setPortfolioId] = useState(null)

  const { portfolios, userId, loading: loadingPortfolios, loadError, createPortfolio, claimPortfolio, sharePortfolio, deletePortfolio } = usePortfolios()

  // Auto-select the first portfolio so Claim/Share buttons are immediately visible
  useEffect(() => {
    if (portfolios.length > 0 && !portfolioId) setPortfolioId(portfolios[0].id)
  }, [portfolios])
  const { transactions, loading: loadingTx, upsertTransaction, deleteTransaction, reload: reloadTx } = useTransactions(portfolioId)

  const assets = useMemo(() => {
    const seen = new Map()
    for (const tx of transactions) {
      if (tx.asset && !seen.has(tx.asset.id)) seen.set(tx.asset.id, tx.asset)
    }
    return [...seen.values()]
  }, [transactions])

  const coingeckoIds = useMemo(() => assets.map(a => a.coingecko_id), [assets])
  const { prices, changes, lastUpdated, loading: loadingPrices, refresh: refreshPrices } = usePrices(coingeckoIds)

  async function handlePortfolioDelete(id) {
    await deletePortfolio(id)
    setPortfolioId(null)
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-surface-1 px-4 md:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <span className="text-accent font-semibold tracking-tight whitespace-nowrap text-sm md:text-base">DeFiReTracker</span>
            <span className="text-border hidden sm:inline">|</span>
            {loadingPortfolios ? (
              <span className="text-xs text-gray-600">Loading…</span>
            ) : loadError ? (
              <span className="text-xs text-red-400" title={loadError}>⚠ {loadError}</span>
            ) : (
              <PortfolioSwitcher
                portfolios={portfolios}
                userId={userId}
                selected={portfolioId}
                onSelect={setPortfolioId}
                onCreate={async name => {
                  const { data, error } = await createPortfolio(name)
                  if (error) alert(`Could not create portfolio: ${error.message}`)
                  if (data) setPortfolioId(data.id)
                }}
                onDelete={handlePortfolioDelete}
                onClaim={claimPortfolio}
                onShare={sharePortfolio}
              />
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500">
            {lastUpdated && (
              <span className="hidden sm:inline">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={refreshPrices}
              disabled={loadingPrices}
              className="px-2 py-1 rounded border border-border hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
            >
              {loadingPrices ? '…' : '↻'}
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="px-2 py-1 rounded border border-border hover:border-red-500 hover:text-red-400 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Tab bar — scrollable on mobile */}
      <nav className="border-b border-border bg-surface-1 px-4 md:px-6 overflow-x-auto">
        <div className="max-w-7xl mx-auto flex gap-0 min-w-max">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 md:px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
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
      <main className="flex-1 px-4 md:px-6 py-4 md:py-6">
        <div className="max-w-7xl mx-auto">
          {!portfolioId && activeTab !== 'Import CSV' && activeTab !== 'Polymarket' && (
            <div className="mb-4 bg-surface-1 border border-border rounded-lg p-4 text-sm text-gray-400">
              Create or select a portfolio above to get started.
            </div>
          )}

          {activeTab === 'Dashboard' && (
            <Dashboard
              transactions={transactions}
              assets={assets}
              prices={prices}
              changes={changes}
            />
          )}

          {activeTab === 'Holdings' && (
            <HoldingsTable
              transactions={transactions}
              assets={assets}
              prices={prices}
              changes={changes}
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

          {activeTab === 'Polymarket' && (
            <PolymarketTracker />
          )}
        </div>
      </main>
    </div>
  )
}
