import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { ChevronDown, ChevronUp, Trash2, Clock, Receipt, Loader2 } from 'lucide-react'
import { posApi } from '../services/api'
import { computeSaleTotals, computeItemTotals } from '../utils/saleUtils'

const PAYMENT_BADGE = {
  CASH:  { label: 'Cash', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  UPI:   { label: 'UPI',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  CARD:  { label: 'Card', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' },
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr + 'Z').getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(dateStr + 'Z').toLocaleDateString()
}

const RecentTransactions = forwardRef(function RecentTransactions({ onRefresh }, ref) {
  const [open, setOpen] = useState(true)
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [editQty, setEditQty] = useState({})
  const [savingItem, setSavingItem] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await posApi.recentSales(null, 20)
      setSales(res.data)
    } catch (e) {
      console.error('Failed to load recent sales', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useImperativeHandle(ref, () => ({ refresh: load }), [load])

  const handleDelete = async (sale) => {
    if (!window.confirm(`Void Invoice #${sale.invoice_number}? Stock will be restored.`)) return
    setDeleting(sale.id)
    try {
      await posApi.deleteSale(sale.id)
      setSales(prev => prev.filter(s => s.id !== sale.id))
      if (expandedId === sale.id) setExpandedId(null)
      onRefresh?.()
    } catch (e) {
      alert('Failed to delete: ' + (e.response?.data?.detail || e.message))
    } finally {
      setDeleting(null)
    }
  }

  const handleQtyChange = (itemId, value) => {
    const n = parseInt(value, 10)
    if (!isNaN(n) && n > 0) {
      setEditQty(prev => ({ ...prev, [itemId]: n }))
    }
  }

  const commitQtyChange = async (sale, item) => {
    const newQty = editQty[item.id]
    if (!newQty || newQty === item.quantity) return
    setSavingItem(item.id)
    try {
      const res = await posApi.updateItemQty(sale.id, item.id, newQty)
      setSales(prev => prev.map(s => s.id === sale.id ? res.data : s))
      setEditQty(prev => { const n = { ...prev }; delete n[item.id]; return n })
      onRefresh?.()
    } catch (e) {
      alert('Failed to update quantity: ' + (e.response?.data?.detail || e.message))
      setEditQty(prev => { const n = { ...prev }; delete n[item.id]; return n })
    } finally {
      setSavingItem(null)
    }
  }

  return (
    <div className="border-t border-slate-200 dark:border-white/5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Receipt size={13} className="text-brand-500 dark:text-brand-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-white/60">
            Recent Transactions
          </span>
          {sales.length > 0 && (
            <span className="text-[10px] bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 px-1.5 py-0.5 rounded-full font-semibold">
              {sales.length}
            </span>
          )}
        </div>
        {open
          ? <ChevronUp size={13} className="text-slate-400 dark:text-white/30" />
          : <ChevronDown size={13} className="text-slate-400 dark:text-white/30" />
        }
      </button>

      {open && (
        <div className="overflow-y-auto" style={{ maxHeight: '280px' }}>
          {loading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-slate-400 dark:text-white/30">
              <Loader2 size={14} className="animate-spin text-brand-500" />
              <span className="text-xs">Loading...</span>
            </div>
          ) : sales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-1 text-slate-400 dark:text-white/30">
              <Clock size={20} />
              <p className="text-xs">No transactions yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {sales.map(sale => {
                const badge = PAYMENT_BADGE[sale.payment_mode] || PAYMENT_BADGE.CASH
                const isExpanded = expandedId === sale.id
                const isDeleting = deleting === sale.id
                return (
                  <div key={sale.id} className="group">
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : sale.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-white/80">
                            #{sale.invoice_number}
                          </span>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-slate-400 dark:text-white/30">
                            {timeAgo(sale.created_at)}
                          </span>
                          <span className="text-[10px] text-slate-300 dark:text-white/15">·</span>
                          <span className="text-[10px] text-slate-400 dark:text-white/30">
                            {sale.items.length} item{sale.items.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-semibold text-slate-800 dark:text-white">
                          ₹{computeSaleTotals(sale).total.toFixed(2)}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(sale) }}
                          disabled={isDeleting}
                          title="Void this transaction"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 dark:text-white/30 dark:hover:text-red-400 transition-all"
                        >
                          {isDeleting
                            ? <Loader2 size={11} className="animate-spin" />
                            : <Trash2 size={11} />
                          }
                        </button>
                        {isExpanded
                          ? <ChevronUp size={11} className="text-slate-400 dark:text-white/30" />
                          : <ChevronDown size={11} className="text-slate-400 dark:text-white/30" />
                        }
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="bg-slate-50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/5 px-3 py-2 space-y-2">
                        {sale.items.map(item => {
                          const currentQty = editQty[item.id] ?? item.quantity
                          const isSaving = savingItem === item.id
                          return (
                            <div key={item.id} className="flex items-center gap-2">
                              <span className="flex-1 text-[11px] text-slate-600 dark:text-white/60 truncate">
                                {item.product_name || 'Product'}
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-white/30">
                                ₹{parseFloat(item.unit_selling_price).toFixed(2)}
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-400 dark:text-white/30">×</span>
                                <input
                                  type="number"
                                  min="1"
                                  value={currentQty}
                                  onChange={e => handleQtyChange(item.id, e.target.value)}
                                  onBlur={() => commitQtyChange(sale, item)}
                                  onKeyDown={e => e.key === 'Enter' && commitQtyChange(sale, item)}
                                  className="w-10 text-center text-[11px] font-semibold bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-md px-1 py-0.5 text-slate-800 dark:text-white focus:outline-none focus:border-brand-400 dark:focus:border-brand-500"
                                  disabled={isSaving}
                                />
                                {isSaving && (
                                  <Loader2 size={10} className="animate-spin text-brand-400" />
                                )}
                              </div>
                            </div>
                          )
                        })}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-white/5">
                          <span className="text-[10px] text-slate-400 dark:text-white/30">Total</span>
                          <span className="text-[11px] font-bold text-slate-700 dark:text-white/80">
                            ₹{computeSaleTotals(sale).total.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export default RecentTransactions
