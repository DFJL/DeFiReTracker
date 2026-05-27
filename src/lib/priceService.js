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
      const s = Math.floor(Date.now() / 1000)

      // 10 parallel fetches: current price + % changes + 6 daily snapshots for sparklines
      const [curRes, h1hRes, h1dRes, h2dRes, h3dRes, h4dRes, h5dRes, h6dRes, h7dRes, h30dRes] = await Promise.all([
        fetch(`${LLAMA_BASE}/prices/current/${coinKeys}`),
        fetch(`${LLAMA_BASE}/prices/historical/${s - 3_600}/${coinKeys}`),
        fetch(`${LLAMA_BASE}/prices/historical/${s - 1 * 86_400}/${coinKeys}`),
        fetch(`${LLAMA_BASE}/prices/historical/${s - 2 * 86_400}/${coinKeys}`),
        fetch(`${LLAMA_BASE}/prices/historical/${s - 3 * 86_400}/${coinKeys}`),
        fetch(`${LLAMA_BASE}/prices/historical/${s - 4 * 86_400}/${coinKeys}`),
        fetch(`${LLAMA_BASE}/prices/historical/${s - 5 * 86_400}/${coinKeys}`),
        fetch(`${LLAMA_BASE}/prices/historical/${s - 6 * 86_400}/${coinKeys}`),
        fetch(`${LLAMA_BASE}/prices/historical/${s - 7 * 86_400}/${coinKeys}`),
        fetch(`${LLAMA_BASE}/prices/historical/${s - 30 * 86_400}/${coinKeys}`),
      ])

      if (!curRes.ok) {
        retryAfter = Date.now() + 2 * 60_000
        throw new Error(`DeFiLlama ${curRes.status}`)
      }

      const [curData, h1h, h1d, h2d, h3d, h4d, h5d, h6d, h7d, h30d] = await Promise.all([
        curRes.json(),
        h1hRes.ok  ? h1hRes.json()  : null,
        h1dRes.ok  ? h1dRes.json()  : null,
        h2dRes.ok  ? h2dRes.json()  : null,
        h3dRes.ok  ? h3dRes.json()  : null,
        h4dRes.ok  ? h4dRes.json()  : null,
        h5dRes.ok  ? h5dRes.json()  : null,
        h6dRes.ok  ? h6dRes.json()  : null,
        h7dRes.ok  ? h7dRes.json()  : null,
        h30dRes.ok ? h30dRes.json() : null,
      ])

      const prices     = {}
      const changes    = {}
      const marketData = {}
      const pct = (cur, old) => (cur != null && old != null && old > 0) ? ((cur - old) / old) * 100 : null
      const get = (snap, key) => snap?.coins?.[key]?.price ?? null

      for (const id of coingeckoIds) {
        const key = `coingecko:${id}`
        const cur = curData?.coins?.[key]?.price
        if (cur == null) continue

        prices[id] = cur

        const p1h  = get(h1h,  key)
        const p1d  = get(h1d,  key)
        const p7d  = get(h7d,  key)
        const p30d = get(h30d, key)

        changes[id] = pct(cur, p1d)

        // 7-point daily sparkline: 6d ago → today
        const sparkline = [
          get(h6d, key), get(h5d, key), get(h4d, key),
          get(h3d, key), get(h2d, key), p1d, cur,
        ].filter(v => v != null)

        marketData[id] = {
          change1h:  pct(cur, p1h),
          change24h: pct(cur, p1d),
          change7d:  pct(cur, p7d),
          change30d: pct(cur, p30d),
          sparkline,
        }
      }

      // Persist to DB cache
      const upserts = Object.entries(prices).map(([coingecko_id, price_usd]) => ({
        coingecko_id, symbol: coingecko_id, price_usd,
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
