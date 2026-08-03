import { useState, useEffect } from 'react'
import { Receipt, X, AlertCircle, Loader2, Send } from 'lucide-react'

const PAYMENT_MODES = [
  { mode: 'CASH', label: 'Cash', emoji: '💵', color: 'from-emerald-50 to-emerald-100/60 border-emerald-300 dark:from-emerald-600/20 dark:to-emerald-800/10 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400' },
  { mode: 'UPI', label: 'UPI', emoji: '📱', color: 'from-blue-50 to-blue-100/60 border-blue-300 dark:from-blue-600/20 dark:to-blue-800/10 dark:border-blue-500/30 text-blue-700 dark:text-blue-400' },
  { mode: 'CARD', label: 'Card', emoji: '💳', color: 'from-purple-50 to-purple-100/60 border-purple-300 dark:from-purple-600/20 dark:to-purple-800/10 dark:border-purple-500/30 text-purple-700 dark:text-purple-400' },
]

export default function AddTransactionModal({ accounts = [], categories = [], onSaveExpense, onSaveTransfer, onSaveDeposit, onClose, initialAccountId = null }) {
  const [activeTab, setActiveTab] = useState('EXPENSE') // 'EXPENSE', 'TRANSFER', 'DEPOSIT'
  
  // Expense Form State
  const [category, setCategory] = useState('Misc')
  const [customCategory, setCustomCategory] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState(() => {
    if (initialAccountId && accounts?.length) {
      const acc = accounts.find(a => a.id === initialAccountId)
      if (acc && acc.payment_modes?.length > 0) return acc.payment_modes[0]
    }
    return 'CASH'
  })
  const [expenseDesc, setExpenseDesc] = useState('')

  // Transfer Form State
  const [transferAmount, setTransferAmount] = useState('')
  const [fromAccountId, setFromAccountId] = useState(initialAccountId || '')
  const [toAccountId, setToAccountId] = useState('')
  const [transferDesc, setTransferDesc] = useState('')

  // Deposit Form State
  const [depositAmount, setDepositAmount] = useState('')
  const [depositAccountId, setDepositAccountId] = useState(initialAccountId || '')
  const [depositDesc, setDepositDesc] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const matchedExpenseAccount = accounts.find(a => (a.payment_modes || []).includes(paymentMode))

  const handleSaveExpense = async () => {
    const parsedAmount = parseFloat(expenseAmount)
    if (!expenseAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return setError('Please enter a valid expense amount')
    }

    const finalCat = category === 'Custom' ? customCategory.trim() : category
    if (!finalCat) {
      return setError('Please specify an expense category')
    }

    const finalAccountId = matchedExpenseAccount?.id || null
    if (!finalAccountId) {
      return setError(`No account found for ${paymentMode}. Please create an account that supports ${paymentMode} first.`)
    }

    setSaving(true)
    try {
      await onSaveExpense({
        category: finalCat,
        amount: parsedAmount,
        payment_mode: paymentMode,
        description: expenseDesc.trim() || null,
        account_id: finalAccountId
      })
      onClose()
    } catch (e) {
      const detail = e.response?.data?.detail
      const msg =
        typeof detail === 'object' && detail?.message
          ? detail.message
          : typeof detail === 'string'
            ? detail
            : e.message || 'Failed to record expense'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveTransfer = async () => {
    const parsedAmount = parseFloat(transferAmount)
    if (!transferAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return setError('Please enter a valid transfer amount')
    }
    if (!fromAccountId) return setError('Please select a source account')
    if (!toAccountId) return setError('Please select a destination account')
    if (fromAccountId === toAccountId) return setError('Cannot transfer to the same account')

    setSaving(true)
    try {
      await onSaveTransfer({
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: parsedAmount,
        description: transferDesc.trim() || null
      })
      onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to complete transfer')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveDeposit = async () => {
    const parsedAmount = parseFloat(depositAmount)
    if (!depositAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return setError('Please enter a valid deposit amount')
    }
    if (!depositAccountId) return setError('Please select an account for deposit')

    setSaving(true)
    try {
      await onSaveDeposit({
        account_id: depositAccountId,
        amount: parsedAmount,
        description: depositDesc.trim() || null
      })
      onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to complete deposit')
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => {
    if (activeTab === 'EXPENSE') handleSaveExpense()
    else if (activeTab === 'TRANSFER') handleSaveTransfer()
    else if (activeTab === 'DEPOSIT') handleSaveDeposit()
  }

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="glass-card bg-white dark:bg-[#111122] p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
              <Receipt size={18} className="text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <h2 className="text-slate-900 dark:text-white font-bold text-base">Add Transaction</h2>
              <p className="text-slate-500 dark:text-white/40 text-xs">Record expense or transfer funds</p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white disabled:opacity-30"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-white/5 rounded-xl mb-4">
          <button
            className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-all ${activeTab === 'EXPENSE' ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/80'}`}
            onClick={() => { setActiveTab('EXPENSE'); setError('') }}
          >
            Expense
          </button>
          <button
            className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-all ${activeTab === 'TRANSFER' ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/80'}`}
            onClick={() => { setActiveTab('TRANSFER'); setError('') }}
          >
            Transfer
          </button>
          <button
            className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-all ${activeTab === 'DEPOSIT' ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/80'}`}
            onClick={() => { setActiveTab('DEPOSIT'); setError('') }}
          >
            Deposit
          </button>
        </div>

        <div className="space-y-4">
          {activeTab === 'EXPENSE' ? (
            <>
              <div>
                <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  autoFocus
                  className="input-field text-lg font-bold"
                  placeholder="e.g. 250"
                  value={expenseAmount}
                  onChange={(e) => { setExpenseAmount(e.target.value); setError('') }}
                />
              </div>

              {matchedExpenseAccount ? (
                <div className="mb-2 p-2.5 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 dark:text-white/40 block mb-0.5">Linked Account</span>
                    <span className="text-sm font-bold text-slate-700 dark:text-white/90">{matchedExpenseAccount.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500 dark:text-white/40 block mb-0.5">Balance</span>
                    <span className="text-sm font-bold text-slate-700 dark:text-white/90">₹{matchedExpenseAccount.balance}</span>
                  </div>
                </div>
              ) : (
                <div className="mb-2 p-2.5 bg-red-50 dark:bg-red-500/10 rounded-xl border border-red-200 dark:border-red-500/30 text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-2">
                  <AlertCircle size={14} />
                  No account supports {paymentMode} payments. Please configure one.
                </div>
              )}

              <div>
                <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">Category *</label>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {['Procurement', 'Transportation', 'Utilities', 'Maintenance', 'Salary', 'Misc'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`text-xs py-2 px-2 rounded-xl border transition-all text-center ${
                        category === cat
                          ? 'bg-brand-600 text-white border-brand-500 shadow-sm'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:bg-white/5 dark:text-white/60 dark:border-white/10 dark:hover:bg-white/10'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-slate-600 dark:text-white/60 text-xs mb-1.5 block font-medium">Payment Mode *</label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_MODES.map(({ mode, label, emoji, color }) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMode(mode)}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${
                        paymentMode === mode
                          ? `${color} ring-2 ring-brand-500/40 shadow-sm`
                          : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-white/5 dark:border-white/10 dark:text-white/50'
                      }`}
                    >
                      <span className="text-lg">{emoji}</span>
                      <span className="text-xs font-bold">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">Notes (Optional)</label>
                <input
                  type="text"
                  className="input-field text-sm"
                  placeholder="e.g. Paid auto fare"
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                />
              </div>
            </>
          ) : activeTab === 'TRANSFER' ? (
            <>
              <div>
                <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">Transfer Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  autoFocus
                  className="input-field text-lg font-bold"
                  placeholder="e.g. 1000"
                  value={transferAmount}
                  onChange={(e) => { setTransferAmount(e.target.value); setError('') }}
                />
              </div>
              <div>
                <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">From Account *</label>
                <select
                  className="input-field text-sm"
                  value={fromAccountId}
                  onChange={(e) => { setFromAccountId(e.target.value); setError('') }}
                >
                  <option value="">Select source account</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} (₹{a.balance})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">To Account *</label>
                <select
                  className="input-field text-sm"
                  value={toAccountId}
                  onChange={(e) => { setToAccountId(e.target.value); setError('') }}
                >
                  <option value="">Select destination account</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id} disabled={a.id === fromAccountId}>{a.name} (₹{a.balance})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">Notes (Optional)</label>
                <input
                  type="text"
                  className="input-field text-sm"
                  placeholder="e.g. Moved cash to bank"
                  value={transferDesc}
                  onChange={(e) => setTransferDesc(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">Deposit Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  autoFocus
                  className="input-field text-lg font-bold"
                  placeholder="e.g. 5000"
                  value={depositAmount}
                  onChange={(e) => { setDepositAmount(e.target.value); setError('') }}
                />
              </div>
              <div>
                <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">To Account *</label>
                <select
                  className="input-field text-sm"
                  value={depositAccountId}
                  onChange={(e) => { setDepositAccountId(e.target.value); setError('') }}
                >
                  <option value="">Select account to deposit into</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} (₹{a.balance})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">Notes (Optional)</label>
                <input
                  type="text"
                  className="input-field text-sm"
                  placeholder="e.g. Added initial funds"
                  value={depositDesc}
                  onChange={(e) => setDepositDesc(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {error && (
          <p className="text-red-500 dark:text-red-400 text-xs mt-3 flex items-center gap-1">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} disabled={saving} className="btn-ghost flex-1 text-sm disabled:opacity-30">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-glow flex-1 text-sm">
            {saving ? <Loader2 className="animate-spin mx-auto" size={16} /> : (activeTab === 'EXPENSE' ? 'Save Expense' : activeTab === 'TRANSFER' ? 'Transfer Funds' : 'Deposit Funds')}
          </button>
        </div>
      </div>
    </div>
  )
}
