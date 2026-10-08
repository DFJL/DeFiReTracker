import { useMemo, useState } from 'react'
import { useLpPositions } from '../hooks/useLpPositions'
import { useAssets } from '../hooks/useAssets'
import { summarizePosition, fromDbSnapshot, underlyingHoldings } from '../utils/lp'
import { fmtUsd, fmtQty, fmtDate, pnlClass } from '../utils/format'
import { StatCard } from './ui/Card'
import { Modal } from './ui/Modal'
import { LpPositionForm, LpSnapshotForm } from './LpForms'

const KIND_LABEL = { deposit: 'Deposit', withdraw: 'Withdrawal', performance: 'Performance' }

function PositionDetail({ position, snaps, summary, onAddSnapshot, onDeleteSnapshot, onDeletePosition }) {
  const last = snaps[snaps.length - 1]
  const [t0, t1] = [position.token0?.symbol ?? 'T0', position.token1?.symbol ?? 'T1']
  const holdings = last ? underlyingHoldings(fromDbSnapshot(last)) : []

  return (
    <div className="bg-surface-2/50 px-4 py-4 space-y-4 text-xs">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="text-gray-500">
          {[position.protocol, position.chain, position.pair_type === 'v2' ? 'fees/IL split' : 'unsplit', position.external_ref]
            .filter(Boolean).join(' · ')}
        </div>
        <div className="flex gap-2">
          <button onClick={onAddSnapshot} className="px-3 py-1 bg-accent hover:bg-indigo-500 text-white rounded">+ Snapshot</button>
          <button onClick={onDeletePosition} className="px-3 py-1 text-gray-500 hover:text-red-400">Delete position</button>
        </div>
      </div>

      {holdings.length > 0 && (
        <div>
          <p className="text-gray-500 uppercase tracking-wider mb-1.5">Underlying holdings · {fmtDate(last.ts)}</p>
          <div className="grid grid-cols-2 gap-3">
            {holdings.map((h, i) => (
              <div key={i} className="bg-surface-1 border border-border rounded px-3 py-2">
                <div className="text-gray-300">{fmtQty(h.qty)} {i === 0 ? t0 : t1}</div>
                <div className="text-gray-500 num">{fmtUsd(h.valueUsd)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-gray-500 uppercase tracking-wider mb-1.5">Ledger</p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-gray-500 text-left">
                <th className="py-1 pr-3">Date</th><th className="pr-3">Event</th>
                <th className="pr-3 text-right">Value</th><th className="pr-3 text-right hidden sm:table-cell">Price</th>
                <th className="pr-3 text-right hidden sm:table-cell">IL</th><th className="pr-3 text-right hidden sm:table-cell">Fees</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...summary.events].reverse().map((e, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-3 text-gray-400">{fmtDate(e.ts)}</td>
                  <td className="pr-3 text-gray-300">{KIND_LABEL[e.kind]}</td>
                  <td className={`pr-3 text-right num ${e.kind === 'performance' ? pnlClass(e.valueUsd) : 'text-gray-300'}`}>{fmtUsd(e.valueUsd)}</td>
                  <td className="pr-3 text-right num text-gray-400 hidden sm:table-cell">{e.priceUsd != null ? fmtUsd(e.priceUsd) : ''}</td>
                  <td className="pr-3 text-right num text-gray-400 hidden sm:table-cell">{e.ilUsd != null ? fmtUsd(e.ilUsd) : ''}</td>
                  <td className="pr-3 text-right num text-gray-400 hidden sm:table-cell">{e.feesUsd != null ? fmtUsd(e.feesUsd) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="text-gray-500 uppercase tracking-wider mb-1.5">Snapshots</p>
        <div className="space-y-1">
          {[...snaps].reverse().map(s => (
            <div key={s.id} className="flex items-center justify-between gap-2 bg-surface-1 border border-border rounded px-3 py-1.5">
              <span className="text-gray-400">{fmtDate(s.ts)}</span>
              <span className="text-gray-300 num truncate">
                {fmtQty(s.amount0)} {t0} + {fmtQty(s.amount1)} {t1} · {fmtQty(s.shares)} sh
              </span>
              <button onClick={() => onDeleteSnapshot(s.id)} className="text-gray-600 hover:text-red-400">×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function LpManager({ portfolioId, prices }) {
  const lp = useLpPositions(portfolioId)
  const { assets } = useAssets()
  const [modal, setModal] = useState(null) // { type: 'position' } | { type: 'snapshot', position }
  const [openId, setOpenId] = useState(null)
  const [error, setError] = useState(null)

  const rows = useMemo(() => lp.positions.map(position => {
    const snaps = lp.snapshots.filter(s => s.position_id === position.id)
      .sort((a, b) => new Date(a.ts) - new Date(b.ts))
    let summary = null, summaryError = null
    try {
      summary = summarizePosition(snaps.map(fromDbSnapshot), { pairType: position.pair_type })
    } catch (e) {
      summaryError = e.message
    }
    return { position, snaps, summary, summaryError }
  }), [lp.positions, lp.snapshots])

  const totals = rows.reduce((t, r) => r.summary ? {
    value: t.value + r.summary.currentValueUsd,
    pnl: t.pnl + r.summary.pnlUsd,
    fees: t.fees + r.summary.feesUsd,
    il: t.il + r.summary.ilUsd,
  } : t, { value: 0, pnl: 0, fees: 0, il: 0 })

  async function run(fn) {
    setError(null)
    const { error: err } = await fn()
    if (err) { setError(err.message); return false }
    return true
  }

  if (!portfolioId) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Record what each LP position holds over time. Deposits, withdrawals, fees and impermanent loss are derived from the changes.
        </p>
        <button onClick={() => setModal({ type: 'position' })}
          className="px-3 py-1.5 text-sm bg-accent hover:bg-indigo-500 text-white rounded flex-shrink-0">+ New position</button>
      </div>

      {error && <div className="text-xs text-loss bg-red-500/10 border border-red-500/20 rounded px-3 py-2">{error}</div>}

      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="LP value" value={fmtUsd(totals.value)} />
          <StatCard label="LP PnL" value={fmtUsd(totals.pnl)} valueClass={pnlClass(totals.pnl)} />
          <StatCard label="Fees earned" value={fmtUsd(totals.fees)} valueClass={pnlClass(totals.fees)} />
          <StatCard label="Impermanent loss" value={fmtUsd(totals.il)} valueClass={pnlClass(totals.il)} />
        </div>
      )}

      <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">
        {lp.loading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
        {!lp.loading && rows.length === 0 && (
          <p className="p-6 text-sm text-gray-500 text-center">No LP positions yet. Create one, then add a snapshot of what it holds.</p>
        )}
        {rows.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-border">
                <th className="px-4 py-3 text-left">Position</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Deposited</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Fees</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">IL</th>
                <th className="px-4 py-3 text-right">PnL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ position, snaps, summary, summaryError }) => (
                <FragmentRow key={position.id}>
                  <tr className="hover:bg-surface-2 cursor-pointer transition-colors"
                    onClick={() => setOpenId(id => id === position.id ? null : position.id)}>
                    <td className="px-4 py-3">
                      <div className="text-gray-100 font-medium">{position.name}</div>
                      <div className="text-xs text-gray-500">
                        {snaps.length ? `as of ${fmtDate(snaps[snaps.length - 1].ts)}` : 'no snapshots'}
                        {summaryError && <span className="text-loss ml-2">{summaryError}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right num text-gray-200">{summary ? fmtUsd(summary.currentValueUsd) : '—'}</td>
                    <td className="px-4 py-3 text-right num text-gray-400 hidden md:table-cell">{summary ? fmtUsd(summary.depositedUsd - summary.withdrawnUsd) : '—'}</td>
                    <td className={`px-4 py-3 text-right num hidden md:table-cell ${pnlClass(summary?.feesUsd)}`}>{summary ? fmtUsd(summary.feesUsd) : '—'}</td>
                    <td className={`px-4 py-3 text-right num hidden md:table-cell ${pnlClass(summary?.ilUsd)}`}>{summary ? fmtUsd(summary.ilUsd) : '—'}</td>
                    <td className={`px-4 py-3 text-right num ${pnlClass(summary?.pnlUsd)}`}>{summary ? fmtUsd(summary.pnlUsd) : '—'}</td>
                  </tr>
                  {openId === position.id && summary && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <PositionDetail
                          position={position} snaps={snaps} summary={summary}
                          onAddSnapshot={() => setModal({ type: 'snapshot', position })}
                          onDeleteSnapshot={id => confirm('Delete this snapshot? Events will be recalculated.') && run(() => lp.deleteSnapshot(position, id))}
                          onDeletePosition={() => confirm(`Delete ${position.name} and all its history?`) && run(() => lp.deletePosition(position.id))}
                        />
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal?.type === 'position' && (
        <Modal title="New LP position" onClose={() => setModal(null)}>
          <LpPositionForm assets={assets} onCancel={() => setModal(null)}
            onSave={async fields => { const r = await lp.createPosition(fields); if (!r.error) setModal(null); return r }} />
        </Modal>
      )}
      {modal?.type === 'snapshot' && (
        <Modal title={`Add snapshot · ${modal.position.name}`} onClose={() => setModal(null)}>
          <LpSnapshotForm
            position={modal.position}
            snapshots={lp.snapshots.filter(s => s.position_id === modal.position.id)}
            prices={prices}
            onCancel={() => setModal(null)}
            onSave={async fields => { const r = await lp.addSnapshot(modal.position, fields); if (!r.error) setModal(null); return r }}
          />
        </Modal>
      )}
    </div>
  )
}

// A keyed fragment so a position row and its detail row stay siblings in <tbody>.
function FragmentRow({ children }) {
  return <>{children}</>
}
