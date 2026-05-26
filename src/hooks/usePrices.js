import { useState, useEffect, useRef } from 'react'
import { fetchPrices, resetPriceCache, warmFromDb } from '../lib/priceService'

const REFRESH_INTERVAL = 60_000

export function usePrices(coingeckoIds) {
  const [prices, setPrices]           = useState({})
  const [changes, setChanges]         = useState({})
  const [marketData, setMarketData]   = useState({})
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading]         = useState(false)
  const [stale, setStale]             = useState(false)
  const timerRef   = useRef(null)
  const hasDataRef = useRef(false) // tracks whether we've ever shown real prices
  const idsKey     = JSON.stringify([...coingeckoIds].sort())

  async function refresh(force = false) {
    if (!coingeckoIds.length) return
    if (force) resetPriceCache()
    setLoading(true)
    try {
      const { prices: p, changes: c, marketData: md } = await fetchPrices(coingeckoIds)
      if (Object.keys(p).length > 0) {
        setPrices(p)
        setChanges(c)
        setMarketData(md)
        setLastUpdated(new Date())
        setStale(false)
        hasDataRef.current = true
      } else if (hasDataRef.current) {
        // Had prices before but got nothing back → stale
        setStale(true)
      }
      // If never had data and got nothing back, stay in loading-looking state
    } catch {
      if (hasDataRef.current) setStale(true)
    } finally {
      setLoading(false)
    }
  }

  // Pre-populate from DB cache before the API fetch resolves — prevents $0 flash
  useEffect(() => {
    if (!coingeckoIds.length) return
    warmFromDb(coingeckoIds).then(dbPrices => {
      if (Object.keys(dbPrices).length > 0 && !hasDataRef.current) {
        setPrices(prev => ({ ...dbPrices, ...prev }))
        hasDataRef.current = true
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  useEffect(() => {
    refresh(true)
    timerRef.current = setInterval(() => refresh(), REFRESH_INTERVAL)

    // Refresh when the user switches back to this tab
    function onFocus() { refresh() }
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(timerRef.current)
      window.removeEventListener('focus', onFocus)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  return { prices, changes, marketData, lastUpdated, loading, stale, refresh: () => refresh(true) }
}
