import { useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fmtUsd } from '../utils/format'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_BYTES = 4.5 * 1024 * 1024 // 4.5 MB — Anthropic limit

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function BulkReview({ rows, onConfirm, onBack, saving }) {
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

      <div className="border border-border rounded-lg overflow-hidden">
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

      <div className="flex justify-between items-center pt-1">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
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
          {saving ? 'Saving…' : `Import ${selected.size} transaction${selected.size !== 1 ? 's' : ''}`}
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
    setLoading(true)
    setError(null)
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

      // Parse the result — always expect a JSON array
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
        // Single text-parsed tx → pre-fill form as before
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
      // Resolve asset IDs and build rows
      const rows = []
      for (const tx of selectedTxs) {
        const symbol = (tx.symbol ?? '').toUpperCase()
        if (!symbol) continue

        // Look up or create asset
        let assetId = null
        const { data: existing } = await supabase
          .from('assets')
          .select('id')
          .ilike('symbol', symbol)
          .limit(1)
          .single()

        if (existing?.id) {
          assetId = existing.id
        } else if (tx.name) {
          const { data: created } = await supabase
            .from('assets')
            .upsert(
              { symbol, name: tx.name, category: 'spot', coingecko_id: symbol.toLowerCase() },
              { onConflict: 'coingecko_id' }
            )
            .select('id')
            .single()
          assetId = created?.id
        }

        if (!assetId) continue

        let date = new Date().toISOString()
        if (tx.date) {
          try { const d = new Date(tx.date); if (!isNaN(d)) date = d.toISOString() } catch {}
        }

        const rawType = (tx.type ?? 'buy').toLowerCase().replace(/\s+/g, '_')
        const validTypes = ['buy', 'sell', 'transfer_in', 'transfer_out', 'earn']
        const type = validTypes.includes(rawType) ? rawType : 'buy'

        rows.push({
          portfolio_id: portfolioId,
          asset_id: assetId,
          type,
          qty: parseFloat(tx.qty) || 0,
          price_usd: parseFloat(tx.price_usd) || 0,
          fee_usd: parseFloat(tx.fee_usd) || 0,
          date,
          notes: tx.notes || null,
        })
      }

      if (rows.length === 0) throw new Error('Could not resolve any assets. Check symbols.')
      const { error: err } = await onBulkSave(rows)
      if (err) throw new Error(err.message)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
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
        <BulkReview rows={parsed} onConfirm={handleBulkConfirm} onBack={() => setParsed(null)} saving={saving} />
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
