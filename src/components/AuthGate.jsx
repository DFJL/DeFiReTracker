import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function AuthGate({ children }) {
  const [session, setSession] = useState(undefined)
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <span className="text-gray-500 text-sm">Loading…</span>
      </div>
    )
  }

  if (session) return children

  async function signIn(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="bg-surface-1 border border-border rounded-xl p-8 w-full max-w-sm">
        <h1 className="text-accent font-semibold text-lg mb-1">DeFiReTracker</h1>
        <p className="text-gray-500 text-xs mb-6">Private portfolio · authorized access only</p>
        <form onSubmit={signIn} className="space-y-3">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" required autoComplete="email"
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent"
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" required autoComplete="current-password"
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full bg-accent/90 hover:bg-accent text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
