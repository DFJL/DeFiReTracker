const cache = {}

export async function fetchHistoricalPrices(coingeckoId, fromDate) {
  if (cache[coingeckoId]) return cache[coingeckoId]

  const daysSince = Math.ceil((Date.now() - new Date(fromDate).getTime()) / 86_400_000) + 2
  // CoinGecko free tier reliably returns daily data up to ~365 days;
  // beyond that responses become sparse or empty.
  const days = Math.min(Math.max(daysSince, 30), 365)

  try {
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
