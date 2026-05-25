import { useState, useEffect, useRef } from 'react'
import { fetchPrices, resetPriceCache } from '../lib/priceService'

const REFRESH_INTERVAL = 60_000

export function usePrices(coingeckoIds) {
  const [prices, setPrices] = useState({})
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)

  async function refresh(force = false) {
    if (!coingeckoIds.length) return
    if (force) resetPriceCache()
    setLoading(true)
    try {
      const map = await fetchPrices(coingeckoIds)
      setPrices(map)
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    timerRef.current = setInterval(() => refresh(), REFRESH_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [JSON.stringify(coingeckoIds.slice().sort())])

  return { prices, lastUpdated, loading, refresh: () => refresh(true) }
}
