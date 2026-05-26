import { useState } from 'react'
import { fmtUsd, fmtPct, pnlClass } from '../utils/format'

function AddressTag({ address, onRemove }) {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-2 text-xs text-gray-300">
      {short}
      <button onClick={() => onRemove(address)} className="text-gray-500 hover:text-red-400 ml-0.5">×</button>
    </span>
  )
}

export function PolymarketTracker({ portfolioId, portfolioName, pmkt }) {
  const [input, setInput] = useState('')
  const [showDebug, setShowDebug] = useState(false)

  const {
    addresses, addAddress, removeAddress,
    open, positions, proxyWallets,
    loading, error,
    consolidate, setConsolidate,
    pusdInput, setPusdInput, manualPusd,
    positionsValue, totalValue, totalInvested, totalPnl,
  } = pmkt

  function handleAdd() {
    const ok = addAddress(input)
    if (ok) setInput('')
  }

  return (
    <div className="space-y-4">
      {/* Address input */}
      <div className="bg-surface-1 border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            Wallet Addresses
            {portfolioName && <span className="normal-case text-gray-600"> · {portfolioName}</span>}
          </p>
          {portfolioId && open.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={consolidate}
                onChange={e => setConsolidate(e.target.checked)}
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
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="0x… wallet address"
            className="flex-1 bg-surface border border-border rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleAdd}
            className="px-3 py-1.5 text-sm rounded border border-border hover:border-accent hover:text-accent transition-colors"
          >
            Add
          </button>
        </div>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          <label className="text-xs text-gray-500 whitespace-nowrap">PUSD balance</label>
          <input
            type="number" min="0" step="0.01"
            value={pusdInput}
            onChange={e => setPusdInput(e.target.value)}
            placeholder="0.00"
            className="w-32 bg-surface border border-border rounded px-2 py-1 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent"
          />
          <span className="text-xs text-gray-600">not in public API — copy from Polymarket → Portfolio</span>
        </div>
      </div>

      {loading && <div className="text-center py-8 text-gray-500 text-sm">Fetching positions…</div>}

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-sm text-red-400">{error}</div>
      )}

      {!loading && !error && addresses.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            <div className="bg-surface-1 border border-border rounded-lg px-3 sm:px-4 py-3 min-w-0">
              <p className="text-xs text-gray-500 mb-0.5 truncate">Current Value</p>
              <p className="text-base sm:text-xl font-semibold num truncate">{fmtUsd(totalValue)}</p>
              {manualPusd > 0 && (
                <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">
                  {fmtUsd(positionsValue)} pos · {fmtUsd(manualPusd)} PUSD
                </p>
              )}
            </div>
            <div className="bg-surface-1 border border-border rounded-lg px-3 sm:px-4 py-3 min-w-0">
              <p className="text-xs text-gray-500 mb-0.5 truncate">Cost Basis</p>
              <p className="text-base sm:text-xl font-semibold num truncate">{fmtUsd(totalInvested)}</p>
            </div>
            <div className="bg-surface-1 border border-border rounded-lg px-3 sm:px-4 py-3 min-w-0">
              <p className="text-xs text-gray-500 mb-0.5 truncate">Total PnL</p>
              <p className={`text-base sm:text-xl font-semibold num truncate ${pnlClass(totalPnl)}`}>{fmtUsd(totalPnl)}</p>
            </div>
          </div>

          <div className="bg-surface-1 border border-border rounded-lg p-3">
            <button
              onClick={() => setShowDebug(v => !v)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              {showDebug ? '▾' : '▸'} Debug ({positions.length} positions, {open.length} open)
            </button>
            {showDebug && (
              <pre className="mt-2 text-xs text-gray-400 overflow-x-auto max-h-64 leading-relaxed">
                {JSON.stringify({
                  proxyWallets,
                  sample: positions.slice(0, 3).map(p => ({
                    size: p.size, avgPrice: p.avgPrice, currentPrice: p.currentPrice,
                    initialValue: p.initialValue, currentValue: p.currentValue,
                    redeemed: p.redeemed, outcome: p.outcome,
                    title: (p.title ?? p.question ?? '').slice(0, 50),
                  })),
                }, null, 2)}
              </pre>
            )}
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
                    <th className="px-4 py-3 text-left hidden sm:table-cell">Outcome</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">Shares</th>
                    <th className="px-4 py-3 text-right hidden md:table-cell">Avg Price</th>
                    <th className="px-4 py-3 text-right hidden md:table-cell">Cur Price</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3 text-right">PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {open.map((p, i) => {
                    const invested = Number(p.size) * Number(p.avgPrice ?? 0)
                    const value    = Number(p.currentValue ?? (Number(p.size) * Number(p.currentPrice ?? 0)))
                    const pnl      = value - invested
                    const pct      = invested > 0 ? (pnl / invested) * 100 : null
                    const outcome  = p.outcome ?? p.side ?? '—'
                    const title    = p.title ?? p.question ?? p.market?.question ?? 'Unknown market'
                    return (
                      <tr key={i} className="hover:bg-surface-2 transition-colors">
                        <td className="px-4 py-3 max-w-xs">
                          <div className="flex items-center gap-1.5 mb-0.5 sm:hidden">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              outcome.toLowerCase() === 'yes' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                            }`}>{outcome}</span>
                          </div>
                          <div className="text-gray-200 text-xs leading-snug line-clamp-2">{title}</div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            outcome.toLowerCase() === 'yes' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                          }`}>
                            {outcome}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right num text-gray-300 hidden sm:table-cell">{Number(p.size ?? 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right num text-gray-400 hidden md:table-cell">{Number(p.avgPrice ?? 0).toFixed(3)}</td>
                        <td className="px-4 py-3 text-right num text-gray-400 hidden md:table-cell">{Number(p.currentPrice ?? 0).toFixed(3)}</td>
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
