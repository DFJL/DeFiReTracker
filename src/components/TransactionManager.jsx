import { useState } from 'react'
import { Modal } from './ui/Modal'
import { TransactionForm } from './TransactionForm'
import { NLTransactionModal } from './NLTransactionModal'
import { fmtUsd, fmtQty, fmtDate } from '../utils/format'

const TYPE_COLOR = {
  buy: 'text-profit',
  earn: 'text-profit',
  transfer_in: 'text-profit',
  sell: 'text-loss',
  transfer_out: 'text-loss',
}

export function TransactionManager({ portfolioId, transactions, onUpsert, onDelete }) {
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [showNL, setShowNL] = useState(false)
  const [nlPrefill, setNlPrefill] = useState(null)

  async function handleSave(payload) {
    const result = await onUpsert(payload)
    if (!result.error) { setShowForm(false); setNlPrefill(null) }
    return result
  }

  function handleNLParsed(parsed) {
    // AI returns: { symbol, type, qty, price_usd, fee_usd, date, notes }
    setNlPrefill(parsed)
    setEditing(null)
    setShowNL(false)
    setShowForm(true)
  }

  if (!portfolioId) return (
    <div className="bg-surface-1 border border-border rounded-lg p-8 text-center text-gray-500 text-sm">
      Select a portfolio first.
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <p className="text-xs text-gray-500">{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
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
            + Add Transaction
          </button>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="bg-surface-1 border border-border rounded-lg p-8 text-center text-gray-500 text-sm">
          No transactions yet.
        </div>
      ) : (
        <div className="bg-surface-1 border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Asset</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">Type</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">Qty</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Price</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Fee</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map(tx => (
                <tr key={tx.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 text-gray-400 num text-xs">{fmtDate(tx.date)}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-gray-100">{tx.asset?.symbol ?? '—'}</div>
                    <div className={`text-xs sm:hidden capitalize ${TYPE_COLOR[tx.type] ?? 'text-gray-400'}`}>
                      {tx.type.replace('_', ' ')}
                    </div>
                  </td>
                  <td className={`px-4 py-2.5 capitalize hidden sm:table-cell ${TYPE_COLOR[tx.type] ?? 'text-gray-400'}`}>
                    {tx.type.replace('_', ' ')}
                  </td>
                  <td className="px-4 py-2.5 text-right num text-gray-200 hidden sm:table-cell">{fmtQty(tx.qty)}</td>
                  <td className="px-4 py-2.5 text-right num text-gray-400 hidden md:table-cell">{fmtUsd(tx.price_usd)}</td>
                  <td className="px-4 py-2.5 text-right num text-gray-500 hidden md:table-cell">{tx.fee_usd > 0 ? fmtUsd(tx.fee_usd) : '—'}</td>
                  <td className="px-4 py-2.5 text-right num text-gray-200">{fmtUsd(tx.qty * tx.price_usd)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => { setEditing(tx); setNlPrefill(null); setShowForm(true) }}
                      className="text-xs text-gray-500 hover:text-accent transition-colors mr-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => { if (confirm('Delete this transaction?')) onDelete(tx.id) }}
                      className="text-xs text-gray-500 hover:text-loss transition-colors"
                    >
                      Del
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNL && (
        <Modal title="Add Transaction via AI" onClose={() => setShowNL(false)}>
          <NLTransactionModal onParsed={handleNLParsed} onClose={() => setShowNL(false)} />
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
