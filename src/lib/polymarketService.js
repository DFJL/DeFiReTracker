// Try Gamma API first (user param), then CLOB API (user_address param)
const ATTEMPTS = [
  addr => `https://gamma-api.polymarket.com/positions?user=${addr}&sizeThreshold=0.01`,
  addr => `https://gamma-api.polymarket.com/positions?user_address=${addr}&sizeThreshold=0.01`,
  addr => `https://data-api.polymarket.com/positions?user=${addr}&sizeThreshold=0.01`,
]

export async function fetchPolymarketPositions(address) {
  const addr = address.trim()
  let lastErr = null

  for (const makeUrl of ATTEMPTS) {
    try {
      const res = await fetch(makeUrl(addr), {
        headers: { Accept: 'application/json' },
      })
      if (res.status === 403) { lastErr = new Error('Access denied (403) — Polymarket may be blocking this request. Try your checksummed wallet address.'); continue }
      if (!res.ok) { lastErr = new Error(`Polymarket API error ${res.status}`); continue }
      const data = await res.json()
      return Array.isArray(data) ? data : (data.positions ?? data.data ?? [])
    } catch (e) {
      lastErr = e
    }
  }

  throw lastErr ?? new Error('Could not reach Polymarket API')
}
