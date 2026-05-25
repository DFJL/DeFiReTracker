import { supabase } from './supabase'

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const CACHE_TTL_MS = 60_000

let lastFetchedAt = null
let inFlightPromise = null
let cachedChanges = {}

export async function fetchPrices(coingeckoIds) {
  if (!coingeckoIds.length) return { prices: {}, changes: {} }

  const now = Date.now()
  if (lastFetchedAt && now - lastFetchedAt < CACHE_TTL_MS) {
    const prices = await readFromDbCache(coingeckoIds)
    return { prices, changes: cachedChanges }
  }

  if (inFlightPromise) return inFlightPromise

  inFlightPromise = (async () => {
    try {
      const ids = coingeckoIds.join(',')
      const res = await fetch(
        `${COINGECKO_BASE}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
      )
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
      const data = await res.json()

      const upserts = Object.entries(data).map(([cgId, v]) => ({
        coingecko_id: cgId,
        symbol: cgId,
        price_usd: v.usd,
        updated_at: new Date().toISOString(),
      }))
      if (upserts.length) {
        await supabase.from('price_cache').upsert(upserts, { onConflict: 'coingecko_id' })
      }

      lastFetchedAt = Date.now()
      const prices = {}
      const changes = {}
      for (const [cgId, v] of Object.entries(data)) {
        prices[cgId] = v.usd
        changes[cgId] = v.usd_24h_change ?? null
      }
      cachedChanges = changes
      return { prices, changes }
    } finally {
      inFlightPromise = null
    }
  })()

  return inFlightPromise
}

async function readFromDbCache(coingeckoIds) {
  const { data } = await supabase
    .from('price_cache')
    .select('coingecko_id, price_usd')
    .in('coingecko_id', coingeckoIds)
  const map = {}
  for (const row of data ?? []) map[row.coingecko_id] = row.price_usd
  return map
}

export function resetPriceCache() {
  lastFetchedAt = null
}
