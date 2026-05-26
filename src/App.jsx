import { useState, useMemo, useEffect } from 'react'
import { usePortfolios } from './hooks/usePortfolios'
import { useTransactions } from './hooks/useTransactions'
import { usePrices } from './hooks/usePrices'
import { usePolymarket } from './hooks/usePolymarket'
import { PortfolioSwitcher } from './components/PortfolioSwitcher'
import { Dashboard } from './components/Dashboard'
import { HoldingsTable } from './components/HoldingsTable'
import { TransactionManager } from './components/TransactionManager'
import { CsvImporter } from './components/CsvImporter'
import { PolymarketTracker } from './components/PolymarketTracker'
import { supabase } from './lib/supabase'
import { lookupCoinGeckoId } from './lib/priceService'

const TABS = [
  { id: 'Dashboard',    label: 'Dashboard',   short: 'Home',   icon: IconDashboard },
  { id: 'Holdings',     label: 'Holdings',    short: 'Assets', icon: IconHoldings },
  { id: 'Transactions', label: 'Transactions',short: 'Txs',    icon: IconTxs },
  { id: 'Import CSV',   label: 'Import CSV',  short: 'Import', icon: IconImport },
  { id: 'Polymarket',   label: 'Polymarket',  short: 'PMKT',   icon: IconPmkt },
]

function IconDashboard({ cls }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  )
}
function IconHoldings({ cls }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}
function IconTxs({ cls }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}
function IconImport({ cls }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
function IconPmkt({ cls }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" />
    </svg>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [portfolioId, setPortfolioId] = useState(null)

  const { portfolios, userId, loading: loadingPortfolios, loadError, createPortfolio, claimPortfolio, sharePortfolio, deletePortfolio } = usePortfolios()

  useEffect(() => {
    if (portfolios.length > 0 && !portfolioId) setPortfolioId(portfolios[0].id)
  }, [portfolios])

  const { transactions, loading: loadingTx, upsertTransaction, deleteTransaction, batchDelete, bulkInsert, reload: reloadTx } = useTransactions(portfolioId)

  const assets = useMemo(() => {
    const seen = new Map()
    for (const tx of transactions) {
      if (tx.asset && !seen.has(tx.asset.id)) seen.set(tx.asset.id, tx.asset)
    }
    return [...seen.values()]
  }, [transactions])

  const coingeckoIds = useMemo(() => assets.map(a => a.coingecko_id), [assets])
  const { prices, changes, lastUpdated, loading: loadingPrices, refresh: refreshPrices } = usePrices(coingeckoIds)

  // Polymarket — lifted to app level so positions flow into Holdings & Txs
  const pmkt = usePolymarket(portfolioId)

  async function handlePortfolioDelete(id) {
    await deletePortfolio(id)
    setPortfolioId(null)
  }

  async function updateAsset(assetId, updates) {
    const { error } = await supabase.from('assets').update(updates).eq('id', assetId)
    if (!error) { reloadTx(); refreshPrices() }
    return { error }
  }

  async function autoFixAssets() {
    const unlinked = assets.filter(a => prices[a.coingecko_id] == null)
    if (!unlinked.length) return
    const lookups = await Promise.all(unlinked.map(a => lookupCoinGeckoId(a.symbol)))
    for (let i = 0; i < unlinked.length; i++) {
      const match = lookups[i]
      if (match && match.id !== unlinked[i].coingecko_id) {
        await supabase.from('assets')
          .update({ coingecko_id: match.id, name: match.name })
          .eq('id', unlinked[i].id)
      }
    }
    reloadTx()
    refreshPrices()
  }

  const activeTabDef = TABS.find(t => t.id === activeTab) ?? TABS[0]

  return (
    <div className="min-h-screen bg-surface flex flex-col pb-16 md:pb-0">
      {/* Header */}
      <header className="border-b border-border bg-surface-1 px-4 md:px-6 py-3 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            <span className="text-accent font-semibold tracking-tight whitespace-nowrap text-sm md:text-base flex-shrink-0">
              DeFiReTracker
            </span>
            <span className="text-border hidden sm:inline flex-shrink-0">|</span>
            <div className="min-w-0 flex-1">
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
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500 flex-shrink-0">
            {lastUpdated && (
              <span className="hidden lg:inline">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={refreshPrices}
              disabled={loadingPrices}
              title="Refresh prices"
              className="px-2 py-1 rounded border border-border hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
            >
              {loadingPrices ? '…' : '↻'}
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="px-2 py-1 rounded border border-border hover:border-red-500 hover:text-red-400 transition-colors"
            >
              <span className="hidden sm:inline">Sign out</span>
              <span className="sm:hidden">↩</span>
            </button>
          </div>
        </div>
      </header>

      {/* Desktop tab bar */}
      <nav className="border-b border-border bg-surface-1 px-4 md:px-6 overflow-x-auto hidden md:block">
        <div className="max-w-7xl mx-auto flex gap-0 min-w-max">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                activeTab === tab.id
                  ? 'border-accent text-gray-100'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
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
              pmktSummary={pmkt.summary}
            />
          )}

          {activeTab === 'Holdings' && (
            <HoldingsTable
              transactions={transactions}
              assets={assets}
              prices={prices}
              changes={changes}
              pmktPositions={pmkt.open}
              onUpdateAsset={updateAsset}
              onAutoFix={autoFixAssets}
            />
          )}

          {activeTab === 'Transactions' && (
            <TransactionManager
              portfolioId={portfolioId}
              transactions={transactions}
              onUpsert={upsertTransaction}
              onDelete={deleteTransaction}
              onBatchDelete={batchDelete}
              onBulkInsert={bulkInsert}
            />
          )}

          {activeTab === 'Import CSV' && (
            <CsvImporter
              portfolioId={portfolioId}
              onImported={reloadTx}
            />
          )}

          {activeTab === 'Polymarket' && (
            <PolymarketTracker
              portfolioId={portfolioId}
              portfolioName={portfolios.find(p => p.id === portfolioId)?.name}
              pmkt={pmkt}
            />
          )}
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-1 border-t border-border">
        <div className="flex">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
                  isActive ? 'text-accent' : 'text-gray-600 hover:text-gray-400'
                }`}
              >
                <Icon cls="w-5 h-5" />
                <span className="text-[10px] leading-none">{tab.short}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
