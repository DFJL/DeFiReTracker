/**
 * Parses a CoinGecko portfolio export CSV into transaction rows.
 *
 * Expected CoinGecko columns (case-insensitive):
 *   Date, Coin, Symbol, Type, Quantity, Price (USD), Fee (USD), Notes
 *
 * Returns { rows, errors } where rows are ready for bulk-insert into `transactions`
 * (without portfolio_id or asset_id — those are resolved by the caller).
 */
export function parseCoinGeckoCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length < 2) return { rows: [], errors: ['File is empty or has no data rows'] }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_ ]/g, ''))
  const rows = []
  const errors = []

  const col = name => headers.indexOf(name)
  const get = (cells, name) => cells[col(name)]?.trim() ?? ''

  const typeMap = {
    buy: 'buy',
    sell: 'sell',
    transfer: 'transfer_in',
    'transfer in': 'transfer_in',
    'transfer out': 'transfer_out',
    earn: 'earn',
    staking: 'earn',
    reward: 'earn',
    interest: 'earn',
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',')
    if (cells.every(c => !c.trim())) continue

    const rawType = get(cells, 'type').toLowerCase()
    const mappedType = typeMap[rawType]
    if (!mappedType) {
      errors.push(`Row ${i + 1}: unknown type "${rawType}"`)
      continue
    }

    const qty = parseFloat(get(cells, 'quantity'))
    const price = parseFloat(get(cells, 'price usd') || get(cells, 'price'))
    const fee = parseFloat(get(cells, 'fee usd') || get(cells, 'fee') || '0')
    const dateRaw = get(cells, 'date')

    if (isNaN(qty) || isNaN(price)) {
      errors.push(`Row ${i + 1}: invalid qty or price`)
      continue
    }

    rows.push({
      _symbol: get(cells, 'symbol').toUpperCase(),
      _coingeckoId: get(cells, 'coin').toLowerCase().replace(/\s+/g, '-'),
      _name: get(cells, 'coin'),
      type: mappedType,
      qty,
      price_usd: price,
      fee_usd: isNaN(fee) ? 0 : fee,
      date: new Date(dateRaw).toISOString(),
      notes: get(cells, 'notes') || null,
    })
  }

  return { rows, errors }
}
