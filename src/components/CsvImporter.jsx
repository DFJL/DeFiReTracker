import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseCoinGeckoCsv } from '../utils/csvParser'

export function CsvImporter({ portfolioId, onImported }) {
  const [preview, setPreview] = useState(null)
  const [errors, setErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const inputRef = useRef()

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const { rows, errors } = parseCoinGeckoCsv(ev.target.result)
      setPreview(rows)
      setErrors(errors)
      setResult(null)
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!preview?.length || !portfolioId) return
    setImporting(true)
    try {
      const insertRows = []

      for (const row of preview) {
        const { _symbol, _coingeckoId, _name, ...txData } = row

        const { data: asset } = await supabase
          .from('assets')
          .upsert(
            { coingecko_id: _coingeckoId, symbol: _symbol, name: _name, category: 'spot' },
            { onConflict: 'coingecko_id' }
          )
          .select()
          .single()

        if (asset) {
          insertRows.push({ ...txData, portfolio_id: portfolioId, asset_id: asset.id })
        }
      }

      const { error } = await supabase.from('transactions').insert(insertRows)
      if (error) {
        setResult({ ok: false, message: error.message })
      } else {
        setResult({ ok: true, message: `Imported ${insertRows.length} transactions.` })
        setPreview(null)
        inputRef.current.value = ''
        onImported?.()
      }
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface-1 border border-border rounded-lg p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Import CoinGecko CSV</p>
        <p className="text-xs text-gray-500 mb-3">
          Export from CoinGecko → Portfolio → Export CSV. The importer maps Date, Coin, Symbol, Type, Quantity, Price (USD), Fee (USD), Notes columns.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="text-sm text-gray-400 file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:text-xs file:bg-surface-3 file:text-gray-200 hover:file:bg-accent cursor-pointer"
        />
      </div>

      {errors.length > 0 && (
        <div className="bg-loss/10 border border-loss/30 rounded-lg p-3 space-y-1">
          <p className="text-xs font-semibold text-loss">Parse warnings</p>
          {errors.map((e, i) => <p key={i} className="text-xs text-gray-400">{e}</p>)}
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="space-y-3">
          <div className="bg-surface-1 border border-border rounded-lg overflow-x-auto max-h-64">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Symbol</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.map((row, i) => (
                  <tr key={i} className="text-gray-300">
                    <td className="px-3 py-1.5">{new Date(row.date).toLocaleDateString()}</td>
                    <td className="px-3 py-1.5 font-semibold">{row._symbol}</td>
                    <td className="px-3 py-1.5 capitalize">{row.type.replace('_', ' ')}</td>
                    <td className="px-3 py-1.5 text-right num">{row.qty}</td>
                    <td className="px-3 py-1.5 text-right num">${row.price_usd.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-400">{preview.length} rows ready to import</p>
            <button
              onClick={handleImport}
              disabled={importing || !portfolioId}
              className="px-4 py-1.5 text-sm bg-accent hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-50"
            >
              {importing ? 'Importing…' : 'Import'}
            </button>
            <button onClick={() => { setPreview(null); inputRef.current.value = '' }} className="text-xs text-gray-500 hover:text-gray-200 transition-colors">
              Clear
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className={`text-sm ${result.ok ? 'text-profit' : 'text-loss'}`}>{result.message}</p>
      )}
    </div>
  )
}
