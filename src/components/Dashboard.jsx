import { useMemo } from 'react'
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

export function Dashboard({ transactions, assets, prices, changes }) {
  const { timeline, loading: loadingHistory } = usePortfolioHistory(transactions, assets)

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

  // 24h portfolio change derived from per-asset 24h change%
  const { change24hUsd, change24hPct, topPerformer } = useMemo(() => {
    let prevValue = 0
    let bestAsset = null
    let bestPct = -Infinity

    for (const row of assetRows) {
      const chg = changes[row.coingecko_id]
      if (chg != null && row.currentValue > 0) {
        const prevPrice = (row.currentPrice ?? 0) / (1 + chg / 100)
        prevValue += row.qty * prevPrice

        if (chg > bestPct) { bestPct = chg; bestAsset = { symbol: row.symbol, pct: chg } }
      }
    }

    const change24hUsd = prevValue > 0 ? totalValue - prevValue : null
    const change24hPct = prevValue > 0 ? ((totalValue - prevValue) / prevValue) * 100 : null
    return { change24hUsd, change24hPct, topPerformer: bestAsset }
  }, [assetRows, changes, totalValue])

  return (
    <div className="space-y-4">
      {/* Header stats — CoinGecko-style */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox label="Current Balance" value={fmtUsd(totalValue)} />
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
        <StatBox
          label="Top Performer 24H"
          value={topPerformer ? topPerformer.symbol : '—'}
          sub={topPerformer ? fmtPct(topPerformer.pct) : undefined}
          valueClass={topPerformer ? pnlClass(topPerformer.pct) : ''}
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatBox label="Invested (cost basis)" value={fmtUsd(totalInvested)} />
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
