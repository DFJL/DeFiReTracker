import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseBeefyHistory, swapRow, detectSwap, checkRows } from '../utils/beefy'
import { summarizePosition } from '../utils/lp'
import { fetchPricesAt } from '../lib/historicalPriceService'
import { fmtUsd, fmtQty, fmtDate, pnlClass } from '../utils/format'

const inputCls = 'w-full bg-surface-2 border border-border text-gray-200 text-sm rounded px-3 py-1.5 focus:outline-none focus:border-accent placeholder-gray-600'
const cellInput = 'w-20 bg-surface-2 border border-border text-gray-200 text-xs rounded px-1.5 py-1 focus:outline-none focus:border-accent num'
const labelCls = 'block text-xs text-gray-500 mb-1'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024 // Anthropic's image limit

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error('Could not read the image'))
    reader.readAsDataURL(file)
  })
}

// Beefy shows its own USD balance per row; a row priced far from it deserves a look.
const CHECK_WARN_PCT = 8

export function LpBeefyImport({ position, existingCount, prices, onSave, onCancel }) {
  const [text, setText] = useState('')
  const [swap, setSwap] = useState(false)
  const [raw, setRaw] = useState(null)            // parsed rows in Beefy's token order, with editable prices
  const [detected, setDetected] = useState(null)  // note about the auto-detected token order
  const [errors, setErrors] = useState([])
  const [fetching, setFetching] = useState(false)
  const [current, setCurrent] = useState({ shares: '', amount0: '', amount1: '', fees: '' })
  const [reading, setReading] = useState(false)   // transcribing screenshots
  const [ocrNote, setOcrNote] = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const [s0, s1] = [position.token0?.symbol ?? 'T0', position.token1?.symbol ?? 'T1']

  // Screenshots are transcribed to the same text the paste box takes, so the user reviews it
  // before anything is parsed or saved.
  async function readImages(files) {
    const images = [...files].filter(f => f.type.startsWith('image/'))
    if (!images.length) return
    setErrors([])
    setOcrNote(null)
    setReading(true)
    const chunks = []
    try {
      for (const file of images) {
        if (!IMAGE_TYPES.includes(file.type)) throw new Error(`${file.name || 'Image'}: unsupported type ${file.type}`)
        if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name || 'Image'} is larger than 4.5 MB`)
        const { data, error } = await supabase.functions.invoke('beefy-ocr', {
          body: { imageBase64: await fileToBase64(file), imageMediaType: file.type },
        })
        if (error) {
          let msg = error.message
          try { msg = (await error.context.json()).error ?? msg } catch { /* keep generic message */ }
          throw new Error(msg)
        }
        if (data?.error) throw new Error(data.error)
        chunks.push(data.result.trim())
      }
      setText(t => [t.trim(), ...chunks].filter(Boolean).join('\n'))
      setOcrNote(`Transcribed ${images.length} screenshot${images.length === 1 ? '' : 's'} by AI. Check the text against the image, then parse. Rows whose numbers don't add up are flagged.`)
    } catch (e) {
      setErrors([`Screenshot reading failed: ${e.message}`])
    } finally {
      setReading(false)
    }
  }

  function onPaste(e) {
    const files = [...(e.clipboardData?.files ?? [])].filter(f => f.type.startsWith('image/'))
    if (files.length) { e.preventDefault(); readImages(files) }
  }

  async function parse() {
    setSaveError(null)
    const { rows: parsed, errors: errs } = parseBeefyHistory(text)
    setErrors(errs)
    if (!parsed.length) { setRaw(null); return }
    setFetching(true)
    const ids = [position.token0?.coingecko_id, position.token1?.coingecko_id]
    const priced = await Promise.all(parsed.map(async r => {
      const p = await fetchPricesAt(ids, r.ts)
      return { ...r, price0: p[ids[0]] ?? '', price1: p[ids[1]] ?? '' }
    }))
    const flip = detectSwap(priced)
    if (flip != null) {
      setSwap(flip)
      setDetected(flip ? `Beefy lists ${s1} first — amounts matched to the right tokens.` : null)
    }
    setRaw(priced)
    setFetching(false)
  }

  // Prices belong to the position's token0/token1; flipping the order only moves the amounts.
  const rows = useMemo(() => (raw ? raw.map(r => (swap ? swapRow(r) : r)) : null), [raw, swap])
  const checks = useMemo(() => (rows ? checkRows(rows) : []), [rows])
  const badRows = checks.filter(c => !c.ok).length
  const setPrice = (i, k, v) => setRaw(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r))

  // Engine-shaped snapshots: history rows, plus an optional "current" snapshot.
  const snapshots = useMemo(() => {
    if (!rows) return []
    const list = rows.map(r => {
      const last = r.shares === 0
      return {
        ts: r.ts, shares: r.shares, amount0: r.amount0, amount1: r.amount1,
        price0: Number(r.price0), price1: Number(r.price1),
        flow: last ? { amount0: r.moved0, amount1: r.moved1 } : undefined,
      }
    })
    const c = current
    if (c.shares !== '' && c.amount0 !== '' && c.amount1 !== '') {
      list.push({
        ts: new Date().toISOString(), shares: Number(c.shares), amount0: Number(c.amount0), amount1: Number(c.amount1),
        price0: Number(prices?.[position.token0?.coingecko_id]), price1: Number(prices?.[position.token1?.coingecko_id]),
        feesCumUsd: c.fees !== '' ? Number(c.fees) : undefined,
      })
    }
    return list
  }, [rows, current, prices, position])

  const pricesOk = snapshots.length > 0 && snapshots.every(s => s.price0 > 0 && s.price1 > 0)
  const preview = useMemo(() => {
    if (!pricesOk) return { summary: null, error: null }
    try {
      return { summary: summarizePosition(snapshots, { pairType: position.pair_type }), error: null }
    } catch (e) {
      return { summary: null, error: e.message }
    }
  }, [snapshots, pricesOk, position.pair_type])

  async function save() {
    setSaving(true)
    setSaveError(null)
    const { error } = await onSave(snapshots.map(s => ({
      ts: s.ts, shares: s.shares, amount0: s.amount0, amount1: s.amount1,
      price0_usd: s.price0, price1_usd: s.price1,
      flow0: s.flow?.amount0 ?? null, flow1: s.flow?.amount1 ?? null,
      fees_cum_usd: s.feesCumUsd ?? null,
      source: 'import', notes: 'Beefy history import',
    })))
    setSaving(false)
    if (error) setSaveError(error.message)
  }

  return (
    <div className="space-y-4">
      {existingCount > 0 && (
        <div className="rounded px-3 py-2 text-xs border bg-yellow-500/10 border-yellow-500/20 text-yellow-400">
          This position already has {existingCount} snapshot(s). Imported rows are added to them, so don't import the same history twice.
        </div>
      )}

      <div>
        <label className={labelCls}>Paste the transaction history table from the Beefy vault page</label>
        <textarea value={text} onChange={e => setText(e.target.value)} onPaste={onPaste} rows={6}
          placeholder={'15 Jul 2026, 07:58:41\n3.4400878\n0.033158\n47.739158\n0.4601443\n1.3932791\n$4,151'}
          className={`${inputCls} font-mono text-xs`} />
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); readImages(e.dataTransfer.files) }}
          onClick={() => fileRef.current?.click()}
          className={`mt-2 border border-dashed rounded px-3 py-2 text-xs text-center cursor-pointer transition-colors ${
            dragging ? 'border-accent text-accent' : 'border-border text-gray-500 hover:text-gray-300'}`}>
          {reading ? 'Reading screenshot…' : 'Or drop, paste (Ctrl+V) or click to add screenshots of the table'}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => { readImages(e.target.files); e.target.value = '' }} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-xs text-gray-400 select-none cursor-pointer">
          <input type="checkbox" checked={swap} onChange={e => setSwap(e.target.checked)} className="accent-accent" />
          Beefy lists {s1} first, then {s0}
        </label>
        <button onClick={parse} disabled={!text.trim() || fetching}
          className="px-3 py-1.5 text-sm bg-accent hover:bg-indigo-500 text-white rounded disabled:opacity-50">
          {fetching ? 'Fetching prices…' : 'Parse & fetch prices'}
        </button>
      </div>

      {ocrNote && <p className="text-xs text-accent">{ocrNote}</p>}
      {detected && <p className="text-xs text-accent">{detected}</p>}
      {errors.map((e, i) => <p key={i} className="text-xs text-loss">{e}</p>)}

      {rows && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 text-left">
                  <th className="py-1 pr-2">Date</th>
                  <th className="pr-2 text-right">{s0} in vault</th><th className="pr-2 text-right">{s1} in vault</th>
                  <th className="pr-2 text-right">Shares</th><th className="pr-1"></th>
                  <th className="pr-2">{s0} $</th><th className="pr-2">{s1} $</th>
                  <th className="pr-2 text-right">Value</th><th className="text-right">vs Beefy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => {
                  const value = r.amount0 * Number(r.price0) + r.amount1 * Number(r.price1)
                  const diff = r.usdBalance > 0 && value > 0 ? ((value - r.usdBalance) / r.usdBalance) * 100 : null
                  const warn = diff == null || Math.abs(diff) > CHECK_WARN_PCT
                  return (
                    <tr key={i}>
                      <td className="py-1.5 pr-2 text-gray-400 whitespace-nowrap">{fmtDate(r.ts)}</td>
                      <td className="pr-2 text-right num text-gray-300">{fmtQty(r.amount0)}</td>
                      <td className="pr-2 text-right num text-gray-300">{fmtQty(r.amount1)}</td>
                      <td className="pr-2 text-right num text-gray-400">{fmtQty(r.shares)}</td>
                      <td className="pr-1 text-yellow-500" title={checks[i]?.ok === false ? checks[i].problem : ''}>{checks[i]?.ok === false ? '⚠' : ''}</td>
                      <td className="pr-2"><input type="number" step="any" value={r.price0} onChange={e => setPrice(i, 'price0', e.target.value)} className={cellInput} /></td>
                      <td className="pr-2"><input type="number" step="any" value={r.price1} onChange={e => setPrice(i, 'price1', e.target.value)} className={cellInput} /></td>
                      <td className="pr-2 text-right num text-gray-300">{fmtUsd(value, 0)}</td>
                      <td className={`text-right num ${warn ? 'text-yellow-500' : 'text-gray-500'}`}>
                        {diff == null ? 'no price' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}% of ${fmtUsd(r.usdBalance, 0)}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">
            Prices come from DeFiLlama at each timestamp; edit any that look off. “vs Beefy” compares the value with Beefy's own USD balance for that row.
          </p>

          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">Current state (optional, valued at live prices)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><label className={labelCls}>Shares now</label>
                <input type="number" step="any" value={current.shares} onChange={e => setCurrent(c => ({ ...c, shares: e.target.value }))} className={inputCls} /></div>
              <div><label className={labelCls}>{s0} now</label>
                <input type="number" step="any" value={current.amount0} onChange={e => setCurrent(c => ({ ...c, amount0: e.target.value }))} className={inputCls} /></div>
              <div><label className={labelCls}>{s1} now</label>
                <input type="number" step="any" value={current.amount1} onChange={e => setCurrent(c => ({ ...c, amount1: e.target.value }))} className={inputCls} /></div>
              <div><label className={labelCls}>Yield (USD)</label>
                <input type="number" step="any" value={current.fees} onChange={e => setCurrent(c => ({ ...c, fees: e.target.value }))} placeholder="Beefy yield" className={inputCls} /></div>
            </div>
          </div>

          {badRows > 0 && (
            <p className="text-xs text-yellow-500">
              {badRows} row{badRows === 1 ? '' : 's'} marked ⚠: the deposit doesn't match the change in shares, which usually means a
              misread or mistyped number. Fix the text above and parse again.
            </p>
          )}
          {rows.length > 0 && current.shares !== '' &&
            Math.abs(Number(current.shares) - rows[rows.length - 1].shares) > 1e-3 * rows[rows.length - 1].shares && (
            <p className="text-xs text-yellow-500">
              Current shares ({fmtQty(Number(current.shares))}) differ from the last pasted row ({fmtQty(rows[rows.length - 1].shares)}).
              Rows are probably missing from the paste; the difference would be booked as a deposit today.
            </p>
          )}
          {preview.error && <p className="text-xs text-loss">{preview.error}</p>}
          {preview.summary && (
            <div className="rounded border border-border bg-surface-2 px-3 py-2 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div><span className="text-gray-500 block">Deposited</span><span className="num text-gray-200">{fmtUsd(preview.summary.depositedUsd)}</span></div>
              <div><span className="text-gray-500 block">Value</span><span className="num text-gray-200">{fmtUsd(preview.summary.currentValueUsd)}</span></div>
              <div><span className="text-gray-500 block">PnL</span><span className={`num ${pnlClass(preview.summary.pnlUsd)}`}>{fmtUsd(preview.summary.pnlUsd)}</span></div>
              <div><span className="text-gray-500 block">Fees / IL</span>
                <span className="num text-gray-200">{preview.summary.feesKnown ? `${fmtUsd(preview.summary.feesUsd, 0)} / ${fmtUsd(preview.summary.ilUsd, 0)}` : 'enter yield'}</span></div>
            </div>
          )}
          {!pricesOk && <p className="text-xs text-yellow-500">Some prices are missing — fill them in to continue.</p>}
        </>
      )}

      {saveError && <p className="text-xs text-loss">{saveError}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
        <button onClick={save} disabled={!pricesOk || !!preview.error || saving}
          className="px-4 py-1.5 text-sm bg-accent hover:bg-indigo-500 text-white rounded disabled:opacity-50">
          {saving ? 'Saving…' : `Save ${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}
