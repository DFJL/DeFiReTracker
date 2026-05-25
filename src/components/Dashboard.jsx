import { useMemo, useState } from 'react'
import { fmtUsd, fmtPct, pnlClass } from '../utils/format'
import { computeAssetPnl, aggregatePortfolio } from '../utils/pnl'
import { usePortfolioHistory } from '../hooks/usePortfolioHistory'
import { PortfolioChart } from './PortfolioChart'
import { AllocationChart } from './AllocationChart'

function StatBox({ label, value, sub, valueClass = '' }) {
  return (
    <div className="bg-surface-1 border border-border rounded-lg px-4 py-3">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-xl font-semibold num leading-tight ${valueClass}`}>{value}</p>
      {sub && <p className={`text-xs mt-0.5 num ${valueClass}`}>{sub}</p>}
    </div>
  )
}

export function Dashboard({ transactions, assets, prices, changes, pmktSummary }) {
  const { timeline, loading: loadingHistory, assetChanges } = usePortfolioHistory(transactions, assets)
  const [topPerfPeriod, setTopPerfPeriod] = useState('1D')

  const assetRows = useMemo(() => {
    return assets
      .map(asset => {
        const txs = transactions.filter(t => t.asset_id === asset.id)
        if (!txs.length) return null
        const price = prices[asset.coingecko_id]
        const pnl = computeAssetPnl(txs, price)
        return { ...asset, ...pnl }
      })
      .filter(Boolean)
  }, [transactions, assets, prices])

  const { totalValue, totalUnrealized, totalRealized, totalInvested, unrealizedPct, byCategory } =
    useMemo(() => aggregatePortfolio(assetRows), [assetRows])

  // 24h portfolio change
  const { change24hUsd, change24hPct } = useMemo(() => {
    let prevValue = 0
    for (const row of assetRows) {
      const chg = changes[row.coingecko_id]
      if (chg != null && row.currentValue > 0) {
        const prevPrice = (row.currentPrice ?? 0) / (1 + chg / 100)
        prevValue += row.qty * prevPrice
      }
    }
    return {
      change24hUsd: prevValue > 0 ? totalValue - prevValue : null,
      change24hPct:  prevValue > 0 ? ((totalValue - prevValue) / prevValue) * 100 : null,
    }
  }, [assetRows, changes, totalValue])

  // Top performer — period-aware
  const topPerformer = useMemo(() => {
    let changesForPeriod
    if (topPerfPeriod === '1D') {
      changesForPeriod = changes
    } else {
      const key = topPerfPeriod === '7D' ? 'change7d' : 'change30d'
      changesForPeriod = {}
      for (const [cgId, v] of Object.entries(assetChanges)) changesForPeriod[cgId] = v[key]
    }
    let best = null, bestPct = -Infinity
    for (const row of assetRows) {
      const chg = changesForPeriod[row.coingecko_id]
      if (chg != null && row.currentValue > 0 && chg > bestPct) {
        bestPct = chg; best = { symbol: row.symbol, pct: chg }
      }
    }
    return best
  }, [assetRows, changes, assetChanges, topPerfPeriod])

  return (
    <div className="space-y-4">
      {/* Header stats — CoinGecko-style */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
        <div className="bg-surface-1 border border-border rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-xs text-gray-500">Current Balance</p>
            {pmktSummary && (
              <span className="text-xs px-1 py-0.5 rounded bg-violet-900/40 text-violet-400">+PMKT</span>
            )}
          </div>
          <p className="text-xl font-semibold num leading-tight">
            {fmtUsd(totalValue + (pmktSummary?.value ?? 0))}
          </p>
        </div>
        <StatBox
          label="24h Portfolio Change"
          value={change24hUsd != null ? fmtUsd(change24hUsd) : '—'}
          sub={change24hPct != null ? fmtPct(change24hPct) : undefined}
          valueClass={change24hUsd != null ? pnlClass(change24hUsd) : ''}
        />
        <StatBox
          label="Total Profit / Loss"
          value={fmtUsd(totalUnrealized + totalRealized)}
          sub={`Unrealized ${fmtUsd(totalUnrealized)}  ·  Realized ${fmtUsd(totalRealized)}`}
          valueClass={pnlClass(totalUnrealized + totalRealized)}
        />
        <div className="bg-surface-1 border border-border rounded-lg px-4 py-3">
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-xs text-gray-500">Top Performer</p>
            <div className="flex gap-0.5">
              {['1D','7D','30D'].map(p => (
                <button key={p} onClick={() => setTopPerfPeriod(p)}
                  className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                    topPerfPeriod === p ? 'bg-surface-3 text-gray-100' : 'text-gray-500 hover:text-gray-300'
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <p className={`text-xl font-semibold num leading-tight ${topPerformer ? pnlClass(topPerformer.pct) : ''}`}>
            {topPerformer ? topPerformer.symbol : '—'}
          </p>
          {topPerformer && (
            <p className={`text-xs mt-0.5 num ${pnlClass(topPerformer.pct)}`}>{fmtPct(topPerformer.pct)}</p>
          )}
        </div>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3">
        <StatBox label="Invested (cost basis)" value={fmtUsd(totalInvested + (pmktSummary?.invested ?? 0))} />
        <StatBox
          label="Unrealized PnL"
          value={fmtUsd(totalUnrealized)}
          sub={fmtPct(unrealizedPct)}
          valueClass={pnlClass(totalUnrealized)}
        />
        <StatBox
          label="Realized PnL"
          value={fmtUsd(totalRealized)}
          valueClass={pnlClass(totalRealized)}
        />
      </div>

      {/* Timeline chart */}
      <PortfolioChart timeline={timeline} loading={loadingHistory} />

      {/* Allocation chart with toggle */}
      <AllocationChart assetRows={assetRows} totalValue={totalValue} />
    </div>
  )
}
