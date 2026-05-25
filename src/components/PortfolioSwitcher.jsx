import { useState } from 'react'

export function PortfolioSwitcher({ portfolios, selected, onSelect, onCreate, onDelete }) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    await onCreate(name.trim())
    setName('')
    setCreating(false)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500 uppercase tracking-wider">Portfolio</span>

      <select
        value={selected ?? ''}
        onChange={e => onSelect(e.target.value)}
        className="bg-surface-2 border border-border text-gray-200 text-sm rounded px-3 py-1.5 focus:outline-none focus:border-accent"
      >
        <option value="" disabled>Select…</option>
        {portfolios.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      {selected && (
        <button
          onClick={() => {
            if (confirm('Delete this portfolio and all its transactions?')) onDelete(selected)
          }}
          className="text-xs text-gray-500 hover:text-loss transition-colors"
        >
          Delete
        </button>
      )}

      {creating ? (
        <form onSubmit={handleCreate} className="flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Name…"
            className="bg-surface-2 border border-border text-gray-200 text-sm rounded px-2 py-1 w-32 focus:outline-none focus:border-accent"
          />
          <button type="submit" className="text-xs text-accent hover:text-white transition-colors">Add</button>
          <button type="button" onClick={() => setCreating(false)} className="text-xs text-gray-500 hover:text-gray-200 transition-colors">Cancel</button>
        </form>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="text-xs text-gray-500 hover:text-accent transition-colors"
        >
          + New
        </button>
      )}
    </div>
  )
}
