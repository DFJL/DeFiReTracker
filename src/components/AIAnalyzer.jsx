import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtUsd } from '../utils/format'

function MarkdownText({ text }) {
  // Render simple markdown: **bold**, bullet lists, line breaks
  const lines = text.split('\n')
  return (
    <div className="space-y-1.5 text-sm text-gray-300 leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />
        const isBullet = /^[-*•]\s/.test(line.trim())
        const isNumber = /^\d+\.\s/.test(line.trim())
        const isHeader = /^#{1,3}\s/.test(line.trim())
        const content = line
          .replace(/^#{1,3}\s/, '')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-surface-3 text-accent text-xs">$1</code>')
        if (isHeader) {
          return <p key={i} className="text-gray-100 font-semibold mt-2" dangerouslySetInnerHTML={{ __html: content }} />
        }
        if (isBullet || isNumber) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-accent mt-0.5 flex-shrink-0">{isBullet ? '›' : line.match(/^\d+/)[0] + '.'}</span>
              <span dangerouslySetInnerHTML={{ __html: content.replace(/^[-*•\d.]\s*/, '') }} />
            </div>
          )
        }
        return <p key={i} dangerouslySetInnerHTML={{ __html: content }} />
      })}
    </div>
  )
}

export function AIAnalyzer({ portfolioData }) {
  const [activeMode, setActiveMode] = useState('analyze')
  const [result, setResult] = useState({})
  const [loading, setLoading] = useState({})
  const [error, setError] = useState({})

  async function run(mode) {
    setLoading(l => ({ ...l, [mode]: true }))
    setError(e => ({ ...e, [mode]: null }))
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('ai-analyzer', {
        body: { mode, portfolio: portfolioData },
      })
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) throw new Error(data.error)
      setResult(r => ({ ...r, [mode]: data.result }))
    } catch (e) {
      setError(err => ({ ...err, [mode]: e.message }))
    } finally {
      setLoading(l => ({ ...l, [mode]: false }))
    }
  }

  const modes = [
    { key: 'analyze', label: 'Analysis', desc: 'Portfolio health & composition' },
    { key: 'recommend', label: 'Recommendations', desc: 'Suggested moves & rebalancing' },
    { key: 'predict', label: 'Outlook', desc: 'Risk & market context' },
  ]

  return (
    <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-accent uppercase tracking-wider">AI Portfolio Advisor</span>
          <span className="text-xs text-gray-600">powered by Claude</span>
        </div>
        <div className="flex gap-1">
          {modes.map(m => (
            <button
              key={m.key}
              onClick={() => setActiveMode(m.key)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                activeMode === m.key
                  ? 'bg-accent text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {modes.map(m => m.key === activeMode && (
          <div key={m.key}>
            {!result[m.key] && !loading[m.key] && (
              <div className="flex flex-col items-center py-6 gap-3">
                <p className="text-xs text-gray-500">{m.desc}</p>
                <button
                  onClick={() => run(m.key)}
                  disabled={!portfolioData?.totalValue}
                  className="px-4 py-2 text-sm bg-accent hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-40"
                >
                  Generate {m.label}
                </button>
                {!portfolioData?.totalValue && (
                  <p className="text-xs text-gray-600">Add transactions first to enable AI analysis</p>
                )}
              </div>
            )}

            {loading[m.key] && (
              <div className="flex items-center justify-center py-8 gap-2 text-sm text-gray-500">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing your portfolio…
              </div>
            )}

            {error[m.key] && (
              <div className="bg-red-900/20 border border-red-800 rounded p-3 text-sm text-red-400 flex items-start gap-2">
                <span>⚠</span>
                <div>
                  <p>{error[m.key]}</p>
                  {error[m.key].includes('configured') && (
                    <p className="text-xs mt-1 text-red-500">Set ANTHROPIC_API_KEY in your Supabase project secrets.</p>
                  )}
                </div>
              </div>
            )}

            {result[m.key] && (
              <div className="space-y-3">
                <MarkdownText text={result[m.key]} />
                <div className="flex justify-end pt-2 border-t border-border">
                  <button
                    onClick={() => run(m.key)}
                    disabled={loading[m.key]}
                    className="text-xs text-gray-500 hover:text-accent transition-colors"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
