import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBeefyHistory, detectSwap, swapRow } from './beefy.js'
import { summarizePosition } from './lp.js'

// Real ETH/HYPE CLM vault history as pasted from Beefy (HYPE first, then ETH).
const PASTED = `
HyperEVM
4 Aug 2026, 15:24:00
3.6529818
0.0515174
45.862619
0.6467933
1.5138587
$3,743
HyperEVM
15 Jul 2026, 07:58:41

3.4400878

0.033158

47.739158

0.4601443
1.3932791
$4,151
HyperEVM
7 Jun 2026, 09:00:13

1.0262805

0.1463898

11.439405

1.6317297
1.2928793
$3,333
HyperEVM
18 May 2026, 18:14:13

1.2247397

0.1122295

14.608131

1.3386224
1.1768892
$7,293
HyperEVM
1 Apr 2026, 17:58:32

5.9023546

0.0406106

54.434005

0.3745284
1.0782193
$3,333
HyperEVM
13 Mar 2026, 18:41:05

3.6582197

0.0793014

29.537516

0.6403026
0.9613065
$3,454
HyperEVM
13 Feb 2026, 13:39:03

4.7375091

0.072849

29.961475

0.46072
0.8422487
$2,416
HyperEVM
3 Feb 2026, 17:50:29

26.028381

0.3822597

26.028381

0.3822597
0.7090723
$2,121
`

test('parses every row, oldest first, USD with thousands separators', () => {
  const { rows, errors } = parseBeefyHistory(PASTED)
  assert.deepEqual(errors, [])
  assert.equal(rows.length, 8)
  assert.ok(new Date(rows[0].ts) < new Date(rows[7].ts))
  assert.deepEqual(rows.map(r => r.usdBalance), [2121, 2416, 3454, 3333, 7293, 3333, 4151, 3743])
  assert.equal(rows[0].moved0, 26.028381)
  assert.equal(rows[7].amount1, 0.6467933)
})

test('swap flips token order', () => {
  const { rows } = parseBeefyHistory(PASTED, { swap: true })
  assert.equal(rows[0].moved0, 0.3822597)
  assert.equal(rows[0].moved1, 26.028381)
})

test('reports rows with missing numbers and pastes without dates', () => {
  assert.equal(parseBeefyHistory('nothing here').rows.length, 0)
  const bad = parseBeefyHistory('1 Jan 2026, 10:00:00\n1\n2\n3')
  assert.equal(bad.rows.length, 0)
  assert.match(bad.errors[0], /expected 6 numbers/)
})

test('engine infers the exact deposits from share changes alone (model check on real data)', () => {
  const { rows } = parseBeefyHistory(PASTED)
  // Any plausible prices work: deposit amounts must not depend on them.
  const snaps = rows.map(r => ({ ts: r.ts, shares: r.shares, amount0: r.amount0, amount1: r.amount1, price0: 40, price1: 2500 }))
  const sum = summarizePosition(snaps, { pairType: 'other' })
  const deposits = sum.events.filter(e => e.kind === 'deposit')
  assert.equal(deposits.length, 8)
  rows.forEach((r, i) => {
    assert.ok(Math.abs(deposits[i].amount0 - r.moved0) / r.moved0 < 1e-5, `HYPE deposit ${i}`)
    assert.ok(Math.abs(deposits[i].amount1 - r.moved1) / r.moved1 < 1e-5, `ETH deposit ${i}`)
  })
  assert.ok(Math.abs(sum.reconcileDiffUsd) < 1e-6)
})

test('detectSwap picks the token order that matches Beefy USD balances', () => {
  const { rows } = parseBeefyHistory(PASTED) // Beefy order: HYPE first, ETH second
  // Rough prices per row: HYPE ~ 40-90, ETH ~ 2000-2600, derived so the value is close to Beefy's USD.
  const hype = 55, eth = 2300
  // Position order ETH/HYPE (token0 = ETH): prices attach to token0/token1, amounts are in Beefy order.
  const asEthHype = rows.map(r => ({ ...r, price0: eth, price1: hype }))
  assert.equal(detectSwap(asEthHype), true)   // amounts must be flipped
  // Position order HYPE/ETH matches Beefy: no flip.
  const asHypeEth = rows.map(r => ({ ...r, price0: hype, price1: eth }))
  assert.equal(detectSwap(asHypeEth), false)
  assert.equal(detectSwap(rows), null)         // no prices yet
  assert.equal(swapRow(rows[0]).amount0, rows[0].amount1)
})
