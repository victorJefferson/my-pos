import { useState, useEffect, useCallback } from 'react'
import {
  Receipt, Plus, Trash2, Search, Calendar, RefreshCw, Loader2,
  Banknote, Smartphone, CreditCard, X, AlertCircle
} from 'lucide-react'
import { expensesApi } from '../services/api'
import StatCard from '../components/StatCard'

const PAYMENT_MODES = [
  { mode: 'CASH', label: 'Cash', emoji: '💵', color: 'from-emerald-50 to-emerald-100/60 border-emerald-300 dark:from-emerald-600/20 dark:to-emerald-800/10 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400' },
  { mode: 'UPI', label: 'UPI', emoji: '📱', color: 'from-blue-50 to-blue-100/60 border-blue-300 dark:from-blue-600/20 dark:to-blue-800/10 dark:border-blue-500/30 text-blue-700 dark:text-blue-400' },
  { mode: 'CARD', label: 'Card', emoji: '💳', color: 'from-purple-50 to-purple-100/60 border-purple-300 dark:from-purple-600/20 dark:to-purple-800/10 dark:border-purple-500/30 text-purple-700 dark:text-purple-400' },
]

function AddExpenseModal({ categories, onSave, onClose }) {
  const [category, setCategory] = useState('Misc')
  const [customCategory, setCustomCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState('CASH')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (saving) return
    const parsedAmount = parseFloat(amount)
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return setError('Please enter a valid expense amount')
    }

    const finalCat = category === 'Custom' ? customCategory.trim() : category
    if (!finalCat) {
      return setError('Please specify an expense category')
    }

    setSaving(true)
    try {
      await onSave({
        category: finalCat,
        amount: parsedAmount,
        payment_mode: paymentMode,
        description: description.trim() || null,
      })
      onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to record expense')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="glass-card bg-white dark:bg-[#111122] p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Receipt size={18} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-slate-900 dark:text-white font-bold text-base">Record Store Expense</h2>
              <p className="text-slate-500 dark:text-white/40 text-xs">Track procurement, transport, bills, etc.</p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white disabled:opacity-30"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          {/* Amount */}
          <div>
            <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">Amount (₹) *</label>
            <input
              type="number"
              min="1"
              step="0.5"
              autoFocus
              className="input-field text-lg font-bold"
              placeholder="e.g. 250"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError('') }}
            />
          </div>

          {/* Category */}
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

          {/* Payment Mode Selector */}
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

          {/* Description / Notes */}
          <div>
            <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">Notes / Description (Optional)</label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="e.g. Paid auto rickshaw fare for milk stock"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="text-red-500 dark:text-red-400 text-xs mt-3 flex items-center gap-1">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} disabled={saving} className="btn-ghost flex-1 text-sm disabled:opacity-30">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-glow flex-1 text-sm">
            {saving ? <Loader2 className="animate-spin mx-auto" size={16} /> : 'Save Expense'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [activeCategory, setActiveCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [expRes, catRes] = await Promise.all([
        expensesApi.list({
          category: activeCategory !== 'All' ? activeCategory : undefined,
          target_date: targetDate || undefined,
          limit: 200,
        }),
        expensesApi.categories(),
      ])
      setExpenses(expRes.data)
      setCategories(['All', ...catRes.data])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [activeCategory, targetDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreate = async (payload) => {
    await expensesApi.create(payload)
    loadData()
  }

  const handleDelete = async (exp) => {
    if (deletingId === exp.id) return
    if (!window.confirm(`Delete expense "${exp.category} - ₹${exp.amount}"?`)) return
    setDeletingId(exp.id)
    try {
      await expensesApi.delete(exp.id)
      await loadData()
    } catch (e) {
      alert('Failed to delete expense: ' + (e.response?.data?.detail || e.message))
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = expenses.filter((e) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return e.category.toLowerCase().includes(q) || (e.description && e.description.toLowerCase().includes(q))
  })

  const totalSpent = filtered.reduce((s, e) => s + e.amount, 0)
  const cashSpent = filtered.filter(e => e.payment_mode === 'CASH').reduce((s, e) => s + e.amount, 0)
  const upiSpent = filtered.filter(e => e.payment_mode === 'UPI').reduce((s, e) => s + e.amount, 0)
  const cardSpent = filtered.filter(e => e.payment_mode === 'CARD').reduce((s, e) => s + e.amount, 0)

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-[#0d0d14] transition-colors duration-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 dark:text-white font-bold text-lg flex items-center gap-2">
            <Receipt size={20} className="text-amber-600 dark:text-amber-400" />
            Store Expenses
          </h1>
          <p className="text-slate-500 dark:text-white/40 text-xs mt-0.5">Record transportation, procurement, utilities & custom bills</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30" size={14} />
            <input
              type="date"
              className="input-field pl-8 text-sm py-1.5 w-36"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
          <button onClick={loadData} className="btn-ghost flex items-center gap-2 text-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowModal(true)} className="btn-glow flex items-center gap-2 text-sm bg-amber-600 hover:bg-amber-500">
            <Plus size={14} />
            Record Expense
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="px-6 py-4 grid grid-cols-4 gap-4">
        <StatCard label="Total Spent" value={`₹${totalSpent.toFixed(0)}`} sub={`${filtered.length} expense items`} icon={Receipt} color="amber" />
        <StatCard label="Cash Spent" value={`₹${cashSpent.toFixed(0)}`} icon={Banknote} color="green" />
        <StatCard label="UPI Spent" value={`₹${upiSpent.toFixed(0)}`} icon={Smartphone} color="blue" />
        <StatCard label="Card Spent" value={`₹${cardSpent.toFixed(0)}`} icon={CreditCard} color="brand" />
      </div>

      {/* Filters */}
      <div className="px-6 py-2 border-b border-slate-200 dark:border-white/5 flex items-center gap-3">
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30" size={14} />
          <input
            className="input-field pl-8 text-sm py-1.5"
            placeholder="Filter expenses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`category-tab text-xs py-1.5 ${activeCategory === cat ? 'active' : ''}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 dark:text-white/30 gap-2">
            <Loader2 className="animate-spin text-amber-500" size={20} />
            <span className="text-sm">Loading expenses...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-white/30 gap-2">
            <Receipt className="opacity-30" size={36} />
            <p className="text-sm font-medium">No expenses recorded</p>
            <p className="text-xs text-slate-400 dark:text-white/40">Click "+ Record Expense" to log shop expenditures</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-slate-500 dark:text-white/40 text-xs border-b border-slate-200 dark:border-white/5">
                <th className="pb-3 pr-4 font-medium">Date & Time</th>
                <th className="pb-3 pr-4 font-medium">Category</th>
                <th className="pb-3 pr-4 font-medium">Notes / Description</th>
                <th className="pb-3 pr-4 font-medium">Payment Mode</th>
                <th className="pb-3 pr-4 font-medium">Amount</th>
                <th className="pb-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-sm">
              {filtered.map((e) => (
                <tr key={e.id} className="group hover:bg-slate-100/60 dark:hover:bg-white/3 transition-colors">
                  <td className="py-3 pr-4 text-xs text-slate-500 dark:text-white/50">
                    {new Date(e.created_at).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="badge-category font-semibold">{e.category}</span>
                  </td>
                  <td className="py-3 pr-4 text-slate-800 dark:text-white/80 text-xs max-w-xs truncate">
                    {e.description || '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                      e.payment_mode === 'CASH'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-500/30'
                        : e.payment_mode === 'UPI'
                        ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-500/30'
                        : 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-500/30'
                    }`}>
                      {e.payment_mode}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-bold text-slate-900 dark:text-white">
                    ₹{e.amount.toFixed(2)}
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => handleDelete(e)}
                      disabled={deletingId === e.id}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-slate-400 hover:text-red-600 dark:hover:bg-red-900/30 dark:text-white/40 dark:hover:text-red-400 transition-all disabled:opacity-50"
                    >
                      {deletingId === e.id ? <Loader2 size={14} className="animate-spin text-red-500" /> : <Trash2 size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <AddExpenseModal
          categories={categories}
          onSave={handleCreate}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
