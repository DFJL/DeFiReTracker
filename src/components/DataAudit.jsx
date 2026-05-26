import { useState, useMemo } from 'react'
import { fmtUsd, fmtQty, fmtDate } from '../utils/format'

const STABLES = new Set([
  'USDC','USDT','DAI','BUSD','FRAX','USDE','USDV','USR',
  'TUSD','LUSD','SUSD','GUSD','PAXUSD','FDUSD','PYUSD',
])

function median(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 !== 0 ? s[m] : (s[m - 1] + s[m]) / 2
}

// --- Pure audit logic ---
export function runAudit(transactions, assets) {
  const findings = []
  const assetMap = Object.fromEntries(assets.map(a => [a.id, a]))

  // 1. Duplicate detection
  const groups = new Map()
  for (const tx of transactions) {
    const key = [
      tx.asset_id, tx.type,
      Number(tx.qty).toFixed(8),
      Number(tx.price_usd).toFixed(6),
      String(tx.date).slice(0, 16),
      (tx.notes ?? '').trim().toLowerCase(),
    ].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(tx)
  }
  for (const [, txs] of groups) {
    if (txs.length < 2) continue
    const tx  = txs[0]
    const asset = assetMap[tx.asset_id]
    const extra = txs.length - 1
    findings.push({
      id:       `dup|${txs.map(t => t.id).sort().join(',')}`,
      type:     'duplicate',
      severity: 'error',
      assetSymbol: asset?.symbol ?? '?',
      title:   `Duplicate transaction ×${txs.length}`,
      detail:  `${txs.length} identical ${tx.type} — ${fmtQty(Number(tx.qty))} ${asset?.symbol ?? ''} on ${fmtDate(tx.date)}${Number(tx.price_usd) > 0 ? ' @ ' + fmtUsd(Number(tx.price_usd)) : ''}`,
      transactions: txs,
      fix: {
        action: 'delete',
        ids:    txs.slice(1).map(t => t.id),
        label:  `Delete ${extra} duplicate${extra > 1 ? 's' : ''}`,
      },
    })
  }

  // 2. Stablecoin price anomaly
  for (const tx of transactions) {
    if (tx.type !== 'sell' && tx.type !== 'buy') continue
    const asset = assetMap[tx.asset_id]
    if (!asset || !STABLES.has(asset.symbol.toUpperCase())) continue
    const price = Number(tx.price_usd)
    const qty   = Number(tx.qty)
    if (price <= 0 || qty <= 0) continue

    if (price > 2.0) {
      // Likely qty/price swapped
      const fixedQty   = price
      const fixedPrice = qty > 0 && qty < 2.0 ? qty : 1.0
      findings.push({
        id:       `stable-swap|${tx.id}`,
        type:     'price_anomaly',
        severity: 'warning',
        assetSymbol: asset.symbol,
        title:   `Stablecoin price/qty swapped`,
        detail:  `${asset.symbol} ${tx.type} at ${fmtUsd(price)}/unit on ${fmtDate(tx.date)} — stablecoins should be ~$1.00. Qty (${fmtQty(qty)}) and price appear swapped.`,
        transactions: [tx],
        fix: {
          action: 'update',
          transaction: { ...tx, qty: fixedQty, price_usd: fixedPrice },
          label: `Set qty = ${Number(fixedQty.toFixed(4)).toLocaleString()}, price = ${fmtUsd(fixedPrice)}`,
        },
      })
    } else if (price < 0.01 && qty > 1) {
      findings.push({
        id:       `stable-low|${tx.id}`,
        type:     'price_anomaly',
        severity: 'warning',
        assetSymbol: asset.symbol,
        title:   `Stablecoin price near zero`,
        detail:  `${asset.symbol} ${tx.type} at $${price}/unit on ${fmtDate(tx.date)} — total proceeds ${fmtUsd(price * qty)}. Expected ~$1.00/unit.`,
        transactions: [tx],
        fix: {
          action: 'update',
          transaction: { ...tx, price_usd: 1.0 },
          label: `Set price = $1.00 (total → ${fmtUsd(qty)})`,
        },
      })
    }
  }

  // 3. Price outlier: sell price far below asset median → possibly total entered as unit price
  const assetPrices = new Map()
  for (const tx of transactions) {
    if (tx.type !== 'sell' && tx.type !== 'buy') continue
    const price = Number(tx.price_usd)
    if (price <= 0) continue
    const asset = assetMap[tx.asset_id]
    if (!asset || STABLES.has(asset.symbol.toUpperCase())) continue
    if (!assetPrices.has(tx.asset_id)) assetPrices.set(tx.asset_id, [])
    assetPrices.get(tx.asset_id).push(price)
  }

  for (const tx of transactions) {
    if (tx.type !== 'sell') continue
    const price = Number(tx.price_usd)
    const qty   = Number(tx.qty)
    if (price <= 0 || qty <= 0) continue
    const asset = assetMap[tx.asset_id]
    if (!asset || STABLES.has(asset.symbol.toUpperCase())) continue

    const prices = assetPrices.get(tx.asset_id) ?? []
    if (prices.length < 2) continue
    const med = median(prices)
    if (med <= 0 || price >= med * 0.10) continue

    // If price/qty ≈ median → user likely entered total proceeds as unit price
    const corrected = price / qty
    if (corrected > med * 0.25 && corrected < med * 4) {
      findings.push({
        id:       `outlier|${tx.id}`,
        type:     'price_outlier',
        severity: 'warning',
        assetSymbol: asset.symbol,
        title:   `Price far below typical`,
        detail:  `${asset.symbol} sell at ${fmtUsd(price)}/unit on ${fmtDate(tx.date)} (typical ~${fmtUsd(med)}). Total: ${fmtUsd(price * qty)}. Possibly total proceeds (${fmtUsd(price)}) entered as unit price?`,
        transactions: [tx],
        fix: {
          action: 'update',
          transaction: { ...tx, price_usd: corrected },
          label: `Correct to ${fmtUsd(corrected)}/unit (= ${fmtUsd(price)} ÷ ${fmtQty(qty)})`,
        },
      })
    }
  }

  // 4. Large transaction outlier — single buy/sell value far exceeds typical for this asset
  const assetBuySellEntries = new Map()
  for (const tx of transactions) {
    if (tx.type !== 'buy' && tx.type !== 'sell') continue
    const qty   = Number(tx.qty)
    const price = Number(tx.price_usd)
    if (qty <= 0 || price <= 0) continue
    const asset = assetMap[tx.asset_id]
    if (!asset || STABLES.has(asset.symbol.toUpperCase())) continue
    if (!assetBuySellEntries.has(tx.asset_id)) assetBuySellEntries.set(tx.asset_id, [])
    assetBuySellEntries.get(tx.asset_id).push({ tx, value: qty * price })
  }

  for (const [assetId, entries] of assetBuySellEntries) {
    if (entries.length < 3) continue  // need a baseline to compare against
    const asset = assetMap[assetId]

    for (let i = 0; i < entries.length; i++) {
      const { tx, value } = entries[i]
      if (value < 2000) continue  // skip small absolute amounts

      const otherValues = entries.filter((_, j) => j !== i).map(e => e.value)
      const othersMedian = median(otherValues)
      if (othersMedian <= 0) continue
      const ratio = value / othersMedian
      if (ratio < 10) continue  // must be ≥10× typical to flag

      findings.push({
        id:       `large|${tx.id}`,
        type:     'large_outlier',
        severity: 'warning',
        assetSymbol: asset.symbol,
        title:   `Unusually large ${tx.type}`,
        detail:  `${asset.symbol} ${tx.type} of ${fmtQty(Number(tx.qty))} @ ${fmtUsd(Number(tx.price_usd))} on ${fmtDate(tx.date)} totals ${fmtUsd(value)} — ${Math.round(ratio)}× the typical ${asset.symbol} transaction (${fmtUsd(othersMedian)}). Check for misplaced decimal or wrong quantity.`,
        transactions: [tx],
        fix: {
          action: 'delete',
          ids:    [tx.id],
          label:  'Delete if data entry error — skip if this trade was intentional',
        },
      })
    }
  }

  return findings
}

// --- UI ---
const SEVERITY_STYLE = {
  error:   { dot: 'bg-red-500',    badge: 'bg-red-500/10 text-red-400 border-red-500/20',    label: 'Error'   },
  warning: { dot: 'bg-yellow-400', badge: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20', label: 'Warning' },
}
const TYPE_LABEL = {
  duplicate:    'Duplicate',
  price_anomaly:'Price anomaly',
  price_outlier:'Price outlier',
  large_outlier:'Large outlier',
}

function FindingRow({ finding, onApply, onSkip, applying, skipped }) {
  const sty = SEVERITY_STYLE[finding.severity]
  if (skipped) return (
    <div className="flex items-center gap-3 px-4 py-2.5 opacity-40">
      <span className="text-xs text-gray-600 italic flex-1">Skipped: {finding.title}</span>
      <button onClick={onSkip} className="text-xs text-gray-600 hover:text-gray-400">Undo</button>
    </div>
  )
  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${sty.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-1.5 py-0.5 rounded border ${sty.badge}`}>{sty.label}</span>
            <span className="text-xs font-medium text-gray-300">{finding.assetSymbol}</span>
            <span className="text-xs text-gray-500">{TYPE_LABEL[finding.type]}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">{finding.detail}</p>
          {finding.transactions.length > 1 && (
            <div className="mt-1.5 pl-2 border-l border-border space-y-0.5">
              {finding.transactions.slice(0, 4).map((tx, i) => (
                <div key={tx.id} className="text-xs text-gray-600">
                  #{i + 1} id:{tx.id.slice(0, 8)}…  {tx.type}  {fmtQty(Number(tx.qty))} @ {Number(tx.price_usd) > 0 ? fmtUsd(Number(tx.price_usd)) : '$0'}
                </div>
              ))}
              {finding.transactions.length > 4 && (
                <div className="text-xs text-gray-700">+{finding.transactions.length - 4} more…</div>
              )}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-600">Fix: {finding.fix.label}</span>
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0 mt-0.5">
          <button
            onClick={onApply}
            disabled={applying}
            className="px-2.5 py-1 text-xs bg-accent/80 hover:bg-accent text-white rounded transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {applying ? '…' : 'Apply'}
          </button>
          <button
            onClick={onSkip}
            className="px-2.5 py-1 text-xs border border-border text-gray-500 hover:text-gray-300 hover:border-gray-500 rounded transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}

export function DataAudit({ transactions, assets, onBatchDelete, onUpsert, onClose }) {
  const [applying,   setApplying]   = useState(new Set())
  const [skipped,    setSkipped]    = useState(new Set())
  const [fixingDups, setFixingDups] = useState(false)

  const findings = useMemo(() => runAudit(transactions, assets), [transactions, assets])

  const errors   = findings.filter(f => f.severity === 'error')
  const warnings = findings.filter(f => f.severity === 'warning')
  const dupFindings = findings.filter(f => f.type === 'duplicate')
  const activeCount = findings.filter(f => !skipped.has(f.id)).length

  async function applyFix(finding) {
    setApplying(s => new Set(s).add(finding.id))
    try {
      if (finding.fix.action === 'delete') {
        await onBatchDelete(finding.fix.ids)
      } else {
        await onUpsert(finding.fix.transaction)
      }
    } finally {
      setApplying(s => { const n = new Set(s); n.delete(finding.id); return n })
    }
  }

  async function fixAllDuplicates() {
    setFixingDups(true)
    const active = dupFindings.filter(f => !skipped.has(f.id))
    const ids = active.flatMap(f => f.fix.ids)
    if (ids.length) await onBatchDelete(ids)
    setFixingDups(false)
  }

  function toggleSkip(id) {
    setSkipped(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const sections = [
    { label: 'Errors', items: errors,   color: 'text-red-400' },
    { label: 'Warnings', items: warnings, color: 'text-yellow-400' },
  ].filter(s => s.items.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="w-full max-w-2xl bg-surface-1 border border-border rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-100">Data Audit</h2>
            {findings.length === 0 ? (
              <span className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                Clean
              </span>
            ) : (
              <div className="flex gap-1.5">
                {errors.length   > 0 && <span className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{errors.length} error{errors.length > 1 ? 's' : ''}</span>}
                {warnings.length > 0 && <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-300 border border-yellow-500/20">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-200 transition-colors text-lg leading-none px-1"
          >
            ✕
          </button>
        </div>

        {/* Quick actions */}
        {dupFindings.filter(f => !skipped.has(f.id)).length > 0 && (
          <div className="px-5 py-3 border-b border-border bg-red-500/5 flex items-center justify-between gap-3">
            <p className="text-xs text-red-300">
              {dupFindings.filter(f => !skipped.has(f.id)).length} duplicate group{dupFindings.filter(f => !skipped.has(f.id)).length > 1 ? 's' : ''} found — will delete {dupFindings.filter(f => !skipped.has(f.id)).flatMap(f => f.fix.ids).length} extra rows.
            </p>
            <button
              onClick={fixAllDuplicates}
              disabled={fixingDups}
              className="flex-shrink-0 text-xs px-3 py-1.5 bg-red-600/60 hover:bg-red-600 text-red-100 rounded transition-colors disabled:opacity-50"
            >
              {fixingDups ? 'Fixing…' : 'Fix all duplicates'}
            </button>
          </div>
        )}

        {/* Body */}
        <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
          {findings.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="text-2xl mb-2">✓</div>
              <p className="text-sm text-gray-400">No issues found in {transactions.length} transactions.</p>
            </div>
          ) : sections.map(section => (
            <div key={section.label}>
              <div className="px-4 py-2 bg-surface-2 sticky top-0">
                <span className={`text-xs font-semibold uppercase tracking-wider ${section.color}`}>
                  {section.label} ({section.items.length})
                </span>
              </div>
              <div className="divide-y divide-border">
                {section.items.map(f => (
                  <FindingRow
                    key={f.id}
                    finding={f}
                    applying={applying.has(f.id)}
                    skipped={skipped.has(f.id)}
                    onApply={() => applyFix(f)}
                    onSkip={() => toggleSkip(f.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between text-xs text-gray-600">
          <span>{activeCount} issue{activeCount !== 1 ? 's' : ''} remaining · {skipped.size} skipped</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
