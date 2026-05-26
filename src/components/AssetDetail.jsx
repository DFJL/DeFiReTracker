import { useState, useMemo } from 'react'
import { computeAssetPnl } from '../utils/pnl'
import { fmtUsd, fmtQty, fmtPct, pnlClass } from '../utils/format'

const PERIODS    = ['1H', '24H', '7D', '30D']
const CATEGORIES = ['spot', 'stablecoin', 'defi', 'rwa']
const BLOCKCHAINS = [
  'hyperevm', 'solana', 'ethereum', 'polygon', 'bsc',
  'avalanche', 'base', 'arbitrum', 'bitcoin', 'other',
]

const TX_META = {
  buy:          { label: 'Buy',          cls: 'bg-green-500/20 text-green-300' },
  sell:         { label: 'Sell',         cls: 'bg-red-500/20 text-red-300' },
  transfer_in:  { label: 'Transfer In',  cls: 'bg-blue-500/20 text-blue-300' },
  transfer_out: { label: 'Transfer Out', cls: 'bg-orange-500/20 text-orange-300' },
  earn:         { label: 'Earn',         cls: 'bg-purple-500/20 text-purple-300' },
}

function Sparkline({ data, width = 180, height = 44 }) {
  if (!data?.length || data.length < 2) return null
  const step = Math.max(1, Math.floor(data.length / 60))
  const pts = data.filter((_, i) => i % step === 0 || i === data.length - 1)
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1
  const pad = 2
  const coords = pts.map((p, i) => [
    pad + (i / (pts.length - 1)) * (width - pad * 2),
    pad + (height - pad * 2) - ((p - min) / range) * (height - pad * 2),
  ])
  const d = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const isUp = pts[pts.length - 1] >= pts[0]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="flex-shrink-0">
      <path d={d} fill="none" stroke={isUp ? '#22c55e' : '#ef4444'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function computeTxsWithPnl(transactions, currentPrice) {
  let runningQty = 0
  let runningCost = 0

  return [...transactions]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(tx => {
      const qty  = Number(tx.qty)
      const price = Number(tx.price_usd)
      const fee  = Number(tx.fee_usd ?? 0)
      let txCost = null, txProceeds = null, txPnl = null

      if (tx.type === 'buy' || tx.type === 'transfer_in' || tx.type === 'earn') {
        txCost = price > 0 ? qty * price + fee : null
        runningCost += qty * price + fee
        runningQty  += qty
        txPnl = currentPrice != null ? (currentPrice - price) * qty : null
      } else if (tx.type === 'sell' || tx.type === 'transfer_out') {
        const avgNow = runningQty > 0 ? runningCost / runningQty : 0
        txProceeds = price > 0 ? qty * price - fee : null
        txPnl = (price - avgNow) * qty - fee
        runningCost = Math.max(0, runningCost - avgNow * qty)
        runningQty  = Math.max(0, runningQty - qty)
      }

      return { ...tx, _cost: txCost, _proceeds: txProceeds, _pnl: txPnl }
    })
    .reverse()
}

export function AssetDetail({ asset, transactions, prices, marketData = {}, changes = {}, onBack, onUpdateAsset }) {
  const [changePeriod, setChangePeriod] = useState('24H')
  const [editOpen, setEditOpen]   = useState(false)
  const [editDraft, setEditDraft] = useState({})
  const [editSaving, setEditSaving] = useState(false)

  const currentPrice = prices[asset.coingecko_id]
  const md = marketData[asset.coingecko_id]
  const pnl = useMemo(() => computeAssetPnl(transactions, currentPrice), [transactions, currentPrice])
  const txsWithPnl = useMemo(() => computeTxsWithPnl(transactions, currentPrice), [transactions, currentPrice])

  const changeVal = (() => {
    if (!md) return changes[asset.coingecko_id] ?? null
    const key = { '1H': 'change1h', '24H': 'change24h', '7D': 'change7d', '30D': 'change30d' }[changePeriod]
    return md[key] ?? null
  })()

  const totalPnl = (pnl.realizedPnl ?? 0) + (pnl.unrealizedPnl ?? 0)

  function openEdit() {
    setEditDraft({
      name:         asset.name         ?? '',
      coingecko_id: asset.coingecko_id ?? '',
      category:     asset.category     ?? 'spot',
      blockchain:   asset.blockchain   ?? 'hyperevm',
    })
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!onUpdateAsset) return
    setEditSaving(true)
    await onUpdateAsset(asset.id, editDraft)
    setEditSaving(false)
    setEditOpen(false)
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-200 transition-colors"
        >
          ← Holdings
        </button>
        <span className="text-gray-700">/</span>
        <span className="text-sm font-semibold text-gray-100">{asset.symbol}</span>
        <span className="text-xs text-gray-500">{asset.name}</span>
        {onUpdateAsset && (
          <button
            onClick={openEdit}
            className="ml-auto text-xs text-gray-600 hover:text-accent transition-colors"
          >
            ✎ Edit labels
          </button>
        )}
      </div>

      {/* Edit panel */}
      {editOpen && (
        <div className="bg-surface-2 border border-border rounded-lg px-4 py-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-gray-500 block mb-1">CoinGecko ID</label>
              <input
                value={editDraft.coingecko_id}
                onChange={e => setEditDraft(d => ({ ...d, coingecko_id: e.target.value.trim() }))}
                placeholder="e.g. bitcoin"
                className="bg-surface-3 border border-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent w-36"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Name</label>
              <input
                value={editDraft.name}
                onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                className="bg-surface-3 border border-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent w-36"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Asset Type</label>
              <select
                value={editDraft.category}
                onChange={e => setEditDraft(d => ({ ...d, category: e.target.value }))}
                className="bg-surface-3 border border-border rounded px-2 py-1 text-xs text-gray-400 focus:outline-none focus:border-accent"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Blockchain</label>
              <select
                value={editDraft.blockchain}
                onChange={e => setEditDraft(d => ({ ...d, blockchain: e.target.value }))}
                className="bg-surface-3 border border-border rounded px-2 py-1 text-xs text-gray-400 focus:outline-none focus:border-accent"
              >
                {BLOCKCHAINS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                disabled={editSaving}
                className="px-3 py-1 text-xs bg-accent hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-50"
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditOpen(false)} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300">
                Cancel
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            CoinGecko ID: search the coin at coingecko.com and copy the ID from the URL (e.g. <span className="text-gray-400">bitcoin</span>, <span className="text-gray-400">solana</span>).
          </p>
        </div>
      )}

      {/* Price header */}
      <div className="bg-surface-1 border border-border rounded-lg px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-5 flex-wrap">
            <div>
              <div className="text-2xl font-bold text-gray-100">
                {currentPrice != null ? fmtUsd(currentPrice) : <span className="text-gray-600">No price</span>}
              </div>
              {changeVal != null && (
                <div className={`text-sm font-medium mt-0.5 ${pnlClass(changeVal)}`}>
                  {fmtPct(changeVal)}
                </div>
              )}
            </div>
            {md?.sparkline?.length > 1 && <Sparkline data={md.sparkline} />}
          </div>
          <div className="flex gap-1 bg-surface-2 rounded p-0.5 flex-shrink-0">
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setChangePeriod(p)}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${
                  changePeriod === p ? 'bg-surface-3 text-gray-100' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Holdings Value',    value: fmtUsd(pnl.currentValue),                       cls: 'text-gray-100' },
          { label: 'Holdings',          value: `${fmtQty(pnl.qty)} ${asset.symbol}`,           cls: 'text-gray-100' },
          { label: 'Total Cost',        value: fmtUsd(pnl.grossInvested),                      cls: 'text-gray-100' },
          { label: 'Average Net Cost',  value: pnl.qty > 0 ? fmtUsd(pnl.avgCost) : '$0.00',   cls: 'text-gray-100' },
          { label: 'Total Profit / Loss', value: fmtUsd(totalPnl),                             cls: pnlClass(totalPnl) },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-surface-1 border border-border rounded-lg px-4 py-3">
            <div className={`text-base font-semibold ${cls}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Transaction table */}
      <div className="bg-surface-1 border border-border rounded-lg overflow-x-auto">
        <div className="px-4 py-2.5 border-b border-border">
          <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
            Transactions
          </span>
          <span className="ml-2 text-xs text-gray-600">{txsWithPnl.length}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">Quantity</th>
              <th className="px-4 py-3 text-right hidden md:table-cell">Date &amp; Time</th>
              <th className="px-4 py-3 text-right hidden lg:table-cell">Fees</th>
              <th className="px-4 py-3 text-right hidden md:table-cell">Cost</th>
              <th className="px-4 py-3 text-right hidden md:table-cell">Proceeds</th>
              <th className="px-4 py-3 text-right">PNL</th>
              <th className="px-4 py-3 text-left hidden lg:table-cell">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {txsWithPnl.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-600 text-xs">
                  No transactions.
                </td>
              </tr>
            ) : txsWithPnl.map(tx => {
              const meta = TX_META[tx.type] ?? { label: tx.type, cls: 'bg-gray-500/20 text-gray-400' }
              const isIn = tx.type === 'buy' || tx.type === 'transfer_in' || tx.type === 'earn'
              const qty   = Number(tx.qty)
              const price = Number(tx.price_usd)
              const fee   = Number(tx.fee_usd ?? 0)
              const dt    = new Date(tx.date)
              return (
                <tr key={tx.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right num text-gray-300">
                    {price > 0 ? fmtUsd(price) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className={`px-4 py-3 text-right num font-medium ${isIn ? 'text-green-400' : 'text-red-400'}`}>
                    {isIn ? '+' : '-'}{fmtQty(Math.abs(qty))}
                  </td>
                  <td className="px-4 py-3 text-right hidden md:table-cell whitespace-nowrap">
                    <span className="text-gray-400 text-xs">
                      {dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="text-gray-600 text-xs ml-1">
                      {dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right num text-gray-500 hidden lg:table-cell">
                    {fee > 0 ? fmtUsd(fee) : <span className="text-gray-700">$0.00</span>}
                  </td>
                  <td className="px-4 py-3 text-right num text-gray-400 hidden md:table-cell">
                    {tx._cost != null ? fmtUsd(tx._cost) : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right num text-gray-400 hidden md:table-cell">
                    {tx._proceeds != null ? fmtUsd(tx._proceeds) : <span className="text-gray-700">—</span>}
                  </td>
                  <td className={`px-4 py-3 text-right num text-xs ${pnlClass(tx._pnl)}`}>
                    {tx._pnl != null ? fmtUsd(tx._pnl) : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-4 py-3 text-left text-xs text-gray-500 hidden lg:table-cell max-w-xs">
                    <span className="truncate block">{tx.notes || <span className="text-gray-700">—</span>}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
