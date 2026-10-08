/**
 * LP Manager engine: pure functions, no I/O.
 *
 * A snapshot describes what an LP position held at one moment:
 *   { ts, shares, amount0, amount1, price0, price1, flow?: { amount0, amount1 } }
 * `shares` is the LP / vault-token balance; amount0/amount1 are the underlying tokens the
 * whole position is worth at ts. Because `shares` only changes when the user deposits or
 * withdraws, a change in shares is a flow and everything else is performance.
 *
 * Assumption: flows happen at the END of an interval, so all previous shares earn
 * performance up to the new snapshot. Snapshot at every deposit/withdraw for exact results.
 *
 * Performance over an interval (v2 constant-product pools) decomposes exactly:
 *   V - Vprev = priceUsd + ilUsd + feesUsd
 * where V is prev shares valued at the new snapshot, H is the previous amounts held
 * at new prices (hodl basket), g is the growth of sqrt(x*y) per share:
 *   priceUsd = H - Vprev,   feesUsd = V - V/g,   ilUsd = V/g - H
 */

const EPS = 1e-9

const valueOf = (a0, a1, p0, p1) => a0 * p0 + a1 * p1

function validate(s, label) {
  for (const k of ['shares', 'amount0', 'amount1', 'price0', 'price1']) {
    if (!Number.isFinite(s?.[k]) || s[k] < 0) throw new Error(`${label}.${k} must be a non-negative number`)
  }
  if (s.shares === 0 && (s.amount0 > 0 || s.amount1 > 0)) {
    throw new Error(`${label}: amounts must be 0 when shares is 0`)
  }
}

/**
 * Diff two consecutive snapshots into ledger events.
 * `prev` may be null for the opening snapshot.
 * Returns an array of { kind: 'deposit'|'withdraw'|'performance', ... } (possibly empty).
 */
export function diffSnapshots(prev, next, { pairType = 'v2' } = {}) {
  validate(next, 'next')
  if (prev) {
    validate(prev, 'prev')
    if (new Date(next.ts) < new Date(prev.ts)) throw new Error('next snapshot is older than prev')
  }

  const prevShares = prev?.shares ?? 0
  const dShares = next.shares - prevShares
  const hasFlow = Math.abs(dShares) > EPS * Math.max(prevShares, next.shares, 1)
  const events = []

  // Per-share underlying at the end of the interval. After a full withdrawal the position
  // is empty, so the amounts the user actually withdrew (flow) are the only source.
  let ps0, ps1
  if (next.shares > 0) {
    ps0 = next.amount0 / next.shares
    ps1 = next.amount1 / next.shares
  } else if (next.flow && hasFlow) {
    ps0 = next.flow.amount0 / Math.abs(dShares)
    ps1 = next.flow.amount1 / Math.abs(dShares)
  } else if (prevShares > 0) {
    throw new Error('Full withdrawal needs the withdrawn amounts (flow) to value the position')
  } else {
    ps0 = ps1 = 0
  }

  const flowSign = dShares >= 0 ? 1 : -1
  const flowAmt0 = next.flow ? next.flow.amount0 : Math.abs(dShares) * ps0
  const flowAmt1 = next.flow ? next.flow.amount1 : Math.abs(dShares) * ps1
  const flowUsd = valueOf(flowAmt0, flowAmt1, next.price0, next.price1)

  if (prev && prevShares > 0) {
    const a0p = prev.amount0, a1p = prev.amount1
    const vPrev = valueOf(a0p, a1p, prev.price0, prev.price1)
    const v = valueOf(prevShares * ps0, prevShares * ps1, next.price0, next.price1)
    const h = valueOf(a0p, a1p, next.price0, next.price1)
    const priceUsd = h - vPrev

    // Anything the snapshots don't explain: next total value vs (prev shares at new value + flow).
    const nextTotal = valueOf(next.amount0, next.amount1, next.price0, next.price1)
    const adjustmentUsd = nextTotal - (v + flowSign * (hasFlow ? flowUsd : 0))

    let ilUsd = null, feesUsd = null, otherUsd = v - h
    if (pairType === 'v2' && a0p > 0 && a1p > 0 && ps0 > 0 && ps1 > 0) {
      const g = Math.sqrt(ps0 * ps1) / Math.sqrt((a0p / prevShares) * (a1p / prevShares))
      feesUsd = v - v / g
      ilUsd = v / g - h
      otherUsd = 0
    }
    events.push({
      kind: 'performance',
      ts: next.ts,
      valueUsd: v - vPrev + adjustmentUsd,
      priceUsd, ilUsd, feesUsd, otherUsd: otherUsd + adjustmentUsd,
    })
  }

  if (hasFlow) {
    events.push({
      kind: flowSign > 0 ? 'deposit' : 'withdraw',
      ts: next.ts,
      amount0: flowAmt0,
      amount1: flowAmt1,
      valueUsd: flowUsd,
      shares: Math.abs(dShares),
    })
  }
  return events
}

/**
 * Fold a list of snapshots (any order) into events plus position-level totals.
 * `reconcileDiffUsd` should be ~0: value + withdrawn - deposited - pnl.
 */
export function summarizePosition(snapshots, opts = {}) {
  const sorted = [...snapshots].sort((a, b) => new Date(a.ts) - new Date(b.ts))
  const events = []
  let prev = null
  for (const snap of sorted) {
    events.push(...diffSnapshots(prev, snap, opts))
    prev = snap
  }

  const sum = (kind, field) => events.filter(e => e.kind === kind).reduce((s, e) => s + (e[field] ?? 0), 0)
  const depositedUsd = sum('deposit', 'valueUsd')
  const withdrawnUsd = sum('withdraw', 'valueUsd')
  const last = sorted[sorted.length - 1]
  const currentValueUsd = last ? valueOf(last.amount0, last.amount1, last.price0, last.price1) : 0
  const pnlUsd = currentValueUsd + withdrawnUsd - depositedUsd
  const performanceUsd = sum('performance', 'valueUsd')

  let feesUsd = sum('performance', 'feesUsd')
  let ilUsd = sum('performance', 'ilUsd')
  let otherUsd = sum('performance', 'otherUsd')
  // Pools where fees can't be derived (concentrated liquidity, stable...): take the fees the
  // protocol reports (cumulative, latest snapshot that has them) and treat the rest as IL.
  const reported = [...sorted].reverse().find(s => s.feesCumUsd != null)
  const feesKnown = opts.pairType === 'v2' || reported != null
  if (opts.pairType !== 'v2' && reported) {
    feesUsd = reported.feesCumUsd
    ilUsd = otherUsd - feesUsd
    otherUsd = 0
  }

  return {
    events,
    depositedUsd,
    withdrawnUsd,
    currentValueUsd,
    pnlUsd,
    priceUsd: sum('performance', 'priceUsd'),
    ilUsd,
    feesUsd,
    otherUsd,
    feesKnown,
    reconcileDiffUsd: pnlUsd - performanceUsd,
  }
}

/** Split a snapshot into its underlying assets, for holdings / allocation. */
export function underlyingHoldings(snapshot) {
  return [
    { token: 0, qty: snapshot.amount0, price: snapshot.price0, valueUsd: snapshot.amount0 * snapshot.price0 },
    { token: 1, qty: snapshot.amount1, price: snapshot.price1, valueUsd: snapshot.amount1 * snapshot.price1 },
  ]
}

/** Map a crypto.lp_snapshots row to the engine's snapshot shape. */
export function fromDbSnapshot(r) {
  const hasFlow = r.flow0 != null && r.flow1 != null
  return {
    id: r.id,
    ts: r.ts,
    shares: Number(r.shares),
    amount0: Number(r.amount0),
    amount1: Number(r.amount1),
    price0: Number(r.price0_usd),
    price1: Number(r.price1_usd),
    feesCumUsd: r.fees_cum_usd != null ? Number(r.fees_cum_usd) : undefined,
    flow: hasFlow ? { amount0: Number(r.flow0), amount1: Number(r.flow1) } : undefined,
  }
}

/**
 * Build crypto.lp_events rows for a position from its stored snapshots, each tied back to the
 * snapshot (and previous snapshot) that produced it. Throws if any interval is invalid.
 */
export function buildEventRows(position, dbSnapshots) {
  const sorted = [...dbSnapshots].sort((a, b) => new Date(a.ts) - new Date(b.ts))
  const rows = []
  let prev = null
  for (const row of sorted) {
    const snap = fromDbSnapshot(row)
    for (const e of diffSnapshots(prev, snap, { pairType: position.pair_type })) {
      rows.push({
        position_id: position.id,
        portfolio_id: position.portfolio_id,
        snapshot_id: row.id,
        prev_snapshot_id: prev?.id ?? null,
        ts: e.ts,
        kind: e.kind,
        amount0: e.amount0 ?? null,
        amount1: e.amount1 ?? null,
        value_usd: e.valueUsd,
        price_usd: e.priceUsd ?? null,
        il_usd: e.ilUsd ?? null,
        fees_usd: e.feesUsd ?? null,
        other_usd: e.otherUsd ?? null,
      })
    }
    prev = snap
  }
  return rows
}
