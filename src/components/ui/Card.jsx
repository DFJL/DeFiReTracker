export function Card({ children, className = '' }) {
  return (
    <div className={`bg-surface-1 border border-border rounded-lg p-4 ${className}`}>
      {children}
    </div>
  )
}

export function StatCard({ label, value, sub, valueClass = '' }) {
  return (
    <Card>
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-semibold num ${valueClass}`}>{value}</p>
      {sub && <p className={`text-sm mt-1 ${valueClass}`}>{sub}</p>}
    </Card>
  )
}
