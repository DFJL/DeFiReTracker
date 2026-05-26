import { useState, useEffect, useRef } from 'react'
import { fetchPrices, resetPriceCache } from '../lib/priceService'

const REFRESH_INTERVAL = 60_000

export function usePrices(coingeckoIds) {
  const [prices, setPrices]         = useState({})
  const [changes, setChanges]       = useState({})
  const [marketData, setMarketData] = useState({})
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading]       = useState(false)
  const [stale, setStale]           = useState(false)
  const timerRef = useRef(null)

  async function refresh(force = false) {
    if (!coingeckoIds.length) return
    if (force) resetPriceCache()
    setLoading(true)
    try {
      const { prices: p, changes: c, marketData: md } = await fetchPrices(coingeckoIds)
      // Only update state if we got at least some prices back
      if (Object.keys(p).length > 0 || Object.keys(prices).length === 0) {
        setPrices(p)
        setChanges(c)
        setMarketData(md)
      }
      setLastUpdated(new Date())
      setStale(false)
    } catch {
      // fetchPrices now handles errors internally, but just in case: preserve existing state
      setStale(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh(true)
    timerRef.current = setInterval(() => refresh(), REFRESH_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [JSON.stringify(coingeckoIds.slice().sort())])

  return { prices, changes, marketData, lastUpdated, loading, stale, refresh: () => refresh(true) }
}
