import { useMemo } from 'react'
import { computeAssetPnl } from '../utils/pnl'
import { fmtUsd, fmtQty, fmtPct, pnlClass } from '../utils/format'

const CATEGORY_BADGE = {
  spot:       'bg-indigo-500/20 text-indigo-300',
  stablecoin: 'bg-green-500/20 text-green-300',
  defi:       'bg-amber-500/20 text-amber-300',
  rwa:        'bg-cyan-500/20 text-cyan-300',
}
const CHAIN_BADGE = {
  hyperevm: 'bg-indigo-900/40 text-indigo-400',
  solana:   'bg-purple-900/40 text-purple-400',
  ethereum: 'bg-blue-900/40 text-blue-400',
}

export function HoldingsTable({ transactions, assets, prices, changes }) {
  const rows = useMemo(() => {
    return assets
      .map(asset => {
        const txs = transactions.filter(t => t.asset_id === asset.id)
        if (!txs.length) return null
        const price = prices[asset.coingecko_id]
        const pnl = computeAssetPnl(txs, price)
        if (pnl.qty <= 0 && pnl.realizedPnl === 0) return null
        const change24h = changes[asset.coingecko_id] ?? null
        return { ...asset, ...pnl, currentPrice: price ?? null, change24h }
      })
      .filter(Boolean)
      .sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0))
  }, [transactions, assets, prices, changes])

  if (!rows.length) return (
    <div className="bg-surface-1 border border-border rounded-lg p-8 text-center text-gray-500 text-sm">
      No holdings yet. Add a transaction to get started.
    </div>
  )

  return (
    <div className="bg-surface-1 border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-3 text-left">Asset</th>
            <th className="px-4 py-3 text-right">Price</th>
            <th className="px-4 py-3 text-right">24h</th>
            <th className="px-4 py-3 text-right">Holdings</th>
            <th className="px-4 py-3 text-right">Avg Cost</th>
            <th className="px-4 py-3 text-right">Value</th>
            <th className="px-4 py-3 text-right">Unrealized</th>
            <th className="px-4 py-3 text-right">Realized</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(row => (
            <tr key={row.id} className="hover:bg-surface-2 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-100">{row.symbol}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${CATEGORY_BADGE[row.category] ?? ''}`}>
                    {row.category}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${CHAIN_BADGE[row.blockchain] ?? 'bg-gray-800 text-gray-400'}`}>
                    {row.blockchain ?? 'hyperevm'}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{row.name}</div>
              </td>
              <td className="px-4 py-3 text-right num text-gray-200">
                {row.currentPrice != null ? fmtUsd(row.currentPrice) : <span className="text-gray-600">—</span>}
              </td>
              <td className={`px-4 py-3 text-right num text-xs ${pnlClass(row.change24h)}`}>
                {row.change24h != null ? fmtPct(row.change24h) : <span className="text-gray-600">—</span>}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="num text-gray-200">{fmtQty(row.qty)}</div>
                <div className="num text-xs text-gray-500">{fmtUsd(row.currentValue)}</div>
              </td>
              <td className="px-4 py-3 text-right num text-gray-400">{fmtUsd(row.avgCost)}</td>
              <td className="px-4 py-3 text-right num text-gray-200">{fmtUsd(row.currentValue)}</td>
              <td className="px-4 py-3 text-right num">
                {row.unrealizedPnl != null ? (
                  <div className={pnlClass(row.unrealizedPnl)}>
                    <div>{fmtUsd(row.unrealizedPnl)}</div>
                    <div className="text-xs">{fmtPct(row.unrealizedPct)}</div>
                  </div>
                ) : <span className="text-gray-600">—</span>}
              </td>
              <td className={`px-4 py-3 text-right num ${pnlClass(row.realizedPnl)}`}>
                {fmtUsd(row.realizedPnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
