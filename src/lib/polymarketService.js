import { supabase } from './supabase'

export async function fetchPolymarketPositions(address) {
  const { data, error } = await supabase.functions.invoke('polymarket-positions', {
    body: { address: address.trim() },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return Array.isArray(data) ? data : []
}
