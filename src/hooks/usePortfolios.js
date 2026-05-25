import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function usePortfolios() {
  const [portfolios, setPortfolios] = useState([])
  const [userId, setUserId]         = useState(null)
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(null)

  // Track current user for ownership UI (separate from query auth, which is
  // handled automatically by the Supabase client's JWT)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) =>
      setUserId(s?.user?.id ?? null)
    )
    return () => subscription.unsubscribe()
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) {
      console.error('usePortfolios load:', error)
      setLoadError(error.message)
    }
    setPortfolios(data ?? [])
    setLoading(false)
  }, [])

  // Load immediately on mount — the Supabase client sends the JWT automatically,
  // no need to wait for our own userId state
  useEffect(() => {
    load()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') load()
    })
    return () => subscription.unsubscribe()
  }, [load])

  async function createPortfolio(name) {
    const { data: authData } = await supabase.auth.getUser()
    const uid = authData.user?.id ?? null
    const { data, error } = await supabase
      .from('portfolios')
      .insert({ name, user_id: uid })
      .select()
      .single()
    if (error) console.error('createPortfolio:', error)
    if (!error) {
      setPortfolios(p => [...p, data])
    }
    return { data, error }
  }

  async function claimPortfolio(id) {
    const { data: authData } = await supabase.auth.getUser()
    const uid = authData.user?.id
    const { error } = await supabase
      .from('portfolios')
      .update({ user_id: uid })
      .eq('id', id)
      .is('user_id', null)
    if (error) console.error('claimPortfolio:', error)
    else await load()
    return { error }
  }

  async function sharePortfolio(portfolioId, email) {
    const { data: profile, error: lookupErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single()
    if (lookupErr || !profile) return { error: 'No account found for that email.' }
    const { error } = await supabase
      .from('portfolio_shares')
      .insert({ portfolio_id: portfolioId, user_id: profile.id })
    return { error: error ? (error.code === '23505' ? 'Already shared with that user.' : error.message) : null }
  }

  async function deletePortfolio(id) {
    const { error } = await supabase.from('portfolios').delete().eq('id', id)
    if (error) console.error('deletePortfolio:', error)
    else setPortfolios(p => p.filter(x => x.id !== id))
    return { error }
  }

  return { portfolios, userId, loading, loadError, createPortfolio, claimPortfolio, sharePortfolio, deletePortfolio, reload: load }
}
