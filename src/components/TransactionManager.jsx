import { useState } from 'react'
import { Modal } from './ui/Modal'
import { TransactionForm } from './TransactionForm'
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

  async function handleSave(payload) {
    const result = await onUpsert(payload)
    if (!result.error) setShowForm(false)
    return result
  }

  if (!portfolioId) return (
    <div className="bg-surface-1 border border-border rounded-lg p-8 text-center text-gray-500 text-sm">
      Select a portfolio first.
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-gray-500">{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="px-3 py-1.5 text-sm bg-accent hover:bg-indigo-500 text-white rounded transition-colors"
        >
          + Add Transaction
        </button>
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
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Fee</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map(tx => (
                <tr key={tx.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 text-gray-400 num">{fmtDate(tx.date)}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-gray-100">{tx.asset?.symbol ?? '—'}</span>
                  </td>
                  <td className={`px-4 py-2.5 capitalize ${TYPE_COLOR[tx.type] ?? 'text-gray-400'}`}>
                    {tx.type.replace('_', ' ')}
                  </td>
                  <td className="px-4 py-2.5 text-right num text-gray-200">{fmtQty(tx.qty)}</td>
                  <td className="px-4 py-2.5 text-right num text-gray-400">{fmtUsd(tx.price_usd)}</td>
                  <td className="px-4 py-2.5 text-right num text-gray-500">{tx.fee_usd > 0 ? fmtUsd(tx.fee_usd) : '—'}</td>
                  <td className="px-4 py-2.5 text-right num text-gray-200">
                    {fmtUsd(tx.qty * tx.price_usd)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => { setEditing(tx); setShowForm(true) }}
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

      {showForm && (
        <Modal
          title={editing ? 'Edit Transaction' : 'New Transaction'}
          onClose={() => setShowForm(false)}
        >
          <TransactionForm
            portfolioId={portfolioId}
            initial={editing}
            onSave={handleSave}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}
    </div>
  )
}
