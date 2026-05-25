import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function usePortfolios() {
  const [portfolios, setPortfolios] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('portfolios')
      .select('*')
      .order('created_at', { ascending: true })
    setPortfolios(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function createPortfolio(name) {
    const { data, error } = await supabase
      .from('portfolios')
      .insert({ name })
      .select()
      .single()
    if (!error) setPortfolios(p => [...p, data])
    return { data, error }
  }

  async function deletePortfolio(id) {
    const { error } = await supabase.from('portfolios').delete().eq('id', id)
    if (!error) setPortfolios(p => p.filter(x => x.id !== id))
    return { error }
  }

  return { portfolios, loading, createPortfolio, deletePortfolio, reload: load }
}
