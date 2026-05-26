import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function NLTransactionModal({ onParsed, onClose }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleParse() {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('ai-analyzer', {
        body: { mode: 'parse-transaction', text },
      })
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) throw new Error(data.error)

      let parsed
      try {
        const raw = data.result
        const jsonStr = raw.includes('```') ? raw.replace(/```json?\n?/g, '').replace(/```/g, '') : raw
        parsed = JSON.parse(jsonStr.trim())
      } catch {
        throw new Error('AI returned an unreadable format. Try rephrasing.')
      }

      onParsed(parsed)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const examples = [
    'Bought 0.5 ETH at $3,000 yesterday',
    'Sold 100 HYPE at $25.50 on May 20',
    'Earned 50 USDC staking rewards today',
    'Transferred in 1.2 BTC, no fee',
  ]

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Describe your transaction in plain language — in any language. AI will parse it into the transaction form.
      </p>

      <div className="space-y-2">
        <p className="text-xs text-gray-600 uppercase tracking-wider">Examples</p>
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
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && e.metaKey && handleParse()}
        placeholder="e.g. Bought 2 SOL at $180 on May 1st, paid $2 fee"
        rows={3}
        className="w-full bg-surface-2 border border-border text-gray-200 text-sm rounded px-3 py-2 focus:outline-none focus:border-accent placeholder-gray-600 resize-none"
        autoFocus
      />

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded p-3 text-sm text-red-400">
          {error}
          {error.includes('configured') && (
            <p className="text-xs mt-1 text-red-500">Set ANTHROPIC_API_KEY in your Supabase project secrets.</p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleParse}
          disabled={!text.trim() || loading}
          className="px-4 py-1.5 text-sm bg-accent hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading && (
            <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {loading ? 'Parsing…' : 'Parse with AI'}
        </button>
      </div>
    </div>
  )
}
