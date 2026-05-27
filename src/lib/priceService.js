import { supabase } from './supabase'

const LLAMA_BASE = 'https://coins.llama.fi'
const CG_BASE    = 'https://api.coingecko.com/api/v3'
const CACHE_TTL_MS = 60_000

let lastFetchedAt    = null
let retryAfter       = 0
let inFlightPromise  = null
let cachedPrices     = {}
let cachedChanges    = {}
let cachedMarketData = {}

export async function fetchPrices(coingeckoIds) {
  if (!coingeckoIds.length) return { prices: {}, changes: {}, marketData: {} }

  const now = Date.now()

  if ((lastFetchedAt && now - lastFetchedAt < CACHE_TTL_MS) || now < retryAfter) {
    const missing = coingeckoIds.filter(id => !(id in cachedPrices))
    if (missing.length) {
      const db = await readFromDbCache(missing)
      cachedPrices = { ...cachedPrices, ...db }
    }
    return { prices: { ...cachedPrices }, changes: cachedChanges, marketData: cachedMarketData }
  }

  if (inFlightPromise) return inFlightPromise

  inFlightPromise = (async () => {
    try {
      const coinKeys = coingeckoIds.map(id => `coingecko:${id}`).join(',')
      const nowSec   = Math.floor(Date.now() / 1000)

      // All five fetches in parallel — no rate-limit concern with DeFiLlama
      const [curRes, h1hRes, h24hRes, h7dRes, h30dRes] = await Promise.all([
        fetch(`${LLAMA_BASE}/prices/current/${coinKeys}`),
        fetch(`${LLAMA_BASE}/prices/historical/${nowSec - 3_600}/${coinKeys}`),
        fetch(`${LLAMA_BASE}/prices/historical/${nowSec - 86_400}/${coinKeys}`),
        fetch(`${LLAMA_BASE}/prices/historical/${nowSec - 7 * 86_400}/${coinKeys}`),
        fetch(`${LLAMA_BASE}/prices/historical/${nowSec - 30 * 86_400}/${coinKeys}`),
      ])

      if (!curRes.ok) {
        retryAfter = Date.now() + 2 * 60_000
        throw new Error(`DeFiLlama ${curRes.status}`)
      }

      const [curData, h1h, h24h, h7d, h30d] = await Promise.all([
        curRes.json(),
        h1hRes.ok  ? h1hRes.json()  : null,
        h24hRes.ok ? h24hRes.json() : null,
        h7dRes.ok  ? h7dRes.json()  : null,
        h30dRes.ok ? h30dRes.json() : null,
      ])

      const prices     = {}
      const changes    = {}
      const marketData = {}
      const pct = (cur, old) => (cur != null && old != null && old > 0) ? ((cur - old) / old) * 100 : null

      for (const id of coingeckoIds) {
        const key     = `coingecko:${id}`
        const current = curData?.coins?.[key]
        if (!current) continue

        const cur  = current.price
        prices[id] = cur

        const c1h  = pct(cur, h1h?.coins?.[key]?.price)
        const c24h = pct(cur, h24h?.coins?.[key]?.price)
        const c7d  = pct(cur, h7d?.coins?.[key]?.price)
        const c30d = pct(cur, h30d?.coins?.[key]?.price)

        changes[id]    = c24h
        marketData[id] = {
          change1h:  c1h,
          change24h: c24h,
          change7d:  c7d,
          change30d: c30d,
          sparkline: [],
        }
      }

      // Persist to DB cache so warmFromDb works on next load
      const upserts = Object.entries(prices).map(([coingecko_id, price_usd]) => ({
        coingecko_id,
        symbol: coingecko_id,
        price_usd,
        updated_at: new Date().toISOString(),
      }))
      if (upserts.length) {
        supabase.from('price_cache').upsert(upserts, { onConflict: 'coingecko_id' })
      }

      // Fill any IDs DeFiLlama returned nothing for from DB
      const missingIds = coingeckoIds.filter(id => !(id in prices))
      if (missingIds.length) {
        const db = await readFromDbCache(missingIds)
        Object.assign(prices, db)
      }

      lastFetchedAt    = Date.now()
      cachedPrices     = { ...cachedPrices, ...prices }
      cachedChanges    = changes
      cachedMarketData = marketData
      return { prices: { ...cachedPrices }, changes, marketData }

    } catch (err) {
      lastFetchedAt = Date.now()
      const missing = coingeckoIds.filter(id => !(id in cachedPrices))
      if (missing.length) {
        const db = await readFromDbCache(missing)
        cachedPrices = { ...cachedPrices, ...db }
      }
      return { prices: { ...cachedPrices }, changes: cachedChanges, marketData: cachedMarketData }
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

export async function warmFromDb(coingeckoIds) {
  if (!coingeckoIds.length) return {}
  return readFromDbCache(coingeckoIds)
}

export function resetPriceCache() {
  lastFetchedAt = null
}

// CoinGecko still used for symbol→id lookup (DeFiLlama has no search endpoint)
export async function lookupCoinGeckoId(symbol) {
  try {
    const res = await fetch(`${CG_BASE}/search?query=${encodeURIComponent(symbol)}`)
    if (!res.ok) return null
    const { coins = [] } = await res.json()
    const match = coins.find(c => c.symbol.toUpperCase() === symbol.toUpperCase())
    return match ? { id: match.id, name: match.name } : null
  } catch {
    return null
  }
}
