const cache = {}

// Fetch historical prices for all coins — individual DeFiLlama calls in parallel
// (batching many coins into one URL is unreliable; parallel individual calls are fine
//  since DeFiLlama has no meaningful rate limit)
export async function fetchHistoricalPricesBatch(coingeckoIds, fromDate) {
  const uncached = coingeckoIds.filter(id => !cache[id])

  if (uncached.length) {
    const start = Math.floor(new Date(fromDate).getTime() / 1000)
    const daysSince = Math.ceil((Date.now() - new Date(fromDate).getTime()) / 86_400_000) + 2

    await Promise.all(uncached.map(async id => {
      // DeFiLlama first — no rate limit, no year cap, no span = all data from start to today
      try {
        const res = await fetch(
          `https://coins.llama.fi/chart/coingecko:${id}?start=${start}&period=1d`
        )
        if (res.ok) {
          const data = await res.json()
          const entry = data.coins?.[`coingecko:${id}`]
          if (entry?.prices?.length) {
            cache[id] = entry.prices.map(({ timestamp, price }) => ({
              date: new Date(timestamp * 1000).toISOString().slice(0, 10),
              price,
            }))
            return
          }
        }
      } catch { /* fall through */ }

      // CoinGecko fallback (365-day cap, but covers tokens DeFiLlama doesn't have)
      try {
        const days = Math.min(Math.max(daysSince, 30), 365)
        const res = await fetch(
          `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`
        )
        if (!res.ok) return
        const data = await res.json()
        cache[id] = (data.prices ?? []).map(([ts, price]) => ({
          date: new Date(ts).toISOString().slice(0, 10),
          price,
        }))
      } catch { /* skip */ }
    }))
  }

  const result = {}
  for (const id of coingeckoIds) result[id] = cache[id] ?? []
  return result
}

export async function fetchHistoricalPrices(coingeckoId, fromDate) {
  if (cache[coingeckoId]) return cache[coingeckoId]
  const batch = await fetchHistoricalPricesBatch([coingeckoId], fromDate)
  return batch[coingeckoId] ?? []
}

export function clearHistoricalCache() {
  Object.keys(cache).forEach(k => delete cache[k])
}
