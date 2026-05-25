import { useState, useEffect } from 'react'
import { fetchPolymarketPositions } from '../lib/polymarketService'
import { fmtUsd, fmtPct, pnlClass } from '../utils/format'

function addrKey(portfolioId) {
  return `pmkt_addresses_${portfolioId ?? 'global'}`
}
function consolidateKey(portfolioId) {
  return `pmkt_consolidate_${portfolioId ?? 'global'}`
}

function AddressTag({ address, onRemove }) {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-2 text-xs text-gray-300">
      {short}
      <button onClick={() => onRemove(address)} className="text-gray-500 hover:text-red-400 ml-0.5">×</button>
    </span>
  )
}

export function PolymarketTracker({ portfolioId, portfolioName, onSummaryChange }) {
  const [addresses, setAddresses] = useState(() => {
    try { return JSON.parse(localStorage.getItem(addrKey(portfolioId)) ?? '[]') } catch { return [] }
  })
  const [input, setInput]       = useState('')
  const [positions, setPositions] = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [consolidate, setConsolidate] = useState(
    () => localStorage.getItem(consolidateKey(portfolioId)) === 'true'
  )

  // Reload addresses and consolidate flag when portfolio changes
  useEffect(() => {
    try { setAddresses(JSON.parse(localStorage.getItem(addrKey(portfolioId)) ?? '[]')) }
    catch { setAddresses([]) }
    setConsolidate(localStorage.getItem(consolidateKey(portfolioId)) === 'true')
    setPositions([])
    setError(null)
  }, [portfolioId])

  function saveAddresses(next) {
    setAddresses(next)
    localStorage.setItem(addrKey(portfolioId), JSON.stringify(next))
  }

  function addAddress() {
    const addr = input.trim()
    if (!addr || addresses.includes(addr)) return
    saveAddresses([...addresses, addr])
    setInput('')
  }

  function removeAddress(addr) {
    saveAddresses(addresses.filter(a => a !== addr))
  }

  function toggleConsolidate(val) {
    setConsolidate(val)
    localStorage.setItem(consolidateKey(portfolioId), String(val))
  }

  useEffect(() => {
    if (!addresses.length) { setPositions([]); return }
    setLoading(true); setError(null)
    Promise.all(addresses.map(fetchPolymarketPositions))
      .then(results => setPositions(results.flat()))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [addresses.join(',')])

  // Open = still holding shares (not redeemed)
  const open = positions.filter(p => Number(p.size ?? 0) > 0 && !p.redeemed)

  // Fix: invested = size × avgPrice (actual USDC spent)
  // initialValue from Polymarket = notional face value (size × $1), NOT cost
  const totalValue    = open.reduce((s, p) => s + Number(p.currentValue ?? (Number(p.size) * Number(p.currentPrice ?? p.price ?? 0))), 0)
  const totalInvested = open.reduce((s, p) => s + Number(p.size) * Number(p.avgPrice ?? 0), 0)
  const totalPnl      = totalValue - totalInvested

  // Notify parent so Dashboard can consolidate
  useEffect(() => {
    onSummaryChange?.(consolidate && open.length > 0
      ? { value: totalValue, invested: totalInvested }
      : null
    )
  }, [consolidate, totalValue, totalInvested, open.length])

  return (
    <div className="space-y-4">
      {/* Address input */}
      <div className="bg-surface-1 border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            Wallet Addresses{portfolioName ? <span className="normal-case text-gray-600"> · {portfolioName}</span> : ''}
          </p>
          {portfolioId && open.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={consolidate}
                onChange={e => toggleConsolidate(e.target.checked)}
                className="accent-accent"
              />
              Include in Dashboard
            </label>
          )}
        </div>
        <div className="flex gap-2 flex-wrap mb-3">
          {addresses.map(a => (
            <AddressTag key={a} address={a} onRemove={removeAddress} />
          ))}
          {addresses.length === 0 && (
            <span className="text-xs text-gray-600 italic">No wallets added for this portfolio</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addAddress()}
            placeholder="0x… wallet address"
            className="flex-1 bg-surface border border-border rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent"
          />
          <button
            onClick={addAddress}
            className="px-3 py-1.5 text-sm rounded border border-border hover:border-accent hover:text-accent transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {loading && <div className="text-center py-8 text-gray-500 text-sm">Fetching positions…</div>}

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-sm text-red-400">{error}</div>
      )}

      {!loading && !error && addresses.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Current Value', value: fmtUsd(totalValue), cls: '' },
              { label: 'Invested',      value: fmtUsd(totalInvested), cls: '' },
              { label: 'Total PnL',     value: fmtUsd(totalPnl), cls: pnlClass(totalPnl) },
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-surface-1 border border-border rounded-lg px-4 py-3">
                <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                <p className={`text-xl font-semibold num ${cls}`}>{value}</p>
              </div>
            ))}
          </div>

          {open.length === 0 ? (
            <div className="bg-surface-1 border border-border rounded-lg p-8 text-center text-gray-500 text-sm">
              No open positions found.
            </div>
          ) : (
            <div className="bg-surface-1 border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Market</th>
                    <th className="px-4 py-3 text-left">Outcome</th>
                    <th className="px-4 py-3 text-right">Shares</th>
                    <th className="px-4 py-3 text-right">Avg Price</th>
                    <th className="px-4 py-3 text-right">Cur Price</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3 text-right">PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {open.map((p, i) => {
                    const invested = Number(p.size) * Number(p.avgPrice ?? 0)
                    const value    = Number(p.currentValue ?? (Number(p.size) * Number(p.currentPrice ?? p.price ?? 0)))
                    const pnl      = value - invested
                    const pct      = invested > 0 ? (pnl / invested) * 100 : null
                    const outcome  = p.outcome ?? p.side ?? '—'
                    const title    = p.title ?? p.question ?? p.market?.question ?? 'Unknown market'
                    return (
                      <tr key={i} className="hover:bg-surface-2 transition-colors">
                        <td className="px-4 py-3 max-w-xs">
                          <div className="text-gray-200 text-xs leading-snug line-clamp-2">{title}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            outcome.toLowerCase() === 'yes' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                          }`}>
                            {outcome}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right num text-gray-300">{Number(p.size ?? 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right num text-gray-400">{Number(p.avgPrice ?? 0).toFixed(3)}</td>
                        <td className="px-4 py-3 text-right num text-gray-400">{Number(p.currentPrice ?? p.price ?? 0).toFixed(3)}</td>
                        <td className="px-4 py-3 text-right num text-gray-200">{fmtUsd(value)}</td>
                        <td className={`px-4 py-3 text-right num ${pnlClass(pnl)}`}>
                          <div>{fmtUsd(pnl)}</div>
                          {pct != null && <div className="text-xs">{fmtPct(pct)}</div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
