import { useState, useEffect, useMemo } from 'react'
import { fetchHistoricalPrices } from '../lib/historicalPriceService'

export function usePortfolioHistory(transactions, assets) {
  const [historicalPrices, setHistoricalPrices] = useState({})
  const [loading, setLoading] = useState(false)

  const fromDate = useMemo(() => {
    if (!transactions.length) return new Date().toISOString().slice(0, 10)
    const earliest = Math.min(...transactions.map(t => new Date(t.date).getTime()))
    return new Date(earliest).toISOString().slice(0, 10)
  }, [transactions])

  const assetKey = assets.map(a => a.id).sort().join(',')

  useEffect(() => {
    if (!assets.length || !transactions.length) return
    setLoading(true)

    Promise.all(
      assets.map((asset, i) =>
        new Promise(resolve => setTimeout(resolve, i * 300)).then(() =>
          fetchHistoricalPrices(asset.coingecko_id, fromDate).then(prices => [asset.id, prices])
        )
      )
    )
      .then(results => {
        const map = {}
        for (const [id, prices] of results) map[id] = prices
        setHistoricalPrices(map)
      })
      .finally(() => setLoading(false))
  }, [assetKey, fromDate])

  const timeline = useMemo(() => {
    if (!Object.keys(historicalPrices).length || !transactions.length || !assets.length) return []

    const start = new Date(fromDate)
    const end = new Date()
    const dates = []
    const cursor = new Date(start)
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10))
      cursor.setDate(cursor.getDate() + 1)
    }

    const sortedTxs = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date))

    return dates.map(date => {
      let totalValue = 0
      let totalCost = 0

      for (const asset of assets) {
        const assetTxs = sortedTxs.filter(
          t => t.asset_id === asset.id && t.date.slice(0, 10) <= date
        )

        // Weighted avg cost basis replay
        let runningQty = 0
        let runningCost = 0
        for (const tx of assetTxs) {
          const qty = Number(tx.qty)
          const price = Number(tx.price_usd)
          const fee = Number(tx.fee_usd ?? 0)
          if (['buy', 'transfer_in', 'earn'].includes(tx.type)) {
            runningCost += qty * price + fee
            runningQty += qty
          } else {
            const avg = runningQty > 0 ? runningCost / runningQty : 0
            runningCost -= avg * qty
            runningQty -= qty
          }
        }

        runningQty = Math.max(0, runningQty)
        runningCost = Math.max(0, runningCost)
        totalCost += runningCost

        if (runningQty === 0) continue
        const prices = historicalPrices[asset.id] ?? []
        const entry = [...prices].reverse().find(p => p.date <= date)
        totalValue += runningQty * (entry?.price ?? 0)
      }

      return {
        date,
        value: Math.round(totalValue * 100) / 100,
        cost: Math.round(totalCost * 100) / 100,
      }
    })
  }, [historicalPrices, transactions, assets, fromDate])

  return { timeline, loading }
}
