import { useState } from 'react'

export function ShareModal({ portfolio, onShare, onClose }) {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await onShare(portfolio.id, email)
    if (error) {
      setError(typeof error === 'string' ? error : error.message)
    } else {
      setSuccess(true)
      setEmail('')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-surface-1 border border-border rounded-xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-100">Share "{portfolio.name}"</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 text-lg leading-none">×</button>
        </div>

        {success && (
          <p className="text-green-400 text-xs mb-3">Portfolio shared successfully!</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Collaborator's email"
            required
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <p className="text-gray-500 text-xs">
            The person must already have a DeFiReTracker account.
          </p>
          <button type="submit" disabled={loading}
            className="w-full bg-accent/90 hover:bg-accent text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {loading ? 'Sharing…' : 'Share'}
          </button>
        </form>
      </div>
    </div>
  )
}
