import { useMemo, useState } from 'react'
import { computeAssetPnl } from '../utils/pnl'
import { fmtUsd, fmtPct, fmtQty, fmtDate, pnlClass } from '../utils/format'

// ── Classification regexes ──────────────────────────────────────────────────
const LP_RX      = /lps?\b|liquidity|pool|\bfee(s)?\b|\bdif\b/i
const AIRDROP_RX = /airdrop|\bdrop\b|claim|genesis|snapshot/i
const STAKING_RX = /stak|yield|\bearn\b|validator|interest|bond/i

function classifyTx(tx) {
  const notes = tx.notes ?? ''
  const price = Number(tx.price_usd)
  if (tx.type === 'deposit' || tx.type === 'withdrawal') return null  // cash flows, not income
  if (tx.type === 'sell') return 'realized'
  if (tx.type === 'buy' || tx.type === 'transfer_out') return null
  if (tx.type === 'transfer_in' && price > 0) return null  // paid transfer = cost, not income
  if (LP_RX.test(notes))      return 'lp'
  if (AIRDROP_RX.test(notes)) return 'airdrop'
  if (STAKING_RX.test(notes)) return 'staking'
  if (tx.type === 'earn')     return 'staking'
  return 'airdrop'  // untagged free token defaults to airdrop bucket
}

function txValue(tx, prices) {
  const qty   = Number(tx.qty)
  const price = Number(tx.price_usd)
  const fee   = Number(tx.fee_usd ?? 0)
  if (price > 0) return Math.max(0, qty * price - fee)
  const cur = prices[tx.asset?.coingecko_id] ?? 0
  return qty * cur
}

// ── Formatting ──────────────────────────────────────────────────────────────
function fmtShort(n) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

// ── Categories config ───────────────────────────────────────────────────────
const CATS = [
  { key: 'appreciation', label: 'Price Appreciation', color: '#6366f1', desc: 'Unrealized P/L on current holdings (snapshot)' },
  { key: 'realized',     label: 'Realized Gains',     color: '#22c55e', desc: 'Net profit from sells (proceeds minus avg cost basis — not gross)' },
  { key: 'lp',          label: 'LP Rewards',          color: '#f59e0b', desc: 'Liquidity provision fees & differentials' },
  { key: 'airdrop',     label: 'Airdrops',            color: '#a78bfa', desc: 'Free tokens received (incl. untagged inflows)' },
  { key: 'staking',     label: 'Staking / Yield',     color: '#34d399', desc: 'Staking rewards, earn events, yield' },
]

const CHART_CATS = CATS.filter(c => c.key !== 'appreciation')

const PERF_PERIODS = [
  { id: '1H',       label: '1H' },
  { id: '24H',      label: '24H' },
  { id: '7D',       label: '7D' },
  { id: '30D',      label: '30D' },
  { id: 'All Time', label: 'All Time' },
]

const INCOME_RANGES = [
  { id: 'ALL', label: 'All Time' },
  { id: '30D', label: '30D' },
  { id: '90D', label: '90D' },
  { id: '1Y',  label: '1Y'  },
]

const MONTHLY_RANGES = [
  { id: '6M',  months: 6  },
  { id: '1Y',  months: 12 },
  { id: '2Y',  months: 24 },
  { id: 'All', months: null },
]

// ── Data computation ────────────────────────────────────────────────────────
function getSince(rangeId) {
  if (rangeId === 'ALL') return null
  const d    = new Date()
  const days = { '30D': 30, '90D': 90, '1Y': 365 }[rangeId] ?? 0
  d.setDate(d.getDate() - days)
  return d
}

function computeBreakdown(transactions, assets, prices, since) {
  const result = { appreciation: 0, realized: 0, lp: 0, airdrop: 0, staking: 0 }
  const state  = {}
  const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date))

  for (const tx of sorted) {
    const aid   = tx.asset_id
    const qty   = Number(tx.qty)
    const price = Number(tx.price_usd)
    const fee   = Number(tx.fee_usd ?? 0)
    const inR   = !since || new Date(tx.date) >= since
    if (!state[aid]) state[aid] = { qty: 0, cost: 0 }

    if (tx.type === 'buy' || tx.type === 'transfer_in' || tx.type === 'earn') {
      state[aid].cost += qty * price + fee
      state[aid].qty  += qty
    } else if (tx.type === 'sell' || tx.type === 'transfer_out') {
      const avg = state[aid].qty > 0 ? state[aid].cost / state[aid].qty : 0
      if (inR && tx.type === 'sell') result.realized += (price - avg) * qty - fee
      state[aid].cost = Math.max(0, state[aid].cost - avg * qty)
      state[aid].qty  = Math.max(0, state[aid].qty - qty)
      continue
    }

    if (!inR) continue
    const cat = classifyTx(tx)
    if (cat && cat !== 'realized' && cat in result) result[cat] += txValue(tx, prices)
  }

  // Price appreciation = current unrealized PnL (always full snapshot)
  for (const asset of assets) {
    const txs = transactions.filter(t => t.asset_id === asset.id)
    if (!txs.length) continue
    const pnl = computeAssetPnl(txs, prices[asset.coingecko_id])
    if (pnl.unrealizedPnl != null) result.appreciation += pnl.unrealizedPnl
  }

  return result
}

function computeMonthly(transactions, prices, numMonths) {
  const now    = new Date()
  const months = {}
  for (let i = numMonths - 1; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    months[key] = {
      key,
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      realized: 0, lp: 0, airdrop: 0, staking: 0,
    }
  }

  const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date))
  const state  = {}

  for (const tx of sorted) {
    const d   = new Date(tx.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const aid = tx.asset_id
    const qty = Number(tx.qty), price = Number(tx.price_usd), fee = Number(tx.fee_usd ?? 0)
    if (!state[aid]) state[aid] = { qty: 0, cost: 0 }

    if (tx.type === 'buy' || tx.type === 'transfer_in' || tx.type === 'earn') {
      state[aid].cost += qty * price + fee
      state[aid].qty  += qty
    }

    if (tx.type === 'sell' || tx.type === 'transfer_out') {
      const avg = state[aid].qty > 0 ? state[aid].cost / state[aid].qty : 0
      if (months[key] && tx.type === 'sell') months[key].realized += (price - avg) * qty - fee
      state[aid].cost = Math.max(0, state[aid].cost - avg * qty)
      state[aid].qty  = Math.max(0, state[aid].qty - qty)
    } else if (months[key]) {
      const cat = classifyTx(tx)
      if (cat && cat !== 'realized' && cat in months[key]) months[key][cat] += txValue(tx, prices)
    }
  }

  return Object.values(months)
}

function computeDrillDown(transactions, prices, monthKey, catKey) {
  const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date))
  const state  = {}
  const rows   = []

  for (const tx of sorted) {
    const d   = new Date(tx.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const aid = tx.asset_id
    const qty = Number(tx.qty), price = Number(tx.price_usd), fee = Number(tx.fee_usd ?? 0)
    if (!state[aid]) state[aid] = { qty: 0, cost: 0 }

    // Always maintain running avg cost basis
    if (tx.type === 'buy' || tx.type === 'transfer_in' || tx.type === 'earn') {
      state[aid].cost += qty * price + fee
      state[aid].qty  += qty
    } else if (tx.type === 'sell' || tx.type === 'transfer_out') {
      const avg = state[aid].qty > 0 ? state[aid].cost / state[aid].qty : 0
      if (key === monthKey && catKey === 'realized' && tx.type === 'sell') {
        rows.push({ tx, value: (price - avg) * qty - fee, avgCost: avg })
      }
      state[aid].cost = Math.max(0, state[aid].cost - avg * qty)
      state[aid].qty  = Math.max(0, state[aid].qty - qty)
      continue
    }

    if (key !== monthKey || catKey === 'realized') continue
    const txCat = classifyTx(tx)
    if (txCat === catKey) rows.push({ tx, value: txValue(tx, prices) })
  }

  return rows
}

function computeAirdropGroups(transactions, prices) {
  const airdropTxs = transactions.filter(tx => classifyTx(tx) === 'airdrop')
  if (!airdropTxs.length) return []

  const byAsset = new Map()
  for (const tx of airdropTxs) {
    const aid = tx.asset_id
    if (!byAsset.has(aid)) byAsset.set(aid, { asset: tx.asset, txs: [] })
    byAsset.get(aid).txs.push(tx)
  }

  return [...byAsset.values()].map(({ asset, txs }) => {
    const cgId         = asset?.coingecko_id
    const currentPrice = prices[cgId] ?? null
    const totalQty     = txs.reduce((s, t) => s + Number(t.qty), 0)
    const rcvdValue    = txs.reduce((s, t) => s + Number(t.qty) * Number(t.price_usd), 0)
    const currentValue = currentPrice != null ? totalQty * currentPrice : null
    const gain         = currentValue != null ? currentValue - rcvdValue : null

    // Current holdings across ALL transactions for this asset
    const allTxs = transactions.filter(t => t.asset_id === asset?.id)
    let heldQty  = 0
    for (const t of [...allTxs].sort((a, b) => new Date(a.date) - new Date(b.date))) {
      const q = Number(t.qty)
      if (t.type === 'buy' || t.type === 'transfer_in' || t.type === 'earn') heldQty += q
      else if (t.type === 'sell' || t.type === 'transfer_out') heldQty -= q
    }
    heldQty = Math.max(0, heldQty)

    // Holding status relative to airdrop qty
    const status = heldQty >= totalQty * 0.99 ? 'holding'
                 : heldQty > 0               ? 'partial'
                 :                             'sold'

    // Opportunity cost / exit quality for sold/partial
    let exitNote = null
    const sells = allTxs.filter(t => t.type === 'sell')
    if (sells.length && currentPrice != null) {
      const totalSoldQty   = sells.reduce((s, t) => s + Number(t.qty), 0)
      const avgSellPrice   = sells.reduce((s, t) => s + Number(t.price_usd) * Number(t.qty), 0) / totalSoldQty
      const airdropSoldQty = Math.min(totalQty - heldQty, totalSoldQty)
      if (airdropSoldQty > 0) {
        const lockedIn   = airdropSoldQty * avgSellPrice
        const wouldBe    = airdropSoldQty * currentPrice
        const delta      = lockedIn - wouldBe     // positive = good exit
        exitNote = { avgSellPrice, airdropSoldQty, lockedIn, wouldBe, delta }
      }
    }

    const dates     = txs.map(t => new Date(t.date)).sort((a, b) => a - b)
    const firstDate = dates[0]
    const lastDate  = dates[dates.length - 1]
    const notesTags = [...new Set(txs.map(t => t.notes).filter(Boolean))]

    return {
      assetId: asset?.id,
      symbol:  asset?.symbol ?? '?',
      name:    asset?.name   ?? '?',
      cgId,
      currentPrice,
      totalQty,
      rcvdValue,
      currentValue,
      gain,
      heldQty,
      status,
      exitNote,
      dropCount: txs.length,
      firstDate,
      lastDate,
      notesTags,
    }
  }).sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0))
}

// ── SVG components ──────────────────────────────────────────────────────────
function MiniSparkline({ data, up, w = 64, h = 24 }) {
  if (!data?.length || data.length < 2) return null
  const step = Math.max(1, Math.floor(data.length / 30))
  const pts  = data.filter((_, i) => i % step === 0 || i === data.length - 1)
  const min  = Math.min(...pts), max = Math.max(...pts), range = max - min || 1
  const pad  = 1
  const coords = pts.map((p, i) => [
    pad + (i / (pts.length - 1)) * (w - pad * 2),
    pad + (h - pad * 2) - ((p - min) / range) * (h - pad * 2),
  ])
  const d = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0 opacity-70">
      <path d={d} fill="none" stroke={up ? '#22c55e' : '#ef4444'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DonutChart({ items }) {
  const total = items.reduce((s, d) => s + Math.max(0, d.value), 0)
  if (total <= 0) return (
    <div className="w-32 h-32 rounded-full border-4 border-border flex items-center justify-center">
      <span className="text-xs text-gray-600">No data</span>
    </div>
  )
  const R = 52, r = 30, cx = 64, cy = 64
  let deg = -90
  const arcs = items.filter(d => d.value > 0).map(d => {
    const pct   = d.value / total
    const a1    = (deg * Math.PI) / 180
    deg += pct * 360
    const a2   = (deg * Math.PI) / 180
    const large = pct > 0.5 ? 1 : 0
    return {
      ...d, pct,
      path: [
        `M ${(cx + R * Math.cos(a1)).toFixed(2)} ${(cy + R * Math.sin(a1)).toFixed(2)}`,
        `A ${R} ${R} 0 ${large} 1 ${(cx + R * Math.cos(a2)).toFixed(2)} ${(cy + R * Math.sin(a2)).toFixed(2)}`,
        `L ${(cx + r * Math.cos(a2)).toFixed(2)} ${(cy + r * Math.sin(a2)).toFixed(2)}`,
        `A ${r} ${r} 0 ${large} 0 ${(cx + r * Math.cos(a1)).toFixed(2)} ${(cy + r * Math.sin(a1)).toFixed(2)}`,
        'Z',
      ].join(' '),
    }
  })
  return (
    <svg viewBox="0 0 128 128" className="w-32 h-32 flex-shrink-0">
      {arcs.map(a => (
        <path key={a.key} d={a.path} fill={a.color}>
          <title>{a.label}: {fmtUsd(a.value)} ({(a.pct * 100).toFixed(1)}%)</title>
        </path>
      ))}
    </svg>
  )
}

function MonthlyBarChart({ data, selectedCell, filteredCat, onSelect }) {
  const visCats = filteredCat ? CHART_CATS.filter(c => c.key === filteredCat) : CHART_CATS
  const totals  = data.map(m => visCats.reduce((s, c) => s + Math.max(0, m[c.key] ?? 0), 0))
  const maxVal  = Math.max(...totals, 1)
  if (!totals.some(t => t > 0)) return (
    <div className="h-40 flex items-center justify-center text-gray-600 text-xs">No income data for this period.</div>
  )
  const W = 700, H = 180, pad = { l: 50, r: 8, t: 8, b: 28 }
  const cH = H - pad.t - pad.b, cW = W - pad.l - pad.r
  const gap = 3, bw = Math.max(6, Math.floor(cW / data.length) - gap)
  const ticks = [0.25, 0.5, 0.75, 1].map(t => ({ y: pad.t + cH * (1 - t), v: fmtShort(maxVal * t) }))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ cursor: 'pointer' }}>
      {ticks.map(({ y, v }) => (
        <g key={v}>
          <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="#1f2937" strokeDasharray="3,2" />
          <text x={pad.l - 4} y={y + 4} textAnchor="end" fill="#4b5563" fontSize="9">{v}</text>
        </g>
      ))}
      <line x1={pad.l} y1={pad.t + cH} x2={W - pad.r} y2={pad.t + cH} stroke="#374151" />
      {data.map((m, i) => {
        const x = pad.l + i * (bw + gap)
        let y = pad.t + cH
        const isMonthSelected = selectedCell?.monthKey === m.key
        return (
          <g key={m.key}>
            {visCats.map(cat => {
              const val = Math.max(0, m[cat.key] ?? 0)
              if (!val) return null
              const h = (val / maxVal) * cH
              y -= h
              const isSelected = isMonthSelected && selectedCell?.catKey === cat.key
              const dimmed = selectedCell && !isSelected
              return (
                <rect
                  key={cat.key}
                  x={x} y={y} width={bw} height={h}
                  fill={cat.color} rx="1"
                  opacity={dimmed ? 0.3 : 1}
                  stroke={isSelected ? '#fff' : 'none'}
                  strokeWidth={isSelected ? 1 : 0}
                  onClick={() => onSelect({ monthKey: m.key, catKey: cat.key })}
                >
                  <title>{cat.label}: {fmtUsd(val)} — click to inspect</title>
                </rect>
              )
            })}
            <text
              x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="8.5"
              fill={isMonthSelected ? '#e5e7eb' : '#4b5563'}
            >{m.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Performance card ────────────────────────────────────────────────────────
const PERIOD_KEY = { '1H': 'change1h', '24H': 'change24h', '7D': 'change7d', '30D': 'change30d' }

function LeaderCard({ rank, row, period, isGainer }) {
  const isAllTime = period === 'All Time'
  const changePct = isAllTime
    ? row.totalPct
    : row.md?.[PERIOD_KEY[period]] ?? null
  const changeAbs = isAllTime
    ? row.totalPnl
    : row.currentValue != null && changePct != null
      ? row.currentValue * changePct / 100
      : null

  return (
    <div className="flex items-center gap-3 bg-surface-2 border border-border rounded-lg px-3 py-2.5 hover:border-accent/40 transition-colors">
      <span className={`text-xs font-bold w-5 flex-shrink-0 text-center ${isGainer ? 'text-green-500' : 'text-red-500'}`}>
        #{rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-100 leading-tight">{row.symbol}</div>
        <div className="text-xs text-gray-500 truncate">{row.name}</div>
      </div>
      {!isAllTime && row.md?.sparkline && (
        <MiniSparkline data={row.md.sparkline} up={changePct >= 0} />
      )}
      <div className="text-right flex-shrink-0">
        <div className={`text-sm font-semibold ${pnlClass(changePct)}`}>
          {changePct != null ? fmtPct(changePct) : '—'}
        </div>
        {changeAbs != null && (
          <div className={`text-xs ${pnlClass(changeAbs)}`}>{fmtUsd(changeAbs)}</div>
        )}
        {isAllTime && row.currentValue != null && (
          <div className="text-xs text-gray-600">{fmtUsd(row.currentValue)}</div>
        )}
      </div>
    </div>
  )
}

function PeriodBtn({ id, active, onClick }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-2.5 py-1 text-xs rounded transition-colors ${
        active ? 'bg-accent/20 text-accent border border-accent/40' : 'border border-border text-gray-500 hover:text-gray-300 hover:border-gray-500'
      }`}
    >
      {id}
    </button>
  )
}

// ── Main Analytics component ────────────────────────────────────────────────
export function Analytics({ transactions, assets, prices, changes, marketData = {} }) {
  const [perfPeriod,   setPerfPeriod]   = useState('24H')
  const [incomeRange,  setIncomeRange]  = useState('ALL')
  const [monthlyRange, setMonthlyRange] = useState('1Y')
  const [selectedCell, setSelectedCell] = useState(null)
  const [filteredCat,  setFilteredCat]  = useState(null)

  // Per-asset enriched rows
  const assetRows = useMemo(() => {
    return assets.flatMap(asset => {
      const txs = transactions.filter(t => t.asset_id === asset.id)
      if (!txs.length) return []
      const price = prices[asset.coingecko_id]
      const pnl   = computeAssetPnl(txs, price)
      if (pnl.qty <= 0 && pnl.realizedPnl === 0 && pnl.grossInvested === 0) return []
      const totalPnl = (pnl.unrealizedPnl ?? 0) + pnl.realizedPnl
      const totalPct = pnl.grossInvested > 0 ? (totalPnl / pnl.grossInvested) * 100 : null
      return [{ ...asset, ...pnl, currentPrice: price ?? null, currentValue: pnl.currentValue, totalPnl, totalPct, md: marketData[asset.coingecko_id] }]
    })
  }, [assets, transactions, prices, marketData])

  // Performance ranking
  const { topGainers, topLosers } = useMemo(() => {
    let sorted
    if (perfPeriod === 'All Time') {
      sorted = [...assetRows]
        .filter(a => a.grossInvested > 0 || a.realizedPnl !== 0)
        .sort((a, b) => {
          const ap = a.totalPct ?? -Infinity, bp = b.totalPct ?? -Infinity
          return bp - ap
        })
    } else {
      const key = PERIOD_KEY[perfPeriod]
      sorted = [...assetRows]
        .filter(a => a.md?.[key] != null)
        .sort((a, b) => (b.md[key] ?? 0) - (a.md[key] ?? 0))
    }
    return {
      topGainers: sorted.slice(0, 5),
      topLosers:  sorted.slice(-5).reverse(),
    }
  }, [assetRows, perfPeriod])

  // Income breakdown
  const since     = useMemo(() => getSince(incomeRange), [incomeRange])
  const breakdown = useMemo(() => computeBreakdown(transactions, assets, prices, since), [transactions, assets, prices, since])

  const monthlyNumMonths = useMemo(() => {
    const found = MONTHLY_RANGES.find(r => r.id === monthlyRange)
    if (found?.months != null) return found.months
    if (!transactions.length) return 12
    const earliest = new Date(Math.min(...transactions.map(t => new Date(t.date).getTime())))
    const now = new Date()
    return Math.max(1, (now.getFullYear() - earliest.getFullYear()) * 12 + (now.getMonth() - earliest.getMonth()) + 1)
  }, [monthlyRange, transactions])

  const monthly = useMemo(() => computeMonthly(transactions, prices, monthlyNumMonths), [transactions, prices, monthlyNumMonths])

  const drillDown = useMemo(() => {
    if (!selectedCell) return []
    return computeDrillDown(transactions, prices, selectedCell.monthKey, selectedCell.catKey)
  }, [selectedCell, transactions, prices])

  // Airdrops
  const airdropGroups = useMemo(() => computeAirdropGroups(transactions, prices), [transactions, prices])

  const totalPositive = CATS.reduce((s, c) => s + Math.max(0, breakdown[c.key] ?? 0), 0)
  const donutItems    = CATS.map(c => ({ ...c, value: Math.max(0, breakdown[c.key] ?? 0) }))

  if (!assetRows.length && !transactions.length) return (
    <div className="bg-surface-1 border border-border rounded-lg p-8 text-center text-gray-500 text-sm">
      Add transactions to see analytics.
    </div>
  )

  return (
    <div className="space-y-6">

      {/* ── Performance Leaders ──────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Performance Leaders</h2>
          <div className="flex gap-1.5">
            {PERF_PERIODS.map(p => (
              <PeriodBtn key={p.id} id={p.id} active={perfPeriod === p.id} onClick={setPerfPeriod} />
            ))}
          </div>
        </div>

        {topGainers.length === 0 && topLosers.length === 0 ? (
          <div className="bg-surface-1 border border-border rounded-lg p-6 text-center text-gray-600 text-xs">
            {perfPeriod === 'All Time'
              ? 'No traded assets with cost data.'
              : `No assets with ${perfPeriod} price data from CoinGecko.`}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Gainers */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-500 font-semibold uppercase tracking-wider">Top Gainers</span>
                <span className="text-xs text-gray-600">{perfPeriod}</span>
              </div>
              {topGainers.length === 0 ? (
                <div className="text-xs text-gray-600 px-1">No data</div>
              ) : topGainers.map((row, i) => (
                <LeaderCard key={row.id} rank={i + 1} row={row} period={perfPeriod} isGainer />
              ))}
            </div>

            {/* Losers */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-500 font-semibold uppercase tracking-wider">Top Losers</span>
                <span className="text-xs text-gray-600">{perfPeriod}</span>
              </div>
              {topLosers.length === 0 ? (
                <div className="text-xs text-gray-600 px-1">No data</div>
              ) : topLosers.map((row, i) => (
                <LeaderCard key={row.id} rank={i + 1} row={row} period={perfPeriod} isGainer={false} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Income & Proceeds Analysis ──────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Income &amp; Proceeds</h2>
            <p className="text-xs text-gray-600 mt-0.5">Sources inferred from transaction type and notes</p>
          </div>
          <div className="flex gap-1.5">
            {INCOME_RANGES.map(r => (
              <PeriodBtn key={r.id} id={r.label} active={incomeRange === r.id} onClick={() => setIncomeRange(r.id)} />
            ))}
          </div>
        </div>

        {/* Breakdown */}
        <div className="bg-surface-1 border border-border rounded-lg p-4">
          <div className="flex gap-6 flex-wrap items-start">
            {/* Donut */}
            <div className="flex-shrink-0">
              <DonutChart items={donutItems} />
              <div className="text-center mt-1">
                <div className="text-xs text-gray-500">Total</div>
                <div className="text-sm font-semibold text-gray-100">{fmtUsd(totalPositive)}</div>
              </div>
            </div>

            {/* Category list */}
            <div className="flex-1 min-w-0 space-y-2.5 pt-1">
              {CATS.map(cat => {
                const val  = breakdown[cat.key] ?? 0
                const pct  = totalPositive > 0 ? Math.max(0, val) / totalPositive : 0
                const isNeg = val < 0
                return (
                  <div key={cat.key}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                        <span className="text-xs text-gray-300 font-medium">{cat.label}</span>
                        <span className="text-xs text-gray-600 hidden sm:inline">{cat.desc}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                        {totalPositive > 0 && !isNeg && (
                          <span className="text-xs text-gray-500">{(pct * 100).toFixed(1)}%</span>
                        )}
                        <span className={`text-sm font-semibold tabular-nums ${pnlClass(val)}`}>
                          {fmtUsd(val)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(pct * 100).toFixed(1)}%`, background: cat.color }}
                      />
                    </div>
                  </div>
                )
              })}

              {incomeRange !== 'ALL' && (
                <p className="text-xs text-gray-600 pt-1">
                  * Price Appreciation always reflects current unrealized P/L on all holdings.
                  Transaction-based income filtered to {INCOME_RANGES.find(r => r.id === incomeRange)?.label}.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Monthly bar chart */}
        <div className="bg-surface-1 border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
              Monthly Income ({monthlyRange === 'All' ? 'All Time' : `Last ${monthlyRange}`})
            </h3>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1">
                {MONTHLY_RANGES.map(r => (
                  <button
                    key={r.id}
                    onClick={() => { setMonthlyRange(r.id); setSelectedCell(null) }}
                    className={`px-2 py-0.5 text-xs rounded transition-colors ${
                      monthlyRange === r.id
                        ? 'bg-accent/20 text-accent border border-accent/40'
                        : 'border border-border text-gray-500 hover:text-gray-300 hover:border-gray-500'
                    }`}
                  >{r.id}</button>
                ))}
              </div>
              {CHART_CATS.map(c => {
                const active = filteredCat === c.key
                const dimmed = filteredCat && !active
                return (
                  <button
                    key={c.key}
                    onClick={() => { setFilteredCat(f => f === c.key ? null : c.key); setSelectedCell(null) }}
                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-colors ${
                      active  ? 'bg-surface-3 ring-1 ring-white/20' :
                      dimmed  ? 'opacity-30 hover:opacity-60' :
                      'hover:bg-surface-3'
                    }`}
                    title={active ? 'Click to show all' : `Filter to ${c.label} only`}
                  >
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: c.color }} />
                    <span className="text-xs text-gray-500">{c.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <MonthlyBarChart
            data={monthly}
            selectedCell={selectedCell}
            filteredCat={filteredCat}
            onSelect={cell => setSelectedCell(prev =>
              prev?.monthKey === cell.monthKey && prev?.catKey === cell.catKey ? null : cell
            )}
          />

          {/* Drill-down panel */}
          {selectedCell && (() => {
            const catDef    = CHART_CATS.find(c => c.key === selectedCell.catKey)
            const monthDef  = monthly.find(m => m.key === selectedCell.monthKey)
            const total     = drillDown.reduce((s, r) => s + r.value, 0)
            const isRealized = selectedCell.catKey === 'realized'
            return (
              <div className="mt-3 border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-surface-2 border-b border-border">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: catDef?.color }} />
                    <span className="text-xs font-semibold text-gray-200">
                      {monthDef?.label} · {catDef?.label}
                    </span>
                    <span className="text-xs text-gray-500">
                      {drillDown.length} tx · Total:
                    </span>
                    <span className={`text-xs font-semibold tabular-nums ${pnlClass(total)}`}>{fmtUsd(total)}</span>
                  </div>
                  <button onClick={() => setSelectedCell(null)} className="text-gray-600 hover:text-gray-300 transition-colors text-sm leading-none px-1">✕</button>
                </div>

                {drillDown.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-gray-600">No transactions found for this period.</div>
                ) : (
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-gray-600 uppercase tracking-wider">
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-left">Asset</th>
                          <th className="px-4 py-2 text-right">Qty</th>
                          <th className="px-4 py-2 text-right">Price</th>
                          {isRealized && <th className="px-4 py-2 text-right">Avg Cost</th>}
                          <th className="px-4 py-2 text-right">{isRealized ? 'Net Gain' : 'Value'}</th>
                          <th className="px-4 py-2 text-left">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {drillDown.map(({ tx, value, avgCost }) => (
                          <tr key={tx.id} className={`hover:bg-surface-2 transition-colors ${value < 0 ? 'bg-red-500/5' : ''}`}>
                            <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{fmtDate(tx.date)}</td>
                            <td className="px-4 py-2 font-medium text-gray-200">{tx.asset?.symbol ?? '?'}</td>
                            <td className="px-4 py-2 text-right num text-gray-300">{fmtQty(Number(tx.qty))}</td>
                            <td className="px-4 py-2 text-right num text-gray-300">{fmtUsd(Number(tx.price_usd))}</td>
                            {isRealized && (
                              <td className="px-4 py-2 text-right num text-gray-500">{avgCost != null ? fmtUsd(avgCost) : '—'}</td>
                            )}
                            <td className={`px-4 py-2 text-right num font-semibold ${pnlClass(value)}`}>{fmtUsd(value)}</td>
                            <td className="px-4 py-2 text-gray-600 max-w-[180px] truncate" title={tx.notes ?? ''}>{tx.notes ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </section>

      {/* ── Airdrops ─────────────────────────────────────────────────── */}
      {airdropGroups.length > 0 && (() => {
        const totalValue    = airdropGroups.reduce((s, g) => s + (g.currentValue ?? 0), 0)
        const totalGain     = airdropGroups.reduce((s, g) => s + (g.gain ?? 0), 0)
        const totalEvents   = airdropGroups.reduce((s, g) => s + g.dropCount, 0)
        const best          = airdropGroups[0]
        const missed        = airdropGroups.filter(g => g.exitNote && g.exitNote.delta < 0)
        const goodExits     = airdropGroups.filter(g => g.exitNote && g.exitNote.delta > 0)

        const STATUS_BADGE = {
          holding: 'bg-green-500/15 text-green-400 border border-green-500/20',
          partial: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20',
          sold:    'bg-gray-500/15 text-gray-400 border border-gray-500/20',
        }
        const STATUS_LABEL = { holding: 'Holding', partial: 'Partial', sold: 'Sold' }

        return (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Airdrops Received</h2>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Drop Events',   value: totalEvents,               fmt: n => n.toString(),  cls: 'text-gray-100' },
                { label: 'Unique Tokens', value: airdropGroups.length,      fmt: n => n.toString(),  cls: 'text-gray-100' },
                { label: 'Current Value', value: totalValue,                fmt: fmtUsd,             cls: 'text-green-400' },
                { label: 'Free Gain',     value: totalGain,                 fmt: fmtUsd,             cls: pnlClass(totalGain) },
              ].map(({ label, value, fmt, cls }) => (
                <div key={label} className="bg-surface-1 border border-border rounded-lg px-4 py-3">
                  <div className={`text-lg font-semibold ${cls}`}>{fmt(value)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* Highlight callout */}
            {best.currentValue != null && best.currentValue > 0 && (
              <div className="bg-violet-500/10 border border-violet-500/25 rounded-lg px-4 py-3 flex flex-wrap gap-x-6 gap-y-1 items-center">
                <div className="text-xs text-violet-300 font-semibold uppercase tracking-wider flex-shrink-0">
                  Best drop
                </div>
                <div className="text-sm text-gray-100 flex items-center gap-2">
                  <span className="font-bold">{best.symbol}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-green-400 font-semibold">{fmtUsd(best.currentValue)}</span>
                  <span className="text-gray-500 text-xs">current value from {fmtQty(best.totalQty)} tokens received free</span>
                </div>
                {missed.length > 0 && (
                  <>
                    <div className="text-xs text-red-400 font-semibold uppercase tracking-wider flex-shrink-0">
                      Sold low
                    </div>
                    <div className="text-sm text-gray-300 flex items-center gap-1.5 flex-wrap">
                      {missed.slice(0, 2).map(g => (
                        <span key={g.assetId} className="flex items-center gap-1">
                          <span className="font-medium text-red-400">{g.symbol}</span>
                          <span className="text-xs text-gray-500">({fmtUsd(Math.abs(g.exitNote.delta))} left on table)</span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {goodExits.length > 0 && missed.length === 0 && (
                  <>
                    <div className="text-xs text-green-400 font-semibold uppercase tracking-wider flex-shrink-0">
                      Good exits
                    </div>
                    <div className="text-sm text-gray-300">
                      {goodExits.slice(0, 2).map(g => (
                        <span key={g.assetId} className="mr-3">
                          <span className="font-medium text-green-400">{g.symbol}</span>
                          <span className="text-xs text-gray-500 ml-1">(+{fmtUsd(g.exitNote.delta)} vs holding)</span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Airdrop table */}
            <div className="bg-surface-1 border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Asset</th>
                    <th className="px-4 py-3 text-center hidden sm:table-cell">Events</th>
                    <th className="px-4 py-3 text-right hidden md:table-cell">Qty Rcv'd</th>
                    <th className="px-4 py-3 text-right hidden lg:table-cell">Rcv'd Value</th>
                    <th className="px-4 py-3 text-right hidden md:table-cell">Price Now</th>
                    <th className="px-4 py-3 text-right">Current Value</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">Free Gain</th>
                    <th className="px-4 py-3 text-center hidden sm:table-cell">Status</th>
                    <th className="px-4 py-3 text-right hidden lg:table-cell">First Drop</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {airdropGroups.map(g => {
                    const md = marketData[g.cgId]
                    const isUp = (md?.change24h ?? 0) >= 0
                    return (
                      <tr key={g.assetId} className="hover:bg-surface-2 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div>
                              <div className="font-semibold text-gray-100">{g.symbol}</div>
                              <div className="text-xs text-gray-500">{g.name}</div>
                            </div>
                            {md?.sparkline && (
                              <MiniSparkline data={md.sparkline} up={isUp} w={48} h={18} />
                            )}
                          </div>
                          {/* Notes tags */}
                          {g.notesTags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {g.notesTags.slice(0, 2).map(n => (
                                <span key={n} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-gray-500 max-w-[120px] truncate">
                                  {n}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          <span className="text-xs bg-violet-500/15 text-violet-400 px-2 py-0.5 rounded-full border border-violet-500/20">
                            ×{g.dropCount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right num text-gray-300 hidden md:table-cell">
                          {fmtQty(g.totalQty)}
                        </td>
                        <td className="px-4 py-3 text-right num hidden lg:table-cell">
                          {g.rcvdValue > 0
                            ? <span className="text-gray-400">{fmtUsd(g.rcvdValue)}</span>
                            : <span className="text-violet-400 font-medium text-xs">FREE</span>}
                        </td>
                        <td className="px-4 py-3 text-right num text-gray-300 hidden md:table-cell">
                          {g.currentPrice != null ? (
                            <div>
                              <div>{fmtUsd(g.currentPrice)}</div>
                              {md?.change24h != null && (
                                <div className={`text-xs ${pnlClass(md.change24h)}`}>{fmtPct(md.change24h)}</div>
                              )}
                            </div>
                          ) : <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right num">
                          {g.currentValue != null
                            ? <span className="font-semibold text-gray-100">{fmtUsd(g.currentValue)}</span>
                            : <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right num hidden sm:table-cell">
                          {g.gain != null ? (
                            <div>
                              <div className={pnlClass(g.gain)}>{fmtUsd(g.gain)}</div>
                              {/* Exit quality note */}
                              {g.exitNote && (
                                <div className={`text-[10px] mt-0.5 ${g.exitNote.delta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  {g.exitNote.delta > 0
                                    ? `+${fmtUsd(g.exitNote.delta)} vs hold`
                                    : `${fmtUsd(g.exitNote.delta)} vs hold`}
                                </div>
                              )}
                            </div>
                          ) : <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[g.status]}`}>
                            {STATUS_LABEL[g.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-500 hidden lg:table-cell whitespace-nowrap">
                          {g.firstDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })()}

      {/* ── Asset insights summary ───────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Asset Snapshot</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {assetRows
            .filter(r => r.grossInvested > 0 || r.realizedPnl !== 0)
            .sort((a, b) => Math.abs(b.totalPnl) - Math.abs(a.totalPnl))
            .slice(0, 9)
            .map(row => {
              const totalPnl = row.totalPnl
              return (
                <div key={row.id} className="bg-surface-1 border border-border rounded-lg px-4 py-3 hover:border-accent/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-100">{row.symbol}</span>
                        {row.md?.sparkline && (
                          <MiniSparkline data={row.md.sparkline} up={(row.md.change24h ?? 0) >= 0} w={48} h={18} />
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{row.name}</div>
                    </div>
                    <div className={`text-sm font-semibold flex-shrink-0 ${pnlClass(totalPnl)}`}>
                      {fmtUsd(totalPnl)}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="text-gray-600">Invested</div>
                    <div className="text-right text-gray-400 tabular-nums">{fmtUsd(row.grossInvested)}</div>
                    <div className="text-gray-600">Unrealized</div>
                    <div className={`text-right tabular-nums ${pnlClass(row.unrealizedPnl)}`}>
                      {row.unrealizedPnl != null ? fmtUsd(row.unrealizedPnl) : '—'}
                    </div>
                    <div className="text-gray-600">Realized</div>
                    <div className={`text-right tabular-nums ${pnlClass(row.realizedPnl)}`}>
                      {fmtUsd(row.realizedPnl)}
                    </div>
                    {row.totalPct != null && (
                      <>
                        <div className="text-gray-600">Total return</div>
                        <div className={`text-right tabular-nums font-medium ${pnlClass(row.totalPct)}`}>
                          {fmtPct(row.totalPct)}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
        </div>
      </section>
    </div>
  )
}
