export function fmtUsd(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

export function fmtQty(n) {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  const decimals = abs >= 1 ? 4 : 8
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(n)
}

export function fmtPct(n) {
  if (n == null || isNaN(n)) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

export function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function pnlClass(n) {
  if (n == null || isNaN(n) || n === 0) return 'text-gray-400'
  return n > 0 ? 'profit' : 'loss'
}
