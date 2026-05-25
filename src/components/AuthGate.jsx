import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function AuthGate({ children }) {
  const [session, setSession] = useState(undefined)
  const [mode, setMode]       = useState('signin') // 'signin' | 'signup'
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

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

  function switchMode(m) { setMode(m); setError(null); setConfirming(false) }

  async function handleSignIn(e) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
    } else if (!data.session) {
      setConfirming(true) // email confirmation required
    }
    setLoading(false)
  }

  if (confirming) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="bg-surface-1 border border-border rounded-xl p-8 w-full max-w-sm text-center">
          <h1 className="text-accent font-semibold text-lg mb-1">DeFiReTracker</h1>
          <p className="text-gray-300 text-sm mt-4 mb-2">Check your email</p>
          <p className="text-gray-500 text-xs">We sent a confirmation link to <span className="text-gray-300">{email}</span>. Click it to activate your account.</p>
          <button onClick={() => switchMode('signin')} className="mt-6 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            ← Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="bg-surface-1 border border-border rounded-xl p-8 w-full max-w-sm">
        <h1 className="text-accent font-semibold text-lg mb-1">DeFiReTracker</h1>
        <p className="text-gray-500 text-xs mb-6">Track your DeFi portfolio</p>

        {/* Mode toggle */}
        <div className="flex rounded-lg bg-surface border border-border p-0.5 mb-5">
          {['signin', 'signup'].map(m => (
            <button key={m} onClick={() => switchMode(m)}
              className={`flex-1 py-1.5 text-xs rounded-md transition-colors font-medium ${
                mode === m ? 'bg-surface-2 text-gray-100' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} className="space-y-3">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" required autoComplete="email"
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent"
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-accent/90 hover:bg-accent text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {loading ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
