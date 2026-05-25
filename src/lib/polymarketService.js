const GAMMA_BASE = 'https://gamma-api.polymarket.com'

export async function fetchPolymarketPositions(address) {
  const res = await fetch(
    `${GAMMA_BASE}/positions?user_address=${address}&sizeThreshold=0.01`
  )
  if (!res.ok) throw new Error(`Polymarket API error ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : (data.positions ?? [])
}
