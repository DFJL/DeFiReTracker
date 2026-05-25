import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useAssets() {
  const [assets, setAssets] = useState([])

  useEffect(() => {
    supabase.from('assets').select('*').order('symbol').then(({ data }) => {
      setAssets(data ?? [])
    })
  }, [])

  async function ensureAsset({ coingecko_id, symbol, name, category }) {
    const existing = assets.find(a => a.coingecko_id === coingecko_id)
    if (existing) return existing

    const { data, error } = await supabase
      .from('assets')
      .upsert({ coingecko_id, symbol, name, category }, { onConflict: 'coingecko_id' })
      .select()
      .single()

    if (!error && data) {
      setAssets(prev => {
        const without = prev.filter(a => a.coingecko_id !== coingecko_id)
        return [...without, data]
      })
      return data
    }
    return null
  }

  return { assets, ensureAsset }
}
