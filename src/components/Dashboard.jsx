import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { StatCard } from './ui/Card'
import { fmtUsd, fmtPct, pnlClass } from '../utils/format'
import { computeAssetPnl, aggregatePortfolio } from '../utils/pnl'
import { usePortfolioHistory } from '../hooks/usePortfolioHistory'
import { PortfolioChart } from './PortfolioChart'

const CATEGORY_COLORS = {
  spot: '#6366f1',
  stablecoin: '#22c55e',
  defi: '#f59e0b',
  rwa: '#06b6d4',
}

export function Dashboard({ transactions, assets, prices }) {
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

  const pieData = Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .map(([cat, value]) => ({ name: cat, value }))

  return (
    <div className="space-y-6">
      <PortfolioChart timeline={timeline} loading={loadingHistory} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          label="Portfolio Value"
          value={fmtUsd(totalValue)}
        />
        <StatCard
          label="Invested"
          value={fmtUsd(totalInvested)}
        />
        <StatCard
          label="Unrealized PnL"
          value={fmtUsd(totalUnrealized)}
          sub={fmtPct(unrealizedPct)}
          valueClass={pnlClass(totalUnrealized)}
        />
        <StatCard
          label="Realized PnL"
          value={fmtUsd(totalRealized)}
          valueClass={pnlClass(totalRealized)}
        />
        <StatCard
          label="Assets"
          value={assetRows.length}
        />
      </div>

      {pieData.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Allocation by Category</p>
          <div className="flex items-center gap-8">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {pieData.map(entry => (
                    <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] ?? '#888'} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={v => fmtUsd(v)}
                  contentStyle={{ background: '#1e2535', border: '1px solid #2a3347', borderRadius: 6, fontSize: 12 }}
                  itemStyle={{ color: '#e5e7eb' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {pieData.map(entry => (
                <div key={entry.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ background: CATEGORY_COLORS[entry.name] ?? '#888' }}
                  />
                  <span className="text-gray-400 capitalize w-24">{entry.name}</span>
                  <span className="num text-gray-200">{fmtUsd(entry.value)}</span>
                  <span className="num text-gray-500">
                    {totalValue > 0 ? fmtPct((entry.value / totalValue) * 100).replace('+', '') : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
