import { useState, useEffect, useMemo } from 'react'
import { fetchHistoricalPrices } from '../lib/historicalPriceService'

export function usePortfolioHistory(transactions, assets) {
  const [historicalPrices, setHistoricalPrices] = useState({})
  const [loading, setLoading] = useState(false)

  const fromDate = useMemo(() => {
    const assetTxs = transactions.filter(t => t.asset_id != null)
    if (!assetTxs.length) return new Date().toISOString().slice(0, 10)
    const earliest = Math.min(...assetTxs.map(t => new Date(t.date).getTime()))
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

    const computed = dates.map(date => {
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

    // Strip the leading section where the portfolio had negligible value (<$100).
    // Early positions (LUNA airdrop, tiny FTM) are real but invisible on a chart
    // scaled to the portfolio's eventual size, causing a misleading long flat line.
    const firstMeaningful = computed.findIndex(p => p.value >= 100)
    return firstMeaningful > 0 ? computed.slice(firstMeaningful) : computed
  }, [historicalPrices, transactions, assets, fromDate])

  const assetChanges = useMemo(() => {
    const d7  = new Date(Date.now() - 7  * 86_400_000).toISOString().slice(0, 10)
    const d30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    const result = {}
    for (const asset of assets) {
      const prices = historicalPrices[asset.id] ?? []
      if (!prices.length) continue
      const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))
      const latest = sorted[sorted.length - 1]
      const at7d  = [...sorted].reverse().find(p => p.date <= d7)
      const at30d = [...sorted].reverse().find(p => p.date <= d30)
      result[asset.coingecko_id] = {
        change7d:  at7d  && at7d.price  > 0 ? ((latest.price - at7d.price)  / at7d.price)  * 100 : null,
        change30d: at30d && at30d.price > 0 ? ((latest.price - at30d.price) / at30d.price) * 100 : null,
      }
    }
    return result
  }, [historicalPrices, assets])

  return { timeline, loading, assetChanges }
}
