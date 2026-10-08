import test from 'node:test'
import assert from 'node:assert/strict'
import { diffSnapshots, summarizePosition, underlyingHoldings } from './lp.js'

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} !~ ${b}`)
const perf = evs => evs.find(e => e.kind === 'performance')

// 100 shares = 1 ETH + 2000 USDC with ETH at 2000 (k = 2000)
const open = { ts: '2026-01-01', shares: 100, amount0: 1, amount1: 2000, price0: 2000, price1: 1 }

test('opening snapshot is a deposit at full value', () => {
  const evs = diffSnapshots(null, open)
  assert.equal(evs.length, 1)
  assert.equal(evs[0].kind, 'deposit')
  near(evs[0].valueUsd, 4000)
})

test('price move with no fees is pure price effect + IL', () => {
  const x = Math.sqrt(2000 / 3000), y = Math.sqrt(2000 * 3000)
  const next = { ts: '2026-02-01', shares: 100, amount0: x, amount1: y, price0: 3000, price1: 1 }
  const p = perf(diffSnapshots(open, next))
  near(p.priceUsd, 1000)
  near(p.feesUsd, 0)
  near(p.ilUsd, x * 3000 + y - 5000) // value of pool position minus hodl basket
  near(p.priceUsd + p.ilUsd + p.feesUsd, x * 3000 + y - 4000)
  assert.ok(p.ilUsd < 0)
})

test('growth of k per share is attributed to fees', () => {
  const next = { ts: '2026-02-01', shares: 100, amount0: 1.01, amount1: 2020, price0: 2000, price1: 1 }
  const p = perf(diffSnapshots(open, next))
  near(p.priceUsd, 0)
  near(p.ilUsd, 0)
  near(p.feesUsd, 40, 1e-6)
})

test('share increase is a deposit valued at the new snapshot', () => {
  const next = { ts: '2026-02-01', shares: 150, amount0: 1.5, amount1: 3000, price0: 2000, price1: 1 }
  const evs = diffSnapshots(open, next)
  const dep = evs.find(e => e.kind === 'deposit')
  near(dep.valueUsd, 2000)
  near(dep.amount0, 0.5)
  near(perf(evs).valueUsd, 0)
})

test('full withdrawal uses the declared flow amounts', () => {
  const next = { ts: '2026-02-01', shares: 0, amount0: 0, amount1: 0, price0: 2000, price1: 1,
                 flow: { amount0: 1.02, amount1: 2040 } }
  const evs = diffSnapshots(open, next)
  const w = evs.find(e => e.kind === 'withdraw')
  near(w.valueUsd, 1.02 * 2000 + 2040)
  near(perf(evs).feesUsd, 80) // k per share grew 2%: 4080 - 4080/1.02
  near(perf(evs).ilUsd, 0)
  assert.throws(() => diffSnapshots(open, { ...next, flow: undefined }), /withdrawn amounts/)
})

test('position summary reconciles deposits, withdrawals and performance', () => {
  const s2 = { ts: '2026-02-01', shares: 100, amount0: 1.01, amount1: 2020, price0: 2000, price1: 1 }
  const s3 = { ts: '2026-03-01', shares: 150, amount0: 1.6, amount1: 3300, price0: 2100, price1: 1 }
  const s4 = { ts: '2026-04-01', shares: 0, amount0: 0, amount1: 0, price0: 2200, price1: 1,
               flow: { amount0: 1.65, amount1: 3400 } }
  const sum = summarizePosition([s3, open, s4, s2])
  near(sum.reconcileDiffUsd, 0, 1e-6)
  near(sum.currentValueUsd, 0)
  near(sum.pnlUsd, sum.withdrawnUsd - sum.depositedUsd)
})

test('underlyingHoldings decomposes into both tokens', () => {
  const [a, b] = underlyingHoldings(open)
  near(a.valueUsd, 2000)
  near(b.valueUsd, 2000)
})

test('rejects bad input', () => {
  assert.throws(() => diffSnapshots(null, { ...open, shares: 0 }), /shares is 0/)
  assert.throws(() => diffSnapshots(open, { ...open, ts: '2025-01-01' }), /older/)
})

import { buildEventRows, fromDbSnapshot } from './lp.js'

test('buildEventRows ties each event to its snapshot and previous snapshot', () => {
  const db = [
    { id: 's2', ts: '2026-02-01', shares: 100, amount0: 1.01, amount1: 2020, price0_usd: 2000, price1_usd: 1 },
    { id: 's1', ts: '2026-01-01', shares: 100, amount0: 1, amount1: 2000, price0_usd: 2000, price1_usd: 1 },
  ]
  const rows = buildEventRows({ id: 'p', portfolio_id: 'pf', pair_type: 'v2' }, db)
  assert.deepEqual(rows.map(r => [r.kind, r.snapshot_id, r.prev_snapshot_id]),
    [['deposit', 's1', null], ['performance', 's2', 's1']])
  near(rows[1].fees_usd, 40)
  assert.equal(rows[0].portfolio_id, 'pf')
})

test('fromDbSnapshot only sets flow when both amounts are present', () => {
  const base = { id: 'x', ts: '2026-01-01', shares: '1', amount0: '1', amount1: '1', price0_usd: '1', price1_usd: '1' }
  assert.equal(fromDbSnapshot(base).flow, undefined)
  assert.deepEqual(fromDbSnapshot({ ...base, flow0: '2', flow1: '3' }).flow, { amount0: 2, amount1: 3 })
})
