import { supabase } from './supabase'

export async function fetchPolymarketPositions(address) {
  const { data, error } = await supabase.functions.invoke('polymarket-positions', {
    body: { address: address.trim() },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  const positions    = Array.isArray(data) ? data : (data?.positions ?? [])
  const cashBalance  = data?.cashBalance ?? 0
  const proxyWallet  = data?.proxyWallet ?? null
  const netDeposited = data?.netDeposited ?? 0
  const _debug       = data?._debug ?? []
  return { positions, cashBalance, proxyWallet, netDeposited, _debug }
}
