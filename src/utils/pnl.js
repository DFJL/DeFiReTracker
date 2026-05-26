/**
 * Computes holdings and PnL from a list of transactions for one asset.
 *
 * Returns:
 *   { qty, avgCost, realizedPnl, unrealizedPnl, unrealizedPct, currentValue }
 */
export function computeAssetPnl(transactions, currentPrice) {
  let totalCost = 0
  let totalQty = 0
  let realizedPnl = 0
  let grossInvested = 0

  const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date))

  for (const tx of sorted) {
    const qty = Number(tx.qty)
    const price = Number(tx.price_usd)
    const fee = Number(tx.fee_usd ?? 0)

    if (tx.type === 'buy' || tx.type === 'transfer_in' || tx.type === 'earn') {
      totalCost += qty * price + fee
      totalQty += qty
      grossInvested += qty * price + fee
    } else if (tx.type === 'sell' || tx.type === 'transfer_out') {
      const avgCostNow = totalQty > 0 ? totalCost / totalQty : 0
      realizedPnl += (price - avgCostNow) * qty - fee
      totalCost -= avgCostNow * qty
      totalQty -= qty
    }
  }

  const qty = Math.max(0, totalQty)
  const avgCost = qty > 0 ? totalCost / qty : 0
  const currentValue = qty * (currentPrice ?? 0)
  const unrealizedPnl = currentPrice != null ? (currentPrice - avgCost) * qty : null
  const unrealizedPct =
    avgCost > 0 && unrealizedPnl != null ? (unrealizedPnl / (avgCost * qty)) * 100 : null

  const costBasis = Math.max(0, totalCost)
  return { qty, avgCost, costBasis, grossInvested, realizedPnl, unrealizedPnl, unrealizedPct, currentValue }
}

/**
 * Aggregates per-asset PnL into portfolio-level totals and category breakdown.
 */
export function aggregatePortfolio(assetRows) {
  let totalValue = 0
  let totalUnrealized = 0
  let totalRealized = 0
  let totalInvested = 0
  let totalGrossInvested = 0
  const byCategory = {}

  for (const row of assetRows) {
    totalValue += row.currentValue ?? 0
    totalUnrealized += row.unrealizedPnl ?? 0
    totalRealized += row.realizedPnl ?? 0
    totalInvested += row.costBasis ?? 0
    totalGrossInvested += row.grossInvested ?? 0

    const cat = row.category ?? 'spot'
    byCategory[cat] = (byCategory[cat] ?? 0) + (row.currentValue ?? 0)
  }

  const costBasis = totalValue - totalUnrealized
  const unrealizedPct = costBasis > 0 ? (totalUnrealized / costBasis) * 100 : 0

  return { totalValue, totalUnrealized, totalRealized, totalInvested, totalGrossInvested, unrealizedPct, byCategory }
}
