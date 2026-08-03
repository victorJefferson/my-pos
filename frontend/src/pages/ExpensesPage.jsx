import { useState, useEffect, useCallback } from 'react'
import {
  Receipt, Plus, Trash2, Search, Calendar, RefreshCw, Loader2,
  Banknote, Smartphone, CreditCard, X, AlertCircle
} from 'lucide-react'
import { expensesApi, accountsApi } from '../services/api'
import Skeleton from '../components/Skeleton'
import StatCard from '../components/StatCard'
import AddTransactionModal from '../components/AddTransactionModal'
import DateRangeSelector from '../components/DateRangeSelector'
import {
  listExpensesCached,
  listAccountsCached,
  offlineExpenseCreate,
  offlineExpenseDelete,
  offlineTransfer,
  offlineDeposit,
} from '../offline/mutations'
import { useOffline } from '../context/OfflineContext'
import { OFFLINE_MODE } from '../offline/config'


export default function ExpensesPage() {
  const { refresh: refreshOffline } = useOffline()
  const [expenses, setExpenses] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [activeCategory, setActiveCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState({ mode: 'today', start: null, end: null })
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (OFFLINE_MODE) {
        const [exps, accs] = await Promise.all([
          listExpensesCached({
            category: activeCategory !== 'All' ? activeCategory : undefined,
            start_date: dateFilter.mode === 'today' ? new Date().toISOString().split('T')[0] : dateFilter.start || undefined,
            end_date: dateFilter.mode === 'today' ? new Date().toISOString().split('T')[0] : dateFilter.end || undefined,
            limit: 200,
          }),
          listAccountsCached(),
        ])
        setExpenses(exps)
        setAccounts(accs)
        try {
          const catRes = await expensesApi.categories()
          setCategories(['All', ...catRes.data])
        } catch {
          const cats = [...new Set(exps.map((e) => e.category).filter(Boolean))]
          setCategories(['All', ...cats])
        }
      } else {
        const [expRes, catRes, accRes] = await Promise.all([
          expensesApi.list({
            category: activeCategory !== 'All' ? activeCategory : undefined,
            start_date: dateFilter.mode === 'today' ? new Date().toISOString().split('T')[0] : dateFilter.start || undefined,
            end_date: dateFilter.mode === 'today' ? new Date().toISOString().split('T')[0] : dateFilter.end || undefined,
            limit: 200,
          }),
          expensesApi.categories(),
          accountsApi.list(),
        ])
        setExpenses(expRes.data)
        setCategories(['All', ...catRes.data])
        setAccounts(accRes.data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [activeCategory, dateFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreateExpense = async (payload) => {
    await offlineExpenseCreate(payload)
    refreshOffline()
    loadData()
  }

  const handleCreateTransfer = async (payload) => {
    await offlineTransfer(payload)
    refreshOffline()
    loadData()
  }

  const handleDelete = async (exp) => {
    if (deletingId === exp.id) return
    if (!window.confirm(`Delete expense "${exp.category} - ₹${exp.amount}"?`)) return
    setDeletingId(exp.id)
    try {
      await offlineExpenseDelete(exp.id)
      refreshOffline()
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

  const totalSpent = filtered.reduce((s, e) => s + Number(e.amount || 0), 0)
  const cashSpent = filtered.filter(e => e.payment_mode === 'CASH').reduce((s, e) => s + Number(e.amount || 0), 0)
  const upiSpent = filtered.filter(e => e.payment_mode === 'UPI').reduce((s, e) => s + Number(e.amount || 0), 0)
  const cardSpent = filtered.filter(e => e.payment_mode === 'CARD').reduce((s, e) => s + Number(e.amount || 0), 0)

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
          <DateRangeSelector
            loading={loading}
            onFilterChange={(newFilter) => setDateFilter(newFilter)}
          />
          <button onClick={loadData} className="btn-ghost flex items-center gap-2 text-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowModal(true)} className="btn-glow flex items-center gap-2 text-sm bg-amber-600 hover:bg-amber-500">
            <Plus size={14} />
            Add Transaction
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
          <div className="flex-1 overflow-x-auto min-h-0">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-white/[0.02] sticky top-0 z-10 backdrop-blur-xl">
                <tr>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 border-b border-slate-200 dark:border-white/5">Date</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 border-b border-slate-200 dark:border-white/5">Category</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 border-b border-slate-200 dark:border-white/5">Amount</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 border-b border-slate-200 dark:border-white/5">Description</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 border-b border-slate-200 dark:border-white/5">Payment Mode</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-white/40 border-b border-slate-200 dark:border-white/5 text-right w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 pl-4">
                      <Skeleton className="h-4 w-24 rounded" />
                    </td>
                    <td className="py-3 px-4">
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </td>
                    <td className="py-3 px-4">
                      <Skeleton className="h-5 w-20 rounded" />
                    </td>
                    <td className="py-3 px-4">
                      <Skeleton className="h-4 w-32 rounded" />
                    </td>
                    <td className="py-3 px-4">
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <Skeleton className="h-8 w-8 ml-auto rounded-xl" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                    ₹{Number(e.amount || 0).toFixed(2)}
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
        <AddTransactionModal
          accounts={accounts}
          categories={categories.filter(c => c !== 'All')}
          onSaveExpense={handleCreateExpense}
          onSaveTransfer={handleCreateTransfer}
          onSaveDeposit={async (payload) => { await offlineDeposit(payload); refreshOffline(); loadData() }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
