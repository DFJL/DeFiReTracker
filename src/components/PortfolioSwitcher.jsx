import { useState } from 'react'
import { ShareModal } from './ShareModal'

export function PortfolioSwitcher({ portfolios, userId, selected, onSelect, onCreate, onDelete, onClaim, onShare }) {
  const [creating, setCreating]     = useState(false)
  const [name, setName]             = useState('')
  const [sharingPortfolio, setSharingPortfolio] = useState(null)

  const selectedPortfolio = portfolios.find(p => p.id === selected)
  const isOwned   = selectedPortfolio?.user_id === userId
  const isUnowned = selectedPortfolio && !selectedPortfolio.user_id
  const isShared  = selectedPortfolio && selectedPortfolio.user_id && selectedPortfolio.user_id !== userId

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    await onCreate(name.trim())
    setName('')
    setCreating(false)
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 uppercase tracking-wider hidden sm:inline">Portfolio</span>

        <select
          value={selected ?? ''}
          onChange={e => onSelect(e.target.value)}
          className="bg-surface-2 border border-border text-gray-200 text-sm rounded px-3 py-1.5 focus:outline-none focus:border-accent"
        >
          <option value="" disabled>Select…</option>
          {portfolios.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}{p.user_id !== userId && p.user_id ? ' (shared)' : ''}
            </option>
          ))}
        </select>

        {/* Per-portfolio actions */}
        {isOwned && (
          <>
            <button
              onClick={() => setSharingPortfolio(selectedPortfolio)}
              className="text-xs text-gray-500 hover:text-accent transition-colors"
              title="Share portfolio"
            >
              Share
            </button>
            <button
              onClick={() => { if (confirm('Delete this portfolio and all its transactions?')) onDelete(selected) }}
              className="text-xs text-gray-500 hover:text-loss transition-colors"
            >
              Delete
            </button>
          </>
        )}

        {isUnowned && (
          <button
            onClick={() => onClaim(selected)}
            className="text-xs text-accent hover:text-white transition-colors"
            title="Claim ownership of this portfolio"
          >
            Claim
          </button>
        )}

        {isShared && (
          <span className="text-xs text-gray-600 italic">shared</span>
        )}

        {/* New portfolio */}
        {creating ? (
          <form onSubmit={handleCreate} className="flex items-center gap-1">
            <input
              autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="Name…"
              className="bg-surface-2 border border-border text-gray-200 text-sm rounded px-2 py-1 w-28 focus:outline-none focus:border-accent"
            />
            <button type="submit" className="text-xs text-accent hover:text-white transition-colors">Add</button>
            <button type="button" onClick={() => setCreating(false)} className="text-xs text-gray-500 hover:text-gray-200 transition-colors">✕</button>
          </form>
        ) : (
          <button onClick={() => setCreating(true)} className="text-xs text-gray-500 hover:text-accent transition-colors">
            + New
          </button>
        )}
      </div>

      {sharingPortfolio && (
        <ShareModal
          portfolio={sharingPortfolio}
          onShare={onShare}
          onClose={() => setSharingPortfolio(null)}
        />
      )}
    </>
  )
}
