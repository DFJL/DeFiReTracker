import { useState, useEffect, useMemo } from 'react'
import { fetchHistoricalPrices } from '../lib/historicalPriceService'

export function usePortfolioHistory(transactions, assets) {
  const [historicalPrices, setHistoricalPrices] = useState({})
  const [loading, setLoading] = useState(false)

  const fromDate = useMemo(() => {
    // Start from the earliest of any transaction (deposits included — they anchor the chart)
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

    // Pre-compute cumulative net deposits per date for O(n) instead of O(n²)
    const cashTxs = sortedTxs.filter(t => t.asset_id == null)
    let cumDeposited = 0
    let cumWithdrawn = 0
    let cashIdx = 0
    const netDepositByDate = {}

    for (const date of dates) {
      while (cashIdx < cashTxs.length && cashTxs[cashIdx].date.slice(0, 10) <= date) {
        const tx = cashTxs[cashIdx]
        if (tx.type === 'deposit')    cumDeposited += Number(tx.qty)
        if (tx.type === 'withdrawal') cumWithdrawn += Number(tx.qty)
        cashIdx++
      }
      netDepositByDate[date] = cumDeposited - cumWithdrawn
    }

    const computed = dates.map(date => {
      let totalValue = 0

      for (const asset of assets) {
        const assetTxs = sortedTxs.filter(
          t => t.asset_id === asset.id && t.date.slice(0, 10) <= date
        )

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
        if (runningQty === 0) continue
        const prices = historicalPrices[asset.id] ?? []
        const entry = [...prices].reverse().find(p => p.date <= date)
        totalValue += runningQty * (entry?.price ?? 0)
      }

      return {
        date,
        value:        Math.round(totalValue * 100) / 100,
        netDeposited: Math.round(netDepositByDate[date] * 100) / 100,
      }
    })

    // Trim leading entries where portfolio value is negligible (<$100).
    // Net deposits may already be non-zero (historical deposits), but if the
    // portfolio value is still $0 the chart just shows a flat bottom line —
    // the deposits line will clip above the value-scaled Y-axis anyway.
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
