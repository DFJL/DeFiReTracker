import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { fmtUsd, fmtPct } from '../utils/format'

const ASSET_COLORS   = ['#6366f1','#22c55e','#f59e0b','#06b6d4','#ec4899','#8b5cf6']
const CATEGORY_COLORS = { spot:'#6366f1', stablecoin:'#22c55e', defi:'#f59e0b', rwa:'#06b6d4' }
const CHAIN_COLORS    = { hyperevm:'#6366f1', solana:'#9945ff', ethereum:'#627eea' }

const VIEWS = ['Asset','Category','Blockchain']

function buildSlices(rows, view) {
  const map = {}
  for (const row of rows) {
    let key
    if (view === 'Asset')      key = row.symbol
    if (view === 'Category')   key = row.category
    if (view === 'Blockchain') key = row.blockchain ?? 'hyperevm'
    map[key] = (map[key] ?? 0) + (row.currentValue ?? 0)
  }
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }))
}

function colorFor(view, name, i) {
  if (view === 'Category')   return CATEGORY_COLORS[name] ?? '#888'
  if (view === 'Blockchain') return CHAIN_COLORS[name]    ?? '#888'
  return ASSET_COLORS[i % ASSET_COLORS.length]
}

export function AllocationChart({ assetRows, totalValue }) {
  const [view, setView] = useState('Asset')
  const slices = buildSlices(assetRows, view)

  if (!slices.length) return null

  return (
    <div className="bg-surface-1 border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Allocation</p>
        <div className="flex gap-1">
          {VIEWS.map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                view === v ? 'bg-surface-3 text-gray-100' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie data={slices} cx="50%" cy="50%" innerRadius={44} outerRadius={72}
              dataKey="value" strokeWidth={0}>
              {slices.map((s, i) => (
                <Cell key={s.name} fill={colorFor(view, s.name, i)} />
              ))}
            </Pie>
            <Tooltip
              formatter={v => fmtUsd(v)}
              contentStyle={{ background:'#1e2535', border:'1px solid #2a3347', borderRadius:6, fontSize:12 }}
              itemStyle={{ color:'#e5e7eb' }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="flex-1 space-y-1.5">
          {slices.sort((a,b) => b.value - a.value).map((s, i) => (
            <div key={s.name} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ background: colorFor(view, s.name, i) }} />
              <span className="text-gray-400 capitalize w-24 truncate">{s.name}</span>
              <span className="num text-gray-200 flex-1">{fmtUsd(s.value)}</span>
              <span className="num text-gray-500 w-12 text-right">
                {totalValue > 0 ? `${((s.value/totalValue)*100).toFixed(1)}%` : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
