import { useState, useMemo } from 'react'
import {
  AreaChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from 'recharts'
import { fmtUsd } from '../utils/format'

const RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: 'ALL', days: Infinity },
]

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const value = payload.find(p => p.dataKey === 'value')
  const cost  = payload.find(p => p.dataKey === 'cost')
  const pnl   = value && cost ? value.value - cost.value : null
  const isUp  = pnl >= 0
  return (
    <div className="bg-surface-2 border border-border rounded px-3 py-2 text-xs shadow-xl space-y-1">
      <p className="text-gray-400">{label}</p>
      {value && <p className="text-gray-100 font-semibold num">Value  {fmtUsd(value.value)}</p>}
      {cost  && <p className="text-gray-500 num">Invested  {fmtUsd(cost.value)}</p>}
      {pnl != null && (
        <p className={`num font-semibold ${isUp ? 'profit' : 'loss'}`}>
          PnL  {isUp ? '+' : ''}{fmtUsd(pnl)}
        </p>
      )}
    </div>
  )
}

export function PortfolioChart({ timeline, loading }) {
  const [range, setRange] = useState('3M')

  const filtered = useMemo(() => {
    if (!timeline.length) return []
    const { days } = RANGES.find(r => r.label === range)
    if (days === Infinity) return timeline
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return timeline.filter(d => d.date >= cutoffStr)
  }, [timeline, range])

  const firstValue = filtered[0]?.value ?? 0
  const lastValue  = filtered[filtered.length - 1]?.value ?? 0
  const delta      = lastValue - firstValue
  const isUp       = delta >= 0
  const strokeColor = isUp ? '#22c55e' : '#ef4444'

  const yMin = useMemo(() => {
    if (!filtered.length) return 0
    const vals = filtered.flatMap(d => [d.value, d.cost])
    return Math.floor(Math.min(...vals) * 0.95)
  }, [filtered])

  const yMax = useMemo(() => {
    if (!filtered.length) return 0
    const vals = filtered.flatMap(d => [d.value, d.cost])
    return Math.ceil(Math.max(...vals) * 1.05)
  }, [filtered])

  return (
    <div className="bg-surface-1 border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Portfolio Value</p>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="inline-block w-6 border-t-2 border-indigo-400" />
              <span className="text-gray-500">Value</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-6 border-t border-dashed border-gray-500" />
              <span className="text-gray-500">Invested</span>
            </span>
          </div>
        </div>
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => setRange(r.label)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                range === r.label
                  ? 'bg-surface-3 text-gray-100'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-52 flex items-center justify-center text-xs text-gray-600">
          Loading price history…
        </div>
      ) : filtered.length < 2 ? (
        <div className="h-52 flex items-center justify-center text-xs text-gray-600">
          Not enough data for this range.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={filtered} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="valueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={strokeColor} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3347" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={d =>
                  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                }
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `$${(v / 1000).toFixed(1)}k`}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={firstValue} stroke="#374151" strokeDasharray="3 3" />

              {/* Cost basis / invested line */}
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#6b7280"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                fill="none"
                dot={false}
                activeDot={{ r: 3, fill: '#6b7280', strokeWidth: 0 }}
              />

              {/* Portfolio value area */}
              <Area
                type="monotone"
                dataKey="value"
                stroke={strokeColor}
                strokeWidth={2}
                fill="url(#valueGrad)"
                dot={false}
                activeDot={{ r: 4, fill: strokeColor, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>

          <div className="flex items-center gap-3 mt-2 text-xs num">
            <span className="text-gray-500">Period change</span>
            <span className={isUp ? 'profit' : 'loss'}>
              {isUp ? '+' : ''}{fmtUsd(delta)}
            </span>
            <span className={isUp ? 'profit' : 'loss'}>
              ({isUp ? '+' : ''}{firstValue > 0 ? ((delta / firstValue) * 100).toFixed(2) : '0.00'}%)
            </span>
          </div>
        </>
      )}
    </div>
  )
}
