const cache = {}

export async function fetchHistoricalPrices(coingeckoId, fromDate) {
  if (cache[coingeckoId]) return cache[coingeckoId]

  const start = Math.floor(new Date(fromDate).getTime() / 1000)
  const daysSince = Math.ceil((Date.now() - new Date(fromDate).getTime()) / 86_400_000) + 2
  const span = Math.max(daysSince, 30)

  // DeFiLlama: no rate limits, no year cap
  try {
    const res = await fetch(
      `https://coins.llama.fi/chart/coingecko:${coingeckoId}?start=${start}&span=${span}&period=1d`
    )
    if (res.ok) {
      const data = await res.json()
      const entry = data.coins?.[`coingecko:${coingeckoId}`]
      if (entry?.prices?.length) {
        const prices = entry.prices.map(({ timestamp, price }) => ({
          date: new Date(timestamp * 1000).toISOString().slice(0, 10),
          price,
        }))
        cache[coingeckoId] = prices
        return prices
      }
    }
  } catch { /* fall through to CoinGecko */ }

  // CoinGecko fallback (caps at 365 days but covers edge cases DeFiLlama misses)
  try {
    const days = Math.min(span, 365)
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}&interval=daily`
    )
    if (!res.ok) return []
    const data = await res.json()
    const prices = (data.prices ?? []).map(([ts, price]) => ({
      date: new Date(ts).toISOString().slice(0, 10),
      price,
    }))
    cache[coingeckoId] = prices
    return prices
  } catch {
    return []
  }
}

export function clearHistoricalCache() {
  Object.keys(cache).forEach(k => delete cache[k])
}
