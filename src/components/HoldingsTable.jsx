import { useMemo, useState } from 'react'
import { computeAssetPnl } from '../utils/pnl'
import { fmtUsd, fmtQty, fmtPct, pnlClass } from '../utils/format'
import { AssetDetail } from './AssetDetail'

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
  bsc:      'bg-yellow-900/40 text-yellow-400',
  avalanche:'bg-red-900/40 text-red-400',
  base:     'bg-blue-900/40 text-blue-300',
  arbitrum: 'bg-sky-900/40 text-sky-400',
  bitcoin:  'bg-orange-900/40 text-orange-400',
}
const CATEGORIES  = ['spot', 'stablecoin', 'defi', 'rwa']
const BLOCKCHAINS = ['hyperevm', 'solana', 'ethereum', 'polygon', 'bsc', 'avalanche', 'base', 'arbitrum', 'bitcoin', 'other']
const PERIODS     = ['1H', '24H', '7D', '30D']
const DUST_THRESHOLD = 1

function Sparkline({ data, width = 80, height = 28 }) {
  if (!data?.length || data.length < 2) return <span className="text-gray-700 text-xs">—</span>
  const step = Math.max(1, Math.floor(data.length / 40))
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
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={d} fill="none" stroke={isUp ? '#22c55e' : '#ef4444'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

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

export function HoldingsTable({ transactions, assets, prices, changes, marketData = {}, pmktPositions = [], onUpdateAsset, onAutoFix, onAudit, portfolioId, onBulkInsert, loadingPrices = false, historicalPrices = {}, assetChanges = {} }) {
  const [sort, setSort]               = useState({ col: 'value', dir: 'desc' })
  const [search, setSearch]           = useState('')
  const [catFilter, setCatFilter]     = useState('')
  const [changePeriod, setChangePeriod] = useState('24H')
  const [hideDust, setHideDust]       = useState(false)
  const [editingId, setEditingId]     = useState(null)
  const [editDraft, setEditDraft]     = useState({})
  const [editSaving, setEditSaving]   = useState(false)
  const [autoFixing, setAutoFixing]   = useState(false)
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [dustModal, setDustModal]     = useState(false)
  const [dustLiquidating, setDustLiquidating] = useState(false)

  function handleSort(col) {
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' })
  }

  function startEdit(row) {
    setEditingId(row.id)
    setEditDraft({
      name:         row.name         ?? '',
      coingecko_id: row.coingecko_id ?? '',
      category:     row.category     ?? 'spot',
      blockchain:   row.blockchain   ?? 'hyperevm',
    })
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

  function getChange(cgId) {
    const md = marketData[cgId]
    const hist = assetChanges[cgId]
    const key = { '1H': 'change1h', '24H': 'change24h', '7D': 'change7d', '30D': 'change30d' }[changePeriod]
    // Prefer DeFiLlama market data; fall back to historical-computed changes for 7D/30D
    const fromMarket = md?.[key] ?? changes[cgId] ?? null
    if (fromMarket != null) return fromMarket
    if (changePeriod === '7D')  return hist?.change7d  ?? null
    if (changePeriod === '30D') return hist?.change30d ?? null
    return null
  }

  const allRows = useMemo(() => {
    return assets
      .map(asset => {
        const txs = transactions.filter(t => t.asset_id === asset.id)
        if (!txs.length) return null
        const price = prices[asset.coingecko_id]
        const pnl = computeAssetPnl(txs, price)
        if (pnl.qty <= 0 && pnl.realizedPnl === 0) return null
        return { ...asset, ...pnl, currentPrice: price ?? null }
      })
      .filter(Boolean)
  }, [transactions, assets, prices])

  const rows = useMemo(() => {
    let r = allRows
    if (hideDust) r = r.filter(row => !row.hasPrice || (row.currentValue ?? 0) >= DUST_THRESHOLD)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter(row => row.symbol?.toLowerCase().includes(q) || row.name?.toLowerCase().includes(q))
    }
    if (catFilter) r = r.filter(row => row.category === catFilter)
    return [...r].sort((a, b) => {
      let va, vb
      if (sort.col === 'asset')      { va = a.symbol ?? ''; vb = b.symbol ?? '' }
      if (sort.col === 'price')      { va = a.currentPrice ?? 0; vb = b.currentPrice ?? 0 }
      if (sort.col === 'change')     { va = getChange(a.coingecko_id) ?? -Infinity; vb = getChange(b.coingecko_id) ?? -Infinity }
      if (sort.col === 'value')      { va = a.currentValue ?? -Infinity; vb = b.currentValue ?? -Infinity }
      if (sort.col === 'unrealized') { va = a.unrealizedPnl ?? -Infinity; vb = b.unrealizedPnl ?? -Infinity }
      if (sort.col === 'realized')   { va = a.realizedPnl ?? 0; vb = b.realizedPnl ?? 0 }
      if (sort.col === 'avgcost')    { va = a.avgCost ?? 0; vb = b.avgCost ?? 0 }
      if (va < vb) return sort.dir === 'asc' ? -1 : 1
      if (va > vb) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
  }, [allRows, hideDust, search, catFilter, sort, changePeriod, marketData, changes])

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

  // Derive sparklines from the last 7 historical price points per asset
  const sparklines = useMemo(() => {
    const result = {}
    for (const row of allRows) {
      const prices = historicalPrices[row.id]
      if (prices?.length > 1) result[row.id] = prices.slice(-7).map(p => p.price)
    }
    return result
  }, [historicalPrices, allRows])

  const unlinkedAssets = allRows.filter(r => r.currentPrice == null && r.qty > 0)
  // Only include positions that have a live price — otherwise currentValue=0 and every
  // unpriced holding (including large ones) would be misidentified as dust.
  const dustRows = allRows.filter(r => r.qty > 0 && r.currentPrice != null && (r.currentValue ?? 0) < DUST_THRESHOLD)
  const dustCount = dustRows.length
  const hasAny = allRows.length > 0 || pmktRows.length > 0

  async function handleLiquidateDust() {
    if (!onBulkInsert || !portfolioId || !dustRows.length) return
    const today = new Date().toISOString().slice(0, 10)
    const txs = dustRows.map(r => ({
      portfolio_id: portfolioId,
      asset_id:     r.id,
      type:         'sell',
      qty:          r.qty,
      price_usd:    r.currentPrice ?? 0,
      fee_usd:      0,
      date:         today,
      notes:        'Dust cleanup',
    }))
    setDustLiquidating(true)
    await onBulkInsert(txs)
    setDustLiquidating(false)
    setDustModal(false)
  }

  // Asset drilldown view
  if (selectedAsset) {
    const assetTxs = transactions.filter(t => t.asset_id === selectedAsset.id)
    return (
      <AssetDetail
        asset={selectedAsset}
        transactions={assetTxs}
        prices={prices}
        marketData={marketData}
        changes={changes}
        onBack={() => setSelectedAsset(null)}
        onUpdateAsset={onUpdateAsset}
      />
    )
  }

  if (!hasAny) return (
    <div className="bg-surface-1 border border-border rounded-lg p-8 text-center text-gray-500 text-sm">
      No holdings yet. Add a transaction to get started.
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Auto-fix banner */}
      {unlinkedAssets.length > 0 && onAutoFix && (
        <div className="flex items-center justify-between bg-yellow-900/20 border border-yellow-800/40 rounded-lg px-4 py-2.5 gap-3">
          <p className="text-xs text-yellow-300">
            {unlinkedAssets.length} asset{unlinkedAssets.length > 1 ? 's' : ''} ({unlinkedAssets.map(r => r.symbol).join(', ')}) missing price data.
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
          {/* Dust toggle */}
          <button
            onClick={() => setHideDust(h => !h)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border transition-colors ${
              hideDust
                ? 'bg-accent/20 border-accent text-accent'
                : 'border-border text-gray-500 hover:border-gray-500 hover:text-gray-300'
            }`}
            title={`Hide assets under $${DUST_THRESHOLD}`}
          >
            <span>Hide dust</span>
            {dustCount > 0 && <span className="opacity-60">({dustCount})</span>}
          </button>
          {dustCount > 0 && onBulkInsert && (
            <button
              onClick={() => setDustModal(true)}
              disabled={loadingPrices}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border border-red-900 text-red-500 hover:bg-red-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={loadingPrices ? 'Wait for prices to load before liquidating' : `Auto-sell all ${dustCount} dust positions`}
            >
              Liquidate dust
            </button>
          )}
          {(search || catFilter) && (
            <button onClick={() => { setSearch(''); setCatFilter('') }} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              Clear
            </button>
          )}
          <span className="text-xs text-gray-600">{rows.length} of {allRows.length}</span>
          {onAudit && (
            <button
              onClick={onAudit}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border text-gray-500 hover:border-accent hover:text-accent rounded transition-colors"
              title="Detect duplicates, price errors and other data quality issues"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              Audit Data
            </button>
          )}
        </div>
      )}

      {/* Asset holdings table */}
      {allRows.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <ColHeader label="Asset" col="asset" sort={sort} onSort={handleSort} className="px-4 text-left" />
                <ColHeader label="Price" col="price" sort={sort} onSort={handleSort} className="px-4 text-right hidden md:table-cell" />
                {/* Period-toggle change header */}
                <th
                  className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort('change')}
                >
                  <div className="flex items-center justify-end gap-0.5">
                    {PERIODS.map(p => (
                      <button
                        key={p}
                        onClick={e => { e.stopPropagation(); setChangePeriod(p) }}
                        className={`px-1 py-0.5 rounded transition-colors ${
                          changePeriod === p ? 'bg-surface-3 text-gray-100' : 'text-gray-600 hover:text-gray-400'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <SortIcon active={sort.col === 'change'} dir={sort.dir} />
                  </div>
                </th>
                <th className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  7D Chart
                </th>
                <th className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider hidden sm:table-cell">Holdings</th>
                <ColHeader label="Avg Cost"    col="avgcost"    sort={sort} onSort={handleSort} className="px-4 text-right hidden lg:table-cell" />
                <ColHeader label="Value"       col="value"      sort={sort} onSort={handleSort} className="px-4 text-right" />
                <ColHeader label="Unrealized"  col="unrealized" sort={sort} onSort={handleSort} className="px-4 text-right" />
                <ColHeader label="Realized"    col="realized"   sort={sort} onSort={handleSort} className="px-4 text-right hidden lg:table-cell" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-600 text-xs">
                    No assets match the current filter.
                  </td>
                </tr>
              ) : rows.map(row => {
                const changeVal = getChange(row.coingecko_id)
                const sparkline = sparklines[row.id] ?? marketData[row.coingecko_id]?.sparkline
                return (
                  <>
                  <tr
                    key={row.id}
                    className="group hover:bg-surface-2 transition-colors cursor-pointer"
                    onClick={() => setSelectedAsset(row)}
                  >
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
                            onClick={e => { e.stopPropagation(); editingId === row.id ? setEditingId(null) : startEdit(row) }}
                            className="text-gray-700 hover:text-accent transition-colors opacity-0 group-hover:opacity-100 text-xs leading-none"
                            title="Edit asset labels"
                          >
                            ✎
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right num text-gray-200 hidden md:table-cell">
                      {row.currentPrice != null ? fmtUsd(row.currentPrice) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className={`px-4 py-3 text-right num text-xs ${pnlClass(changeVal)}`}>
                      {changeVal != null ? fmtPct(changeVal) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      <Sparkline data={sparkline} />
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
                      <td colSpan={9} className="px-4 py-3" onClick={e => e.stopPropagation()}>
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
                          CoinGecko ID: search the coin at coingecko.com and copy the ID from the URL (e.g. <span className="text-gray-400">bitcoin</span>, <span className="text-gray-400">solana</span>).
                        </p>
                      </td>
                    </tr>
                  )}
                  </>
                )
              })}
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

      {/* Dust liquidation confirmation modal */}
      {dustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-surface-1 border border-border rounded-lg w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-gray-100">Liquidate dust positions</h3>
              <p className="text-xs text-gray-500 mt-1">
                Generates a <span className="text-gray-300">sell</span> transaction for each position under ${DUST_THRESHOLD} at the current market price.
              </p>
            </div>
            <div className="px-5 py-3 max-h-64 overflow-y-auto space-y-1">
              {dustRows.map(r => (
                <div key={r.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-200 w-16">{r.symbol}</span>
                    <span className="text-gray-500 num">{fmtQty(r.qty)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-400 num">{r.currentPrice != null ? fmtUsd(r.currentPrice) : '—'}</span>
                    <span className="text-gray-600 ml-2 num">= {fmtUsd(r.currentValue ?? 0)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 flex justify-end gap-2">
              <button
                onClick={() => setDustModal(false)}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >Cancel</button>
              <button
                onClick={handleLiquidateDust}
                disabled={dustLiquidating}
                className="px-4 py-1.5 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors disabled:opacity-50"
              >
                {dustLiquidating ? 'Liquidating…' : `Sell ${dustRows.length} positions`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
