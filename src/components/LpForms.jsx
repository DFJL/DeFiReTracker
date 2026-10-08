import { useState, useMemo } from 'react'
import { diffSnapshots } from '../utils/lp'
import { fmtUsd, fmtQty, pnlClass } from '../utils/format'

const inputCls = 'w-full bg-surface-2 border border-border text-gray-200 text-sm rounded px-3 py-1.5 focus:outline-none focus:border-accent placeholder-gray-600'
const labelCls = 'block text-xs text-gray-500 mb-1'

function FormButtons({ onCancel, saving, label }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" onClick={onCancel} className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors">
        Cancel
      </button>
      <button type="submit" disabled={saving}
        className="px-4 py-1.5 text-sm bg-accent hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-50">
        {saving ? 'Saving…' : label}
      </button>
    </div>
  )
}

export function LpPositionForm({ assets, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '', protocol: 'beefy', chain: '', pair_type: 'v2', token0_id: '', token1_id: '', external_ref: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    if (form.token0_id === form.token1_id) { setError('Pick two different tokens'); return }
    setSaving(true)
    const t0 = assets.find(a => a.id === form.token0_id)
    const t1 = assets.find(a => a.id === form.token1_id)
    const { error: err } = await onSave({
      ...form,
      name: form.name.trim() || `${t0?.symbol}-${t1?.symbol}`,
      protocol: form.protocol.trim() || null,
      chain: form.chain.trim() || null,
      external_ref: form.external_ref.trim() || null,
      notes: form.notes.trim() || null,
    })
    setSaving(false)
    if (err) setError(err.message)
  }

  const tokenSelect = (field, label) => (
    <div>
      <label className={labelCls}>{label}</label>
      <select value={form[field]} onChange={e => set(field, e.target.value)} className={inputCls} required>
        <option value="">Select…</option>
        {assets.map(a => <option key={a.id} value={a.id}>{a.symbol}</option>)}
      </select>
    </div>
  )

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {tokenSelect('token0_id', 'Token 0')}
        {tokenSelect('token1_id', 'Token 1')}
        <div>
          <label className={labelCls}>Name</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. ETH-USDC (auto)" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Pool type</label>
          <select value={form.pair_type} onChange={e => set('pair_type', e.target.value)} className={inputCls}>
            <option value="v2">Constant product (fees / IL split)</option>
            <option value="other">Other (stable, weighted…)</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Protocol</label>
          <input value={form.protocol} onChange={e => set('protocol', e.target.value)} placeholder="beefy" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Chain</label>
          <input value={form.chain} onChange={e => set('chain', e.target.value)} placeholder="hyperevm" className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Vault / pool address</label>
          <input value={form.external_ref} onChange={e => set('external_ref', e.target.value)} placeholder="Optional" className={inputCls} />
        </div>
      </div>
      {error && <p className="text-xs text-loss">{error}</p>}
      <FormButtons onCancel={onCancel} saving={saving} label="Create position" />
    </form>
  )
}

const toLocalInput = d => new Date(d).toISOString().slice(0, 16)

function EventPreview({ events, error, symbols }) {
  if (error) return <div className="rounded px-3 py-2 text-xs border bg-red-500/10 border-red-500/20 text-red-400">{error}</div>
  if (!events.length) {
    return <div className="rounded px-3 py-2 text-xs border bg-surface-2 border-border text-gray-500">No change from the previous snapshot.</div>
  }
  return (
    <div className="rounded border border-border bg-surface-2 divide-y divide-border text-xs">
      {events.map((e, i) => (
        <div key={i} className="px-3 py-2 space-y-1">
          {e.kind === 'performance' ? (
            <>
              <div className="flex justify-between"><span className="text-gray-300">Performance</span>
                <span className={`num ${pnlClass(e.valueUsd)}`}>{fmtUsd(e.valueUsd)}</span></div>
              <div className="grid grid-cols-3 gap-2 text-gray-500">
                <div>Price <span className={`num block ${pnlClass(e.priceUsd)}`}>{fmtUsd(e.priceUsd)}</span></div>
                <div>IL <span className={`num block ${pnlClass(e.ilUsd)}`}>{e.ilUsd == null ? '—' : fmtUsd(e.ilUsd)}</span></div>
                <div>Fees <span className={`num block ${pnlClass(e.feesUsd)}`}>{e.feesUsd == null ? '—' : fmtUsd(e.feesUsd)}</span></div>
              </div>
              {Math.abs(e.otherUsd) > 0.005 && (
                <div className="text-gray-500">{e.feesUsd == null ? 'IL + fees (unsplit)' : 'Unexplained adjustment'}:
                  <span className={`num ml-1 ${pnlClass(e.otherUsd)}`}>{fmtUsd(e.otherUsd)}</span></div>
              )}
            </>
          ) : (
            <div className="flex justify-between gap-2">
              <span className={e.kind === 'deposit' ? 'text-green-400' : 'text-red-400'}>
                {e.kind === 'deposit' ? 'Deposit' : 'Withdrawal'} · {fmtQty(e.amount0)} {symbols[0]} + {fmtQty(e.amount1)} {symbols[1]}
              </span>
              <span className="num text-gray-300">{fmtUsd(e.valueUsd)}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function LpSnapshotForm({ position, snapshots, prices, onSave, onCancel }) {
  const sorted = useMemo(() => [...snapshots].sort((a, b) => new Date(a.ts) - new Date(b.ts)), [snapshots])
  const last = sorted[sorted.length - 1]
  const priceOf = asset => prices?.[asset?.coingecko_id]
  const [form, setForm] = useState({
    ts: toLocalInput(new Date()),
    shares: last ? String(last.shares) : '',
    amount0: last ? String(last.amount0) : '',
    amount1: last ? String(last.amount1) : '',
    price0: String(priceOf(position.token0) ?? last?.price0_usd ?? ''),
    price1: String(priceOf(position.token1) ?? last?.price1_usd ?? ''),
    flow0: '', flow1: '', notes: '', tx_hash: '',
  })
  const [showFlow, setShowFlow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const symbols = [position.token0?.symbol ?? 'T0', position.token1?.symbol ?? 'T1']

  const num = v => (v === '' ? NaN : Number(v))
  const candidate = {
    ts: new Date(form.ts).toISOString(),
    shares: num(form.shares), amount0: num(form.amount0), amount1: num(form.amount1),
    price0: num(form.price0), price1: num(form.price1),
    flow: form.flow0 !== '' && form.flow1 !== '' ? { amount0: num(form.flow0), amount1: num(form.flow1) } : undefined,
  }
  const complete = [candidate.shares, candidate.amount0, candidate.amount1, candidate.price0, candidate.price1].every(Number.isFinite)

  // Preview against the closest earlier snapshot; later ones are recalculated on save.
  const prev = [...sorted].reverse().find(s => new Date(s.ts) < new Date(candidate.ts))
  const laterCount = sorted.filter(s => new Date(s.ts) >= new Date(candidate.ts)).length
  const preview = useMemo(() => {
    if (!complete) return { events: [], error: null }
    try {
      const p = prev && {
        shares: Number(prev.shares), amount0: Number(prev.amount0), amount1: Number(prev.amount1),
        price0: Number(prev.price0_usd), price1: Number(prev.price1_usd), ts: prev.ts,
      }
      return { events: diffSnapshots(p ?? null, candidate, { pairType: position.pair_type }), error: null }
    } catch (e) {
      return { events: [], error: e.message }
    }
  }, [form, complete, prev?.id])

  async function submit(e) {
    e.preventDefault()
    if (!complete || preview.error) return
    setSaving(true)
    const { error: err } = await onSave({
      ts: candidate.ts,
      shares: candidate.shares, amount0: candidate.amount0, amount1: candidate.amount1,
      price0_usd: candidate.price0, price1_usd: candidate.price1,
      flow0: candidate.flow?.amount0 ?? null, flow1: candidate.flow?.amount1 ?? null,
      source: 'manual', tx_hash: form.tx_hash.trim() || null, notes: form.notes.trim() || null,
    })
    setSaving(false)
    if (err) setError(err.message)
  }

  const field = (k, label, props = {}) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input type="number" step="any" min="0" value={form[k]} onChange={e => set(k, e.target.value)}
        className={inputCls} placeholder="0" {...props} />
    </div>
  )

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="text-xs text-gray-500">
        {position.name} · enter what the whole position holds now. Deposits and withdrawals are detected from the change in shares.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Date</label>
          <input type="datetime-local" value={form.ts} onChange={e => set('ts', e.target.value)} className={inputCls} required />
        </div>
        {field('shares', 'Shares (LP / vault tokens)', { required: true })}
        {field('amount0', `${symbols[0]} in position`, { required: true })}
        {field('amount1', `${symbols[1]} in position`, { required: true })}
        {field('price0', `${symbols[0]} price (USD)`, { required: true })}
        {field('price1', `${symbols[1]} price (USD)`, { required: true })}
      </div>

      <button type="button" onClick={() => setShowFlow(s => !s)} className="text-xs text-accent hover:underline">
        {showFlow ? '− Hide' : '+ Set'} exact amounts moved (needed for full withdrawals)
      </button>
      {showFlow && (
        <div className="grid grid-cols-2 gap-3">
          {field('flow0', `${symbols[0]} deposited / withdrawn`)}
          {field('flow1', `${symbols[1]} deposited / withdrawn`)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Tx hash</label>
          <input value={form.tx_hash} onChange={e => set('tx_hash', e.target.value)} placeholder="Optional" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" className={inputCls} />
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">
          Change since {prev ? new Date(prev.ts).toLocaleDateString() : 'start'}
        </p>
        <EventPreview events={preview.events} error={preview.error} symbols={symbols} />
        {laterCount > 0 && (
          <p className="text-xs text-yellow-500 mt-1.5">{laterCount} later snapshot(s) will be recalculated against this one.</p>
        )}
      </div>

      {error && <p className="text-xs text-loss">{error}</p>}
      <FormButtons onCancel={onCancel} saving={saving || !complete || !!preview.error} label="Save snapshot" />
    </form>
  )
}
