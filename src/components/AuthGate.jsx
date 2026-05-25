import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function AuthGate({ children }) {
  const [session, setSession] = useState(undefined)
  const [email, setEmail]     = useState('')
  const [code, setCode]       = useState('')
  const [step, setStep]       = useState('email') // 'email' | 'code'
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

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

  async function sendCode(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })
    if (error) {
      setError(error.message)
    } else {
      setStep('code')
    }
    setLoading(false)
  }

  async function verifyCode(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="bg-surface-1 border border-border rounded-xl p-8 w-full max-w-sm">
        <h1 className="text-accent font-semibold text-lg mb-1">DeFiReTracker</h1>
        <p className="text-gray-500 text-xs mb-6">Private portfolio · authorized access only</p>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="space-y-3">
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Your email" required autoComplete="email"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-accent/90 hover:bg-accent text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50">
              {loading ? 'Sending…' : 'Send code →'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-3">
            <p className="text-gray-400 text-xs text-center">
              Code sent to <span className="text-gray-200">{email}</span>
            </p>
            <input
              type="text" value={code} onChange={e => setCode(e.target.value)}
              placeholder="123456" required maxLength={6} autoComplete="one-time-code"
              inputMode="numeric"
              className="w-full bg-surface border border-border rounded-lg px-3 py-3 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent tracking-[0.4em] text-center text-2xl font-mono"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading || code.trim().length < 6}
              className="w-full bg-accent/90 hover:bg-accent text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50">
              {loading ? 'Verifying…' : 'Verify'}
            </button>
            <button type="button" onClick={() => { setStep('email'); setError(null); setCode('') }}
              className="w-full text-gray-500 text-xs hover:text-gray-300 transition-colors py-1">
              ← Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
