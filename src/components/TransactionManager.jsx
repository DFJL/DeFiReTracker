import { useState, useMemo, useEffect } from 'react'
import { Modal } from './ui/Modal'
import { TransactionForm } from './TransactionForm'
import { NLTransactionModal } from './NLTransactionModal'
import { fmtUsd, fmtQty, fmtDate } from '../utils/format'

const TYPE_COLOR = {
  buy: 'text-profit', earn: 'text-profit', transfer_in: 'text-profit', deposit: 'text-profit',
  sell: 'text-loss',  transfer_out: 'text-loss', withdrawal: 'text-loss',
}
const TX_TYPES = ['buy', 'sell', 'transfer_in', 'transfer_out', 'earn', 'deposit', 'withdrawal']
const PAGE_SIZES = [25, 50, 100, 250]

function SortIcon({ active, dir }) {
  if (!active) return <span className="text-gray-700 ml-0.5">⇅</span>
  return <span className="text-accent ml-0.5">{dir === 'asc' ? '↑' : '↓'}</span>
}

function ColHeader({ label, col, sort, onSort, className = '' }) {
  return (
    <th
      className={`py-3 text-xs text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-300 transition-colors ${className}`}
      onClick={() => onSort(col)}
    >
      {label}<SortIcon active={sort.col === col} dir={sort.dir} />
    </th>
  )
}

export function TransactionManager({ portfolioId, transactions, onUpsert, onDelete, onBatchDelete, onBulkInsert }) {
  const [editing, setEditing]     = useState(null)
  const [showForm, setShowForm]   = useState(false)
  const [showNL, setShowNL]       = useState(false)
  const [nlPrefill, setNlPrefill] = useState(null)
  const [selected, setSelected]   = useState(new Set())
  const [deleting, setDeleting]   = useState(false)

  // Sort & filter state
  const [sort, setSort]           = useState({ col: 'date', dir: 'desc' })
  const [search, setSearch]       = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  // Pagination state
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState(50)

  function handleSort(col) {
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' })
    setPage(1)
  }

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, typeFilter])

  const filtered = useMemo(() => {
    let rows = transactions
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(tx => tx.asset?.symbol?.toLowerCase().includes(q) || tx.asset?.name?.toLowerCase().includes(q))
    }
    if (typeFilter) rows = rows.filter(tx => tx.type === typeFilter)

    return [...rows].sort((a, b) => {
      let va, vb
      if (sort.col === 'date')   { va = new Date(a.date); vb = new Date(b.date) }
      if (sort.col === 'asset')  { va = a.asset?.symbol ?? ''; vb = b.asset?.symbol ?? '' }
      if (sort.col === 'type')   { va = a.type; vb = b.type }
      if (sort.col === 'qty')    { va = a.qty; vb = b.qty }
      if (sort.col === 'total')  { va = a.qty * a.price_usd; vb = b.qty * b.price_usd }
      if (va < vb) return sort.dir === 'asc' ? -1 : 1
      if (va > vb) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
  }, [transactions, search, typeFilter, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pageStart  = (safePage - 1) * pageSize
  const paginated  = filtered.slice(pageStart, pageStart + pageSize)

  // Selection helpers
  const allSelected = paginated.length > 0 && paginated.every(tx => selected.has(tx.id))
  const someSelected = selected.size > 0

  function toggleAll() {
    if (allSelected) {
      setSelected(s => { const n = new Set(s); paginated.forEach(tx => n.delete(tx.id)); return n })
    } else {
      setSelected(s => { const n = new Set(s); paginated.forEach(tx => n.add(tx.id)); return n })
    }
  }

  function toggleOne(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleBatchDelete() {
    if (!confirm(`Delete ${selected.size} transaction${selected.size !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setDeleting(true)
    const { error } = await onBatchDelete([...selected])
    if (!error) setSelected(new Set())
    setDeleting(false)
  }

  async function handleSave(payload) {
    const result = await onUpsert(payload)
    if (!result.error) { setShowForm(false); setNlPrefill(null) }
    return result
  }

  function handleNLParsedSingle(parsed) {
    setNlPrefill(parsed); setEditing(null); setShowNL(false); setShowForm(true)
  }

  if (!portfolioId) return (
    <div className="bg-surface-1 border border-border rounded-lg p-8 text-center text-gray-500 text-sm">
      Select a portfolio first.
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter asset…"
              className="pl-7 pr-3 py-1.5 text-xs bg-surface-1 border border-border rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent w-36"
            />
          </div>
          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="py-1.5 px-2 text-xs bg-surface-1 border border-border rounded text-gray-400 focus:outline-none focus:border-accent"
          >
            <option value="">All types</option>
            {TX_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
          <span className="text-xs text-gray-600">
            {filtered.length} of {transactions.length}
          </span>
        </div>

        <div className="flex gap-2 items-center">
          {someSelected && (
            <button
              onClick={handleBatchDelete}
              disabled={deleting}
              className="px-3 py-1.5 text-xs border border-red-800 text-red-400 hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : `Delete ${selected.size}`}
            </button>
          )}
          <button
            onClick={() => setShowNL(true)}
            className="px-3 py-1.5 text-sm border border-border hover:border-accent hover:text-accent text-gray-400 rounded transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Add via AI
          </button>
          <button
            onClick={() => { setEditing(null); setNlPrefill(null); setShowForm(true) }}
            className="px-3 py-1.5 text-sm bg-accent hover:bg-indigo-500 text-white rounded transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="bg-surface-1 border border-border rounded-lg p-8 text-center text-gray-500 text-sm">
          No transactions yet.
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface-1 border border-border rounded-lg p-8 text-center text-gray-500 text-sm">
          No transactions match the current filter.
        </div>
      ) : (
        <>
          <div className="bg-surface-1 border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {/* Select-all checkbox */}
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="accent-accent"
                    />
                  </th>
                  <th className="px-2 py-3 text-xs text-gray-600 w-10 text-right">#</th>
                  <ColHeader label="Date"  col="date"  sort={sort} onSort={handleSort} className="px-3 text-left" />
                  <ColHeader label="Asset" col="asset" sort={sort} onSort={handleSort} className="px-3 text-left" />
                  <ColHeader label="Type"  col="type"  sort={sort} onSort={handleSort} className="px-3 text-left hidden sm:table-cell" />
                  <ColHeader label="Qty"   col="qty"   sort={sort} onSort={handleSort} className="px-3 text-right hidden sm:table-cell" />
                  <th className="px-3 py-3 text-right text-xs text-gray-500 uppercase tracking-wider hidden md:table-cell">Price</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500 uppercase tracking-wider hidden md:table-cell">Fee</th>
                  <ColHeader label="Total" col="total" sort={sort} onSort={handleSort} className="px-3 text-right" />
                  <th className="px-3 py-3 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((tx, idx) => (
                  <tr
                    key={tx.id}
                    className={`hover:bg-surface-2 transition-colors ${selected.has(tx.id) ? 'bg-surface-2/60' : ''}`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(tx.id)}
                        onChange={() => toggleOne(tx.id)}
                        className="accent-accent"
                      />
                    </td>
                    <td className="px-2 py-2.5 text-right text-xs text-gray-600 num tabular-nums">
                      {pageStart + idx + 1}
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 num text-xs whitespace-nowrap">{fmtDate(tx.date)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-gray-100">{tx.asset?.symbol ?? '—'}</div>
                      <div className={`text-xs sm:hidden capitalize ${TYPE_COLOR[tx.type] ?? 'text-gray-400'}`}>
                        {tx.type.replace('_', ' ')}
                      </div>
                    </td>
                    <td className={`px-3 py-2.5 capitalize hidden sm:table-cell ${TYPE_COLOR[tx.type] ?? 'text-gray-400'}`}>
                      {tx.type.replace('_', ' ')}
                    </td>
                    <td className="px-3 py-2.5 text-right num text-gray-200 hidden sm:table-cell">{fmtQty(tx.qty)}</td>
                    <td className="px-3 py-2.5 text-right num text-gray-400 hidden md:table-cell">{fmtUsd(tx.price_usd)}</td>
                    <td className="px-3 py-2.5 text-right num text-gray-500 hidden md:table-cell">{tx.fee_usd > 0 ? fmtUsd(tx.fee_usd) : '—'}</td>
                    <td className="px-3 py-2.5 text-right num text-gray-200">{fmtUsd(tx.qty * tx.price_usd)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => { setEditing(tx); setNlPrefill(null); setShowForm(true) }}
                        className="text-xs text-gray-500 hover:text-accent transition-colors mr-2"
                      >Edit</button>
                      <button
                        onClick={() => { if (confirm('Delete?')) onDelete(tx.id) }}
                        className="text-xs text-gray-500 hover:text-loss transition-colors"
                      >Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Rows per page:</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                className="py-1 px-2 text-xs bg-surface-1 border border-border rounded text-gray-400 focus:outline-none focus:border-accent"
              >
                {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="text-xs text-gray-600">
                {pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} of {filtered.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={safePage === 1}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >«</button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >‹</button>
              <span className="px-2 text-xs text-gray-400">
                {safePage} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >›</button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={safePage === totalPages}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >»</button>
            </div>
          </div>
        </>
      )}

      {showNL && (
        <Modal title="Add via AI" onClose={() => setShowNL(false)}>
          <NLTransactionModal
            portfolioId={portfolioId}
            onParsedSingle={handleNLParsedSingle}
            onBulkSave={onBulkInsert}
            onClose={() => setShowNL(false)}
          />
        </Modal>
      )}

      {showForm && (
        <Modal
          title={editing ? 'Edit Transaction' : 'New Transaction'}
          onClose={() => { setShowForm(false); setNlPrefill(null) }}
        >
          <TransactionForm
            portfolioId={portfolioId}
            initial={editing}
            nlPrefill={nlPrefill}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setNlPrefill(null) }}
          />
        </Modal>
      )}
    </div>
  )
}
