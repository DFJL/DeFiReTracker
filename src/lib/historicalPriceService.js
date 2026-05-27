const cache = {}

// Fetch all coins in one DeFiLlama batch request (no span → returns all data from start to today)
export async function fetchHistoricalPricesBatch(coingeckoIds, fromDate) {
  const uncached = coingeckoIds.filter(id => !cache[id])

  if (uncached.length) {
    const start = Math.floor(new Date(fromDate).getTime() / 1000)

    // Single DeFiLlama request for all uncached coins — no rate limit, no year cap
    let fetched = {}
    try {
      const coinKeys = uncached.map(id => `coingecko:${id}`).join(',')
      const res = await fetch(
        `https://coins.llama.fi/chart/${coinKeys}?start=${start}&period=1d`
      )
      if (res.ok) {
        const data = await res.json()
        for (const id of uncached) {
          const entry = data.coins?.[`coingecko:${id}`]
          if (entry?.prices?.length) {
            fetched[id] = entry.prices.map(({ timestamp, price }) => ({
              date: new Date(timestamp * 1000).toISOString().slice(0, 10),
              price,
            }))
          }
        }
      }
    } catch { /* fall through */ }

    // CoinGecko fallback (in parallel) for any coins DeFiLlama didn't return
    const stillMissing = uncached.filter(id => !fetched[id])
    if (stillMissing.length) {
      const daysSince = Math.ceil((Date.now() - new Date(fromDate).getTime()) / 86_400_000) + 2
      const days = Math.min(Math.max(daysSince, 30), 365)
      await Promise.all(stillMissing.map(async id => {
        try {
          const res = await fetch(
            `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`
          )
          if (!res.ok) return
          const data = await res.json()
          fetched[id] = (data.prices ?? []).map(([ts, price]) => ({
            date: new Date(ts).toISOString().slice(0, 10),
            price,
          }))
        } catch { /* skip */ }
      }))
    }

    for (const [id, prices] of Object.entries(fetched)) cache[id] = prices
  }

  const result = {}
  for (const id of coingeckoIds) result[id] = cache[id] ?? []
  return result
}

// Legacy single-coin fetch kept for other callers
export async function fetchHistoricalPrices(coingeckoId, fromDate) {
  if (cache[coingeckoId]) return cache[coingeckoId]
  const batch = await fetchHistoricalPricesBatch([coingeckoId], fromDate)
  return batch[coingeckoId] ?? []
}

export function clearHistoricalCache() {
  Object.keys(cache).forEach(k => delete cache[k])
}
