import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useTransactions(portfolioId) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!portfolioId) { setTransactions([]); return }
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('*, asset:assets(*)')
      .eq('portfolio_id', portfolioId)
      .order('date', { ascending: false })
      .limit(10000)
    setTransactions(data ?? [])
    setLoading(false)
  }, [portfolioId])

  useEffect(() => { load() }, [load])

  async function upsertTransaction(tx) {
    const { asset, ...rest } = tx
    const method = rest.id ? 'update' : 'insert'
    let query = supabase.from('transactions')[method](rest)
    if (rest.id) query = query.eq('id', rest.id)
    const { error } = await query
    if (!error) load()
    return { error }
  }

  async function deleteTransaction(id) {
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (!error) setTransactions(t => t.filter(x => x.id !== id))
    return { error }
  }

  async function batchDelete(ids) {
    const { error } = await supabase.from('transactions').delete().in('id', ids)
    if (!error) setTransactions(t => t.filter(x => !ids.includes(x.id)))
    return { error }
  }

  async function bulkInsert(rows) {
    const { error } = await supabase.from('transactions').insert(rows)
    if (!error) load()
    return { error }
  }

  return { transactions, loading, upsertTransaction, deleteTransaction, batchDelete, bulkInsert, reload: load }
}
