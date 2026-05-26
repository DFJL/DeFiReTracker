import { useMemo, useState } from 'react'
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
  polygon:  'bg-violet-900/40 text-violet-400',
}
const CATEGORIES = ['spot', 'stablecoin', 'defi', 'rwa']

function SortIcon({ active, dir }) {
  if (!active) return <span className="text-gray-700 ml-0.5">⇅</span>
  return <span className="text-accent ml-0.5">{dir === 'asc' ? '↑' : '↓'}</span>
}

function ColHeader({ label, col, sort, onSort, className = '' }) {
  return (
    <th
      className={`py-3 text-xs text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-300 transition-colors ${className}`}
      onClick={() => onSort(col)}
    >
      {label}<SortIcon active={sort.col === col} dir={sort.dir} />
    </th>
  )
}

export function HoldingsTable({ transactions, assets, prices, changes, pmktPositions = [], onUpdateAsset, onAutoFix }) {
  const [sort, setSort]         = useState({ col: 'value', dir: 'desc' })
  const [search, setSearch]     = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [autoFixing, setAutoFixing] = useState(false)

  function handleSort(col) {
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' })
  }

  function startEdit(row) {
    setEditingId(row.id)
    setEditDraft({ name: row.name ?? '', coingecko_id: row.coingecko_id ?? '', category: row.category ?? 'spot' })
  }

  async function saveEdit() {
    if (!onUpdateAsset || !editingId) return
    setEditSaving(true)
    await onUpdateAsset(editingId, editDraft)
    setEditSaving(false)
    setEditingId(null)
  }

  async function handleAutoFix() {
    if (!onAutoFix) return
    setAutoFixing(true)
    await onAutoFix()
    setAutoFixing(false)
  }

  const allRows = useMemo(() => {
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
  }, [transactions, assets, prices, changes])

  const rows = useMemo(() => {
    let r = allRows
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter(row => row.symbol?.toLowerCase().includes(q) || row.name?.toLowerCase().includes(q))
    }
    if (catFilter) r = r.filter(row => row.category === catFilter)

    return [...r].sort((a, b) => {
      let va, vb
      if (sort.col === 'asset')      { va = a.symbol ?? ''; vb = b.symbol ?? '' }
      if (sort.col === 'price')      { va = a.currentPrice ?? 0; vb = b.currentPrice ?? 0 }
      if (sort.col === '24h')        { va = a.change24h ?? -Infinity; vb = b.change24h ?? -Infinity }
      if (sort.col === 'value')      { va = a.currentValue ?? 0; vb = b.currentValue ?? 0 }
      if (sort.col === 'unrealized') { va = a.unrealizedPnl ?? -Infinity; vb = b.unrealizedPnl ?? -Infinity }
      if (sort.col === 'realized')   { va = a.realizedPnl ?? 0; vb = b.realizedPnl ?? 0 }
      if (sort.col === 'avgcost')    { va = a.avgCost ?? 0; vb = b.avgCost ?? 0 }
      if (va < vb) return sort.dir === 'asc' ? -1 : 1
      if (va > vb) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
  }, [allRows, search, catFilter, sort])

  const pmktRows = useMemo(() => {
    return pmktPositions.map((p, i) => {
      const size = Number(p.size ?? 0)
      const avgPrice = Number(p.avgPrice ?? 0)
      const currentPrice = Number(p.currentPrice ?? 0)
      const value = Number(p.currentValue ?? (size * currentPrice))
      const invested = size * avgPrice
      const pnl = value - invested
      const pct = invested > 0 ? (pnl / invested) * 100 : null
      const outcome = p.outcome ?? p.side ?? ''
      const title = p.title ?? p.question ?? p.market?.question ?? 'Unknown market'
      return { _key: i, title, outcome, size, avgPrice, currentPrice, currentValue: value, invested, pnl, pct }
    })
  }, [pmktPositions])

  const hasAny = allRows.length > 0 || pmktRows.length > 0

  if (!hasAny) return (
    <div className="bg-surface-1 border border-border rounded-lg p-8 text-center text-gray-500 text-sm">
      No holdings yet. Add a transaction to get started.
    </div>
  )

  const unlinkedAssets = allRows.filter(r => r.currentPrice == null && r.qty > 0)

  return (
    <div className="space-y-4">
      {/* Auto-fix banner */}
      {unlinkedAssets.length > 0 && onAutoFix && (
        <div className="flex items-center justify-between bg-yellow-900/20 border border-yellow-800/40 rounded-lg px-4 py-2.5 gap-3">
          <p className="text-xs text-yellow-300">
            {unlinkedAssets.length} asset{unlinkedAssets.length > 1 ? 's' : ''} ({unlinkedAssets.map(r => r.symbol).join(', ')}) missing price data — CoinGecko IDs may be incorrect.
          </p>
          <button
            onClick={handleAutoFix}
            disabled={autoFixing}
            className="flex-shrink-0 text-xs px-3 py-1.5 bg-yellow-700/50 hover:bg-yellow-700 text-yellow-200 rounded transition-colors disabled:opacity-50"
          >
            {autoFixing ? 'Fixing…' : 'Auto-fix'}
          </button>
        </div>
      )}

      {/* Filter bar */}
      {allRows.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter asset…"
              className="pl-7 pr-3 py-1.5 text-xs bg-surface-1 border border-border rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent w-36"
            />
          </div>
          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            className="py-1.5 px-2 text-xs bg-surface-1 border border-border rounded text-gray-400 focus:outline-none focus:border-accent"
          >
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {(search || catFilter) && (
            <button
              onClick={() => { setSearch(''); setCatFilter('') }}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Clear
            </button>
          )}
          <span className="text-xs text-gray-600">{rows.length} of {allRows.length}</span>
        </div>
      )}

      {/* Asset holdings table */}
      {allRows.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <ColHeader label="Asset"      col="asset"      sort={sort} onSort={handleSort} className="px-4 text-left" />
                <ColHeader label="Price"      col="price"      sort={sort} onSort={handleSort} className="px-4 text-right hidden md:table-cell" />
                <ColHeader label="24h"        col="24h"        sort={sort} onSort={handleSort} className="px-4 text-right" />
                <th className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider hidden sm:table-cell">Holdings</th>
                <ColHeader label="Avg Cost"   col="avgcost"    sort={sort} onSort={handleSort} className="px-4 text-right hidden lg:table-cell" />
                <ColHeader label="Value"      col="value"      sort={sort} onSort={handleSort} className="px-4 text-right" />
                <ColHeader label="Unrealized" col="unrealized" sort={sort} onSort={handleSort} className="px-4 text-right" />
                <ColHeader label="Realized"   col="realized"   sort={sort} onSort={handleSort} className="px-4 text-right hidden lg:table-cell" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-600 text-xs">
                    No assets match the current filter.
                  </td>
                </tr>
              ) : rows.map(row => (
                <>
                <tr key={row.id} className="group hover:bg-surface-2 transition-colors">
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
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-gray-500">{row.name}</span>
                      {onUpdateAsset && (
                        <button
                          onClick={() => editingId === row.id ? setEditingId(null) : startEdit(row)}
                          className="text-gray-700 hover:text-accent transition-colors opacity-0 group-hover:opacity-100 text-xs leading-none"
                          title="Edit asset"
                        >
                          ✎
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right num text-gray-200 hidden md:table-cell">
                    {row.currentPrice != null ? fmtUsd(row.currentPrice) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className={`px-4 py-3 text-right num text-xs ${pnlClass(row.change24h)}`}>
                    {row.change24h != null ? fmtPct(row.change24h) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <div className="num text-gray-200">{fmtQty(row.qty)}</div>
                    <div className="num text-xs text-gray-500">{fmtUsd(row.currentValue)}</div>
                  </td>
                  <td className="px-4 py-3 text-right num text-gray-400 hidden lg:table-cell">{fmtUsd(row.avgCost)}</td>
                  <td className="px-4 py-3 text-right num text-gray-200">{fmtUsd(row.currentValue)}</td>
                  <td className="px-4 py-3 text-right num">
                    {row.unrealizedPnl != null ? (
                      <div className={pnlClass(row.unrealizedPnl)}>
                        <div>{fmtUsd(row.unrealizedPnl)}</div>
                        <div className="text-xs">{fmtPct(row.unrealizedPct)}</div>
                      </div>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className={`px-4 py-3 text-right num hidden lg:table-cell ${pnlClass(row.realizedPnl)}`}>
                    {fmtUsd(row.realizedPnl)}
                  </td>
                </tr>
                {editingId === row.id && (
                  <tr key={`${row.id}-edit`} className="bg-surface-2 border-b border-border">
                    <td colSpan={8} className="px-4 py-3">
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
                          <label className="text-xs text-gray-500 block mb-1">Category</label>
                          <select
                            value={editDraft.category}
                            onChange={e => setEditDraft(d => ({ ...d, category: e.target.value }))}
                            className="bg-surface-3 border border-border rounded px-2 py-1 text-xs text-gray-400 focus:outline-none focus:border-accent"
                          >
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2 items-center">
                          <button
                            onClick={saveEdit}
                            disabled={editSaving}
                            className="px-3 py-1 text-xs bg-accent hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-50"
                          >
                            {editSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mt-2">
                        Find the correct ID on coingecko.com — search for the coin and copy the ID from the URL (e.g. <span className="text-gray-400">bitcoin</span>, <span className="text-gray-400">solana</span>, <span className="text-gray-400">arbitrum</span>).
                      </p>
                    </td>
                  </tr>
                )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Polymarket positions */}
      {pmktRows.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-lg overflow-x-auto">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <span className="text-xs text-violet-400 font-semibold uppercase tracking-wider">Polymarket Positions</span>
            <span className="text-xs text-gray-600">{pmktRows.length} open</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Market</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">Outcome</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">Shares</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Avg Price</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Cur Price</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-right">PnL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pmktRows.map(row => (
                <tr key={row._key} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3 max-w-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-400">PMKT</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded sm:hidden ${
                        row.outcome.toLowerCase() === 'yes' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                      }`}>{row.outcome || '—'}</span>
                    </div>
                    <div className="text-gray-200 text-xs leading-snug line-clamp-2 mt-1">{row.title}</div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      row.outcome.toLowerCase() === 'yes' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                    }`}>{row.outcome || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-right num text-gray-300 hidden sm:table-cell">{row.size.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right num text-gray-400 hidden md:table-cell">{row.avgPrice.toFixed(3)}</td>
                  <td className="px-4 py-3 text-right num text-gray-400 hidden md:table-cell">{row.currentPrice.toFixed(3)}</td>
                  <td className="px-4 py-3 text-right num text-gray-200">{fmtUsd(row.currentValue)}</td>
                  <td className={`px-4 py-3 text-right num ${pnlClass(row.pnl)}`}>
                    <div>{fmtUsd(row.pnl)}</div>
                    {row.pct != null && <div className="text-xs">{fmtPct(row.pct)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
