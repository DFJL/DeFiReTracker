import { useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { lookupCoinGeckoId } from '../lib/priceService'
import { fmtUsd } from '../utils/format'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_BYTES = 4.5 * 1024 * 1024 // 4.5 MB — Anthropic limit

// ── CoinGecko deterministic parser ──────────────────────────────────────────
const CG_TYPE_MAP = { 'Buy':'buy', 'Sell':'sell', 'Transfer In':'transfer_in', 'Transfer Out':'transfer_out', 'Earn':'earn' }
const CG_TX_TYPES = new Set(Object.keys(CG_TYPE_MAP))
const CG_STABLES  = new Set(['USDC','USDT','PYUSD','DAI','BUSD','TUSD','FDUSD','USDS','USDP'])
const CG_MONTHS   = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }

function cgParseDate(s) {
  const m = s.match(/(\d{1,2})\s+(\w{3})\s+(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  const [, d, mon, yr, hr, min, ap] = m
  let h = parseInt(hr)
  if (ap.toUpperCase() === 'PM' && h !== 12) h += 12
  if (ap.toUpperCase() === 'AM' && h === 12) h = 0
  return `${yr}-${CG_MONTHS[mon]||'01'}-${d.padStart(2,'0')}T${String(h).padStart(2,'0')}:${min}`
}
function cgParseNum(s) {
  const m = s.match(/[+-]?\$?([\d,]+\.?\d*)/)
  return m ? parseFloat(m[1].replace(/,/g,'')) : 0
}
function cgIsTxLine(s) { return CG_TX_TYPES.has(s) || s.startsWith('Showing ') }

function parseCoinGeckoText(raw) {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!lines.some(l => CG_TX_TYPES.has(l))) return null

  // Extract symbol (first standalone all-caps 2–8 char token)
  let symbol = '', name = ''
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    if (/^[A-Z]{2,8}$/.test(lines[i])) {
      symbol = lines[i]
      const prev = lines[i - 1] || ''
      if (prev && !/logo/i.test(prev) && !/^\$/.test(prev)) name = prev
      break
    }
  }
  if (!symbol) return null

  const isStable = CG_STABLES.has(symbol)
  const txs = []

  // Advance to first transaction type line
  let i = 0
  while (i < lines.length && !CG_TX_TYPES.has(lines[i])) i++

  while (i < lines.length) {
    const txType = CG_TYPE_MAP[lines[i]]
    if (!txType) { i++; continue }
    if (i + 7 >= lines.length) break

    // lines: i=type, i+1=price, i+2=qty, i+3=date, i+4=fees, i+5=cost, i+6=proceeds, i+7=pnl, i+8=notes?
    const maybeNotes = lines[i + 8] ?? ''
    const hasNotes   = !!maybeNotes && !cgIsTxLine(maybeNotes)
    const notes      = hasNotes ? maybeNotes : ''

    let price = cgParseNum(lines[i + 1])
    if (price === 0 && isStable) price = 1
    const qty  = cgParseNum(lines[i + 2])
    const date = cgParseDate(lines[i + 3])
    const fee  = cgParseNum(lines[i + 4])

    if (qty > 0 && date) {
      txs.push({ symbol, name, type: txType, qty, price_usd: price, fee_usd: fee, date, notes })
    }
    i += hasNotes ? 9 : 8
  }
  return txs.length > 0 ? txs : null
}
// ────────────────────────────────────────────────────────────────────────────

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function BulkReview({ rows, onConfirm, onBack, saving, saveStatus }) {
  const [selected, setSelected] = useState(() => new Set(rows.map((_, i) => i)))

  function toggle(i) {
    setSelected(s => {
      const next = new Set(s)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const selectedRows = rows.filter((_, i) => selected.has(i))

  const TX_COLOR = {
    buy: 'text-green-400', sell: 'text-red-400',
    earn: 'text-green-400', transfer_in: 'text-blue-400', transfer_out: 'text-orange-400',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          AI found <span className="text-gray-200 font-semibold">{rows.length}</span> transaction{rows.length !== 1 ? 's' : ''}.
          Select which to import.
        </p>
        <label className="text-xs text-gray-500 flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={selected.size === rows.length}
            onChange={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((_, i) => i)))}
            className="accent-accent"
          />
          All
        </label>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-gray-500 uppercase tracking-wider">
              <th className="px-3 py-2 text-left w-8"></th>
              <th className="px-3 py-2 text-left">Asset</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right hidden sm:table-cell">Price</th>
              <th className="px-3 py-2 text-right hidden sm:table-cell">Date</th>
              <th className="px-3 py-2 text-left">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((tx, i) => (
              <tr
                key={i}
                onClick={() => toggle(i)}
                className={`cursor-pointer transition-colors ${selected.has(i) ? 'bg-surface-2' : 'opacity-40'}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                    onClick={e => e.stopPropagation()}
                    className="accent-accent"
                  />
                </td>
                <td className="px-3 py-2 font-semibold text-gray-100">{tx.symbol}</td>
                <td className={`px-3 py-2 capitalize ${TX_COLOR[tx.type] ?? 'text-gray-400'}`}>
                  {(tx.type ?? '').replace('_', ' ')}
                </td>
                <td className="px-3 py-2 text-right text-gray-300 num">{Number(tx.qty ?? 0).toLocaleString()}</td>
                <td className="px-3 py-2 text-right text-gray-400 num hidden sm:table-cell">
                  {tx.price_usd > 0 ? fmtUsd(tx.price_usd) : '—'}
                </td>
                <td className="px-3 py-2 text-right text-gray-500 hidden sm:table-cell">
                  {tx.date ? tx.date.slice(0, 10) : '—'}
                </td>
                <td className="px-3 py-2 text-gray-500 max-w-[180px]">
                  <span className="line-clamp-1 text-xs" title={tx.notes ?? ''}>{tx.notes || '—'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {saving && saveStatus && (
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>{saveStatus.label}</span>
            <span>{saveStatus.pct}%</span>
          </div>
          <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${saveStatus.pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex justify-between items-center pt-1">
        <button onClick={onBack} disabled={saving} className="text-sm text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40">
          ← Back
        </button>
        <button
          onClick={() => onConfirm(selectedRows)}
          disabled={selected.size === 0 || saving}
          className="px-4 py-1.5 text-sm bg-accent hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {saving && (
            <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {saving ? saveStatus?.label ?? 'Saving…' : `Import ${selected.size} transaction${selected.size !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}

export function NLTransactionModal({ portfolioId, onParsedSingle, onBulkSave, onClose }) {
  const [text, setText] = useState('')
  const [image, setImage] = useState(null) // { file, preview, base64, mediaType }
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // { label, pct }
  const [error, setError] = useState(null)
  const [parsed, setParsed] = useState(null) // array of tx objects
  const fileInputRef = useRef(null)

  async function handleFile(file) {
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Unsupported file type. Use JPG, PNG, WebP, or GIF.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Image too large (max 4.5 MB).')
      return
    }
    const base64 = await toBase64(file)
    const preview = URL.createObjectURL(file)
    setImage({ file, preview, base64, mediaType: file.type })
    setError(null)
  }

  const onDrop = useCallback(async e => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    await handleFile(file)
  }, [])

  const onDragOver = useCallback(e => { e.preventDefault(); setDragging(true) }, [])
  const onDragLeave = useCallback(() => setDragging(false), [])

  async function handleParse() {
    if (!text.trim() && !image) return
    setError(null)

    // Try deterministic CoinGecko parser first — instant, no token limits
    if (text.trim() && !image) {
      const cgTxs = parseCoinGeckoText(text.trim())
      if (cgTxs) {
        if (cgTxs.length === 1) { onParsedSingle(cgTxs[0]) }
        else { setParsed(cgTxs) }
        return
      }
    }

    // Fall back to AI for freeform text or images
    setLoading(true)
    try {
      const body = {
        mode: 'parse-transaction',
        text: text.trim() || null,
        imageBase64: image?.base64 ?? null,
        imageMediaType: image?.mediaType ?? 'image/jpeg',
      }
      const { data, error: fnErr } = await supabase.functions.invoke('ai-analyzer', { body })
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) throw new Error(data.error)

      let txs
      try {
        const raw = (data.result ?? '').trim()
        const jsonStr = raw.startsWith('[') || raw.startsWith('{')
          ? raw
          : raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
        const parsed = JSON.parse(jsonStr)
        txs = Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        throw new Error('AI returned an unreadable format. Try rephrasing or use a clearer image.')
      }

      if (txs.length === 0) throw new Error('No transactions found. Try a different image or description.')

      if (txs.length === 1 && !image) {
        onParsedSingle(txs[0])
      } else {
        setParsed(txs)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleBulkConfirm(selectedTxs) {
    setSaving(true)
    setError(null)
    try {
      // Step 1: batch-resolve all unique symbols in ONE query
      setSaveStatus({ label: 'Resolving assets…', pct: 10 })
      const uniqueSymbols = [...new Set(
        selectedTxs.map(tx => (tx.symbol ?? '').toUpperCase()).filter(Boolean)
      )]
      if (!uniqueSymbols.length) throw new Error('No valid symbols in selected transactions.')

      const { data: existingAssets, error: lookupErr } = await supabase
        .from('assets').select('id, symbol').in('symbol', uniqueSymbols)
      if (lookupErr) throw new Error(`Asset lookup failed: ${lookupErr.message}`)
      const assetMap = new Map((existingAssets ?? []).map(a => [a.symbol.toUpperCase(), a.id]))

      // Step 2: create any missing assets
      const missing = uniqueSymbols.filter(s => !assetMap.has(s))
      if (missing.length) {
        setSaveStatus({ label: `Looking up ${missing.length} new asset${missing.length > 1 ? 's' : ''}…`, pct: 25 })
        // Resolve coingecko IDs in parallel via CoinGecko search
        const lookups = await Promise.all(missing.map(sym => lookupCoinGeckoId(sym)))
        const cgMap = Object.fromEntries(missing.map((sym, i) => [sym, lookups[i]]))

        setSaveStatus({ label: `Creating ${missing.length} new asset${missing.length > 1 ? 's' : ''}…`, pct: 35 })
        for (const sym of missing) {
          const txForSym = selectedTxs.find(tx => (tx.symbol ?? '').toUpperCase() === sym)
          const cg = cgMap[sym]
          const coingecko_id = cg?.id ?? sym.toLowerCase()
          const name = cg?.name || txForSym?.name || sym
          const { data: inserted, error: insertErr } = await supabase
            .from('assets')
            .insert({ symbol: sym, name, category: 'spot', coingecko_id })
            .select('id')
            .single()
          if (inserted?.id) {
            assetMap.set(sym, inserted.id)
          } else {
            // Unique constraint hit — fetch existing row
            const { data: found, error: fetchErr } = await supabase
              .from('assets').select('id').eq('symbol', sym).limit(1)
            const existing = found?.[0]
            if (existing?.id) {
              assetMap.set(sym, existing.id)
            } else {
              throw new Error(`Could not create or find asset "${sym}". ${insertErr?.message ?? fetchErr?.message ?? ''}`)
            }
          }
        }
      }

      // Step 3: build rows (synchronous — no DB round trips)
      setSaveStatus({ label: 'Preparing rows…', pct: 60 })
      const validTypes = new Set(['buy', 'sell', 'transfer_in', 'transfer_out', 'earn'])
      const rows = selectedTxs.flatMap(tx => {
        const symbol = (tx.symbol ?? '').toUpperCase()
        const assetId = assetMap.get(symbol)
        if (!assetId) return []
        let date = new Date().toISOString()
        if (tx.date) { try { const d = new Date(tx.date); if (!isNaN(d)) date = d.toISOString() } catch {} }
        const type = validTypes.has((tx.type ?? '').toLowerCase()) ? tx.type.toLowerCase() : 'buy'
        return [{ portfolio_id: portfolioId, asset_id: assetId, type,
          qty: parseFloat(tx.qty) || 0, price_usd: parseFloat(tx.price_usd) || 0,
          fee_usd: parseFloat(tx.fee_usd) || 0, date, notes: tx.notes || null }]
      })

      if (rows.length === 0) {
        const unresolved = selectedTxs.map(tx => (tx.symbol ?? '').toUpperCase()).filter(s => !assetMap.has(s))
        throw new Error(`Could not resolve assets: ${unresolved.join(', ') || 'unknown'}. assetMap has: ${[...assetMap.keys()].join(', ') || 'nothing'}.`)
      }

      // Step 4: single bulk insert
      setSaveStatus({ label: `Saving ${rows.length} transaction${rows.length !== 1 ? 's' : ''}…`, pct: 85 })
      const { error: err } = await onBulkSave(rows)
      if (err) throw new Error(err.message)
      setSaveStatus({ label: 'Done!', pct: 100 })
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
      setSaveStatus(null)
    }
  }

  const examples = [
    'Bought 0.5 ETH at $3,000 yesterday',
    'Sold 100 HYPE at $25.50 on May 20',
    'Earned 50 USDC staking today',
  ]

  if (parsed) {
    return (
      <div className="space-y-3">
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded p-3 text-sm text-red-400">{error}</div>
        )}
        <BulkReview rows={parsed} onConfirm={handleBulkConfirm} onBack={() => setParsed(null)} saving={saving} saveStatus={saveStatus} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Type a transaction description, paste a screenshot, or drag an image from any exchange or app.
      </p>

      {/* Image drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !image && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg transition-colors ${
          dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-gray-500'
        } ${image ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={e => handleFile(e.target.files?.[0])}
        />

        {image ? (
          <div className="relative">
            <img
              src={image.preview}
              alt="Uploaded screenshot"
              className="w-full max-h-48 object-contain rounded-lg bg-surface-2"
            />
            <button
              onClick={e => { e.stopPropagation(); setImage(null) }}
              className="absolute top-2 right-2 bg-surface-1/80 border border-border rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-400 transition-colors text-sm"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 gap-2 text-gray-600">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            <p className="text-xs text-center">
              Drop a screenshot here or <span className="text-accent">click to upload</span>
            </p>
            <p className="text-xs text-gray-700">JPG, PNG, WebP, GIF · max 4.5 MB</p>
          </div>
        )}
      </div>

      {/* Text input */}
      <div className="space-y-2">
        {!image && (
          <div className="flex flex-wrap gap-1.5">
            {examples.map(ex => (
              <button
                key={ex}
                onClick={() => setText(ex)}
                className="text-xs px-2 py-1 rounded border border-border text-gray-500 hover:text-gray-300 hover:border-accent transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && e.metaKey && handleParse()}
          placeholder={image
            ? 'Optional: add context (exchange name, date range…)'
            : 'Paste transaction history (CoinGecko, Binance, etc.) or describe in plain language…'}
          rows={image ? 2 : 10}
          className="w-full bg-surface-2 border border-border text-gray-200 text-sm rounded px-3 py-2 focus:outline-none focus:border-accent placeholder-gray-600 resize-y font-mono text-xs leading-relaxed"
          autoFocus={!image}
        />
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded p-3 text-sm text-red-400">
          {error}
          {error.includes('configured') && (
            <p className="text-xs mt-1 text-red-500">Set ANTHROPIC_API_KEY in your Supabase project secrets.</p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleParse}
          disabled={(!text.trim() && !image) || loading}
          className="px-4 py-1.5 text-sm bg-accent hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading && (
            <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {loading
            ? (image ? 'Analyzing image…' : 'Parsing…')
            : (image ? 'Analyze with AI' : 'Parse with AI')}
        </button>
      </div>
    </div>
  )
}
