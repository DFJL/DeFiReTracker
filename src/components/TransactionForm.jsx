import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TX_TYPES = ['buy', 'sell', 'transfer_in', 'transfer_out', 'earn', 'deposit', 'withdrawal']
const CASH_TYPES = new Set(['deposit', 'withdrawal'])
const CATEGORIES = ['spot', 'stablecoin', 'defi', 'rwa']

const EMPTY = {
  type: 'buy',
  qty: '',
  price_usd: '',
  fee_usd: '',
  date: new Date().toISOString().slice(0, 16),
  notes: '',
  _assetSearch: '',
  _assetId: '',
  _category: 'spot',
  _coingeckoId: '',
  _symbol: '',
  _name: '',
}

function buildInitial(initial, nlPrefill) {
  if (initial) {
    const a = initial.asset ?? {}
    return {
      ...EMPTY,
      ...initial,
      date: initial.date?.slice(0, 16) ?? EMPTY.date,
      _assetId: initial.asset_id ?? '',
      _assetSearch: a.symbol ?? '',
      _category: a.category ?? 'spot',
      _coingeckoId: a.coingecko_id ?? '',
      _symbol: a.symbol ?? '',
      _name: a.name ?? '',
    }
  }
  if (nlPrefill) {
    // Normalize type
    const rawType = (nlPrefill.type ?? 'buy').toLowerCase().replace(/\s+/g, '_')
    const type = TX_TYPES.includes(rawType) ? rawType : 'buy'
    // Normalize date
    let date = EMPTY.date
    if (nlPrefill.date) {
      try {
        const d = new Date(nlPrefill.date)
        if (!isNaN(d)) date = d.toISOString().slice(0, 16)
      } catch {}
    }
    const symbol = (nlPrefill.symbol ?? '').toUpperCase()
    return {
      ...EMPTY,
      type,
      qty: nlPrefill.qty != null ? String(nlPrefill.qty) : '',
      price_usd: nlPrefill.price_usd != null ? String(nlPrefill.price_usd) : '',
      fee_usd: nlPrefill.fee_usd != null ? String(nlPrefill.fee_usd) : '',
      date,
      notes: nlPrefill.notes ?? '',
      _assetSearch: symbol,
      _symbol: symbol,
      _name: nlPrefill.name ?? '',
    }
  }
  return { ...EMPTY }
}

export function TransactionForm({ portfolioId, initial, nlPrefill, onSave, onCancel }) {
  const [form, setForm] = useState(() => buildInitial(initial, nlPrefill))
  const [assetResults, setAssetResults] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const isCash = CASH_TYPES.has(form.type)

  // Auto-search asset when pre-filled from NL
  useEffect(() => {
    if (nlPrefill?.symbol && !form._assetId) {
      const sym = nlPrefill.symbol.toUpperCase()
      supabase.from('assets').select('*').ilike('symbol', sym).limit(5)
        .then(({ data }) => setAssetResults(data ?? []))
    }
  }, [])

  useEffect(() => {
    const q = form._assetSearch.trim()
    if (!q || q.length < 2) { setAssetResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('assets')
        .select('*')
        .or(`symbol.ilike.%${q}%,name.ilike.%${q}%`)
        .limit(8)
      setAssetResults(data ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [form._assetSearch])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function selectAsset(asset) {
    setForm(f => ({
      ...f,
      _assetId: asset.id,
      _assetSearch: asset.symbol,
      _category: asset.category,
      _coingeckoId: asset.coingecko_id,
      _symbol: asset.symbol,
      _name: asset.name,
    }))
    setAssetResults([])
  }

  async function ensureAsset() {
    if (form._assetId) return form._assetId
    if (!form._coingeckoId || !form._symbol || !form._name) return null
    const { data } = await supabase
      .from('assets')
      .upsert(
        { coingecko_id: form._coingeckoId, symbol: form._symbol.toUpperCase(), name: form._name, category: form._category },
        { onConflict: 'coingecko_id' }
      )
      .select()
      .single()
    return data?.id ?? null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      let assetId = null
      if (!isCash) {
        assetId = await ensureAsset()
        if (!assetId) { setError('Select or create an asset first'); return }
      }

      const payload = {
        portfolio_id: portfolioId,
        asset_id: assetId,
        type: form.type,
        qty: parseFloat(form.qty),
        price_usd: isCash ? 1 : parseFloat(form.price_usd),
        fee_usd: parseFloat(form.fee_usd || '0'),
        date: new Date(form.date).toISOString(),
        notes: form.notes || null,
      }
      if (initial?.id) payload.id = initial.id

      const { error: err } = await onSave(payload)
      if (err) setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-surface-2 border border-border text-gray-200 text-sm rounded px-3 py-1.5 focus:outline-none focus:border-accent placeholder-gray-600'
  const labelCls = 'block text-xs text-gray-500 mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {nlPrefill && (
        <div className="bg-accent/10 border border-accent/30 rounded px-3 py-2 text-xs text-accent">
          Pre-filled by AI — review all fields before saving.
        </div>
      )}

      {/* Type selector always visible */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Type</label>
          <select value={form.type} onChange={e => set('type', e.target.value)} className={inputCls}>
            <optgroup label="Trades">
              {['buy','sell'].map(t => <option key={t}>{t}</option>)}
            </optgroup>
            <optgroup label="Transfers">
              {['transfer_in','transfer_out','earn'].map(t => <option key={t}>{t.replace('_',' ')}</option>)}
            </optgroup>
            <optgroup label="Cash flows">
              {['deposit','withdrawal'].map(t => <option key={t}>{t}</option>)}
            </optgroup>
          </select>
        </div>
        <div>
          <label className={labelCls}>Date</label>
          <input type="datetime-local" value={form.date} onChange={e => set('date', e.target.value)} className={inputCls} />
        </div>
      </div>

      {isCash ? (
        /* ── Cash-flow simplified form ── */
        <>
          <div className={`rounded px-3 py-2 text-xs border ${form.type === 'deposit' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
            {form.type === 'deposit'
              ? 'Record real money entering this portfolio from outside (bank, CEX withdrawal, etc.).'
              : 'Record real money leaving this portfolio back to fiat or an external account.'}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls}>Amount (USD)</label>
              <input type="number" step="any" value={form.qty} onChange={e => set('qty', e.target.value)} placeholder="0.00" className={inputCls} required />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls}>Notes</label>
              <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. Binance withdrawal, salary DCA…" className={inputCls} />
            </div>
          </div>
        </>
      ) : (
        /* ── Normal crypto transaction form ── */
        <>
          <div className="relative">
            <label className={labelCls}>Asset</label>
            <input
              value={form._assetSearch}
              onChange={e => set('_assetSearch', e.target.value)}
              placeholder="Search symbol or name…"
              className={inputCls}
              autoComplete="off"
            />
            {assetResults.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-surface-2 border border-border rounded shadow-xl">
                {assetResults.map(a => (
                  <button key={a.id} type="button" onClick={() => selectAsset(a)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surface-3 flex items-center gap-2">
                    <span className="font-semibold text-gray-100">{a.symbol}</span>
                    <span className="text-gray-400">{a.name}</span>
                  </button>
                ))}
              </div>
            )}
            {!form._assetId && form._assetSearch && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>CoinGecko ID</label>
                  <input value={form._coingeckoId} onChange={e => set('_coingeckoId', e.target.value)} placeholder="bitcoin" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Symbol</label>
                  <input value={form._symbol} onChange={e => set('_symbol', e.target.value)} placeholder="BTC" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Category</label>
                  <select value={form._category} onChange={e => set('_category', e.target.value)} className={inputCls}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Quantity</label>
              <input type="number" step="any" value={form.qty} onChange={e => set('qty', e.target.value)} placeholder="0.00" className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>Price (USD)</label>
              <input type="number" step="any" value={form.price_usd} onChange={e => set('price_usd', e.target.value)} placeholder="0.00" className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>Fee (USD)</label>
              <input type="number" step="any" value={form.fee_usd} onChange={e => set('fee_usd', e.target.value)} placeholder="0.00" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" className={inputCls} />
            </div>
          </div>
        </>
      )}

      {error && <p className="text-xs text-loss">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="px-4 py-1.5 text-sm bg-accent hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : initial?.id ? 'Update' : 'Add'}
        </button>
      </div>
    </form>
  )
}
