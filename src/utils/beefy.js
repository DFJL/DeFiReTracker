/**
 * Parses the transaction history table copied from a Beefy vault page.
 *
 * Each row is a date followed by six numbers, in this order:
 *   deposited/withdrawn token A, token B, vault balance token A, token B, mooTokens, USD balance
 * Token A / B follow the order Beefy shows, which may differ from the position's token0/token1;
 * `swap` flips them.
 *
 * Returns { rows (oldest first), errors }.
 */
const DATE_RX = /(\d{1,2}\s+[A-Za-z]{3}\s+\d{4}),?\s+(\d{1,2}:\d{2}:\d{2})/g
const NUM_RX = /-?\$?\s*\d[\d,]*(?:\.\d+)?/g

export function parseBeefyHistory(text, { swap = false } = {}) {
  const rows = []
  const errors = []
  const dates = [...text.matchAll(DATE_RX)]
  if (!dates.length) return { rows, errors: ['No dates found. Paste the history table from the Beefy vault page.'] }

  dates.forEach((m, i) => {
    const end = i + 1 < dates.length ? dates[i + 1].index : text.length
    const segment = text.slice(m.index + m[0].length, end)
    const nums = (segment.match(NUM_RX) ?? []).map(n => Number(n.replace(/[$,\s]/g, '')))
    const ts = new Date(`${m[1]} ${m[2]}`)
    if (isNaN(ts)) { errors.push(`Unreadable date: ${m[0]}`); return }
    if (nums.length < 6 || nums.slice(0, 6).some(n => !Number.isFinite(n))) {
      errors.push(`${m[0]}: expected 6 numbers, found ${nums.length}`)
      return
    }
    const [mA, mB, bA, bB, shares, usd] = nums
    rows.push({
      ts: ts.toISOString(),
      moved0: Math.abs(swap ? mB : mA), moved1: Math.abs(swap ? mA : mB),
      amount0: swap ? bB : bA, amount1: swap ? bA : bB,
      shares, usdBalance: usd,
    })
  })

  rows.sort((a, b) => new Date(a.ts) - new Date(b.ts))
  return { rows, errors }
}
