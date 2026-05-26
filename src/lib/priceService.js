import { supabase } from './supabase'

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const CACHE_TTL_MS = 60_000

let lastFetchedAt = null
let inFlightPromise = null
let cachedChanges = {}
let cachedMarketData = {}

export async function fetchPrices(coingeckoIds) {
  if (!coingeckoIds.length) return { prices: {}, changes: {}, marketData: {} }

  const now = Date.now()
  if (lastFetchedAt && now - lastFetchedAt < CACHE_TTL_MS) {
    const prices = await readFromDbCache(coingeckoIds)
    return { prices, changes: cachedChanges, marketData: cachedMarketData }
  }

  if (inFlightPromise) return inFlightPromise

  inFlightPromise = (async () => {
    try {
      const ids = coingeckoIds.join(',')
      const res = await fetch(
        `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}` +
        `&sparkline=true&price_change_percentage=1h,7d,30d&per_page=250`
      )
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
      const data = await res.json()

      const upserts = data.map(coin => ({
        coingecko_id: coin.id,
        symbol: coin.id,
        price_usd: coin.current_price,
        updated_at: new Date().toISOString(),
      }))
      if (upserts.length) {
        await supabase.from('price_cache').upsert(upserts, { onConflict: 'coingecko_id' })
      }

      lastFetchedAt = Date.now()
      const prices = {}
      const changes = {}
      const marketData = {}

      for (const coin of data) {
        prices[coin.id] = coin.current_price
        changes[coin.id] = coin.price_change_percentage_24h ?? null
        marketData[coin.id] = {
          change1h:  coin.price_change_percentage_1h_in_currency ?? null,
          change24h: coin.price_change_percentage_24h ?? null,
          change7d:  coin.price_change_percentage_7d_in_currency ?? null,
          change30d: coin.price_change_percentage_30d_in_currency ?? null,
          sparkline: coin.sparkline_in_7d?.price ?? [],
        }
      }

      // Fallback for IDs CoinGecko doesn't know
      const missingIds = coingeckoIds.filter(id => !(id in prices))
      if (missingIds.length) {
        const cached = await readFromDbCache(missingIds)
        Object.assign(prices, cached)
      }

      cachedChanges = changes
      cachedMarketData = marketData
      return { prices, changes, marketData }
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

export async function lookupCoinGeckoId(symbol) {
  try {
    const res = await fetch(`${COINGECKO_BASE}/search?query=${encodeURIComponent(symbol)}`)
    if (!res.ok) return null
    const { coins = [] } = await res.json()
    const match = coins.find(c => c.symbol.toUpperCase() === symbol.toUpperCase())
    return match ? { id: match.id, name: match.name } : null
  } catch {
    return null
  }
}
