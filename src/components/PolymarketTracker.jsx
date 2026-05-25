import { useState, useEffect } from 'react'
import { fetchPolymarketPositions } from '../lib/polymarketService'
import { fmtUsd, fmtPct, pnlClass } from '../utils/format'

const LS_KEY = 'pmkt_addresses'

function AddressTag({ address, onRemove }) {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-2 text-xs text-gray-300">
      {short}
      <button onClick={() => onRemove(address)} className="text-gray-500 hover:text-red-400 ml-0.5">×</button>
    </span>
  )
}

export function PolymarketTracker() {
  const [addresses, setAddresses] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function saveAddresses(next) {
    setAddresses(next)
    localStorage.setItem(LS_KEY, JSON.stringify(next))
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

  useEffect(() => {
    if (!addresses.length) { setPositions([]); return }
    setLoading(true)
    setError(null)
    Promise.all(addresses.map(fetchPolymarketPositions))
      .then(results => setPositions(results.flat()))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [addresses.join(',')])

  const open = positions.filter(p => !p.closed && Number(p.size ?? p.currentValue ?? 0) > 0)
  const totalValue    = open.reduce((s, p) => s + Number(p.currentValue ?? 0), 0)
  const totalInvested = open.reduce((s, p) => s + Number(p.initialValue ?? p.size * p.avgPrice ?? 0), 0)
  const totalPnl      = totalValue - totalInvested

  return (
    <div className="space-y-4">
      {/* Address input */}
      <div className="bg-surface-1 border border-border rounded-lg p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Wallet Addresses</p>
        <div className="flex gap-2 flex-wrap mb-3">
          {addresses.map(a => (
            <AddressTag key={a} address={a} onRemove={removeAddress} />
          ))}
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

      {loading && (
        <div className="text-center py-8 text-gray-500 text-sm">Fetching positions…</div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && addresses.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Current Value', value: fmtUsd(totalValue), cls: '' },
              { label: 'Invested', value: fmtUsd(totalInvested), cls: '' },
              { label: 'Total PnL', value: fmtUsd(totalPnl), cls: pnlClass(totalPnl) },
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-surface-1 border border-border rounded-lg px-4 py-3">
                <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                <p className={`text-xl font-semibold num ${cls}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Positions table */}
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
                    const invested = Number(p.initialValue ?? (Number(p.size) * Number(p.avgPrice)) ?? 0)
                    const value    = Number(p.currentValue ?? 0)
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
                            outcome.toLowerCase() === 'yes'
                              ? 'bg-green-500/20 text-green-300'
                              : 'bg-red-500/20 text-red-300'
                          }`}>
                            {outcome}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right num text-gray-300">
                          {Number(p.size ?? 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right num text-gray-400">
                          {Number(p.avgPrice ?? 0).toFixed(3)}
                        </td>
                        <td className="px-4 py-3 text-right num text-gray-400">
                          {Number(p.currentPrice ?? p.price ?? 0).toFixed(3)}
                        </td>
                        <td className="px-4 py-3 text-right num text-gray-200">
                          {fmtUsd(value)}
                        </td>
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
