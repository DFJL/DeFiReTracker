import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function usePortfolios() {
  const [portfolios, setPortfolios] = useState([])
  const [userId, setUserId]         = useState(null)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) =>
      setUserId(s?.user?.id ?? null)
    )
    return () => subscription.unsubscribe()
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('portfolios')
      .select('*')
      .order('created_at', { ascending: true })
    setPortfolios(data ?? [])
    setLoading(false)
  }

  useEffect(() => { if (userId !== null) load() }, [userId])

  async function createPortfolio(name) {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('portfolios')
      .insert({ name, user_id: user.id })
      .select()
      .single()
    if (!error) setPortfolios(p => [...p, data])
    return { data, error }
  }

  async function claimPortfolio(id) {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('portfolios')
      .update({ user_id: user.id })
      .eq('id', id)
      .is('user_id', null)
    if (!error) await load()
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
    if (!error) setPortfolios(p => p.filter(x => x.id !== id))
    return { error }
  }

  return { portfolios, userId, loading, createPortfolio, claimPortfolio, sharePortfolio, deletePortfolio, reload: load }
}
