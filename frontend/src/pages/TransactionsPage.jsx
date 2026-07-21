import { useState, useEffect, useCallback } from 'react'
import {
  Receipt, RefreshCw, Loader2, Clock, Trash2, Edit2, Check, X,
  ChevronDown, ChevronUp, Search, Filter, AlertTriangle,
} from 'lucide-react'
import { posApi } from '../services/api'

const PAYMENT_BADGE = {
  CASH: { label: 'Cash',  cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/40' },
  UPI:  { label: 'UPI',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-700/40' },
  CARD: { label: 'Card',  cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-700/40' },
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr + 'Z').getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(dateStr + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatTime(dateStr) {
  return new Date(dateStr + 'Z').toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatDate(dateStr) {
  return new Date(dateStr + 'Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function TransactionsPage() {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState('ALL')        // ALL | CASH | UPI | CARD
  const [expandedId, setExpandedId] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deletingItem, setDeletingItem] = useState(null)   // item id being deleted
  const [editState, setEditState] = useState({})             // { [itemId]: { qty, saving } }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await posApi.recentSales(50)
      setSales(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  /* ─── Derived lists ──────────────────────────────────────────────────────── */
  const filtered = sales.filter(s => {
    if (filterMode !== 'ALL' && s.payment_mode !== filterMode) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const matchesInvoice = String(s.invoice_number).includes(q)
      const matchesItem = s.items.some(i => (i.product_name || '').toLowerCase().includes(q))
      if (!matchesInvoice && !matchesItem) return false
    }
    return true
  })

  // Always compute totals from items (sale.total_amount can be stale if items were edited)
  const getSaleTotals = (sale) => {
    const total  = sale.items.reduce((s, i) => s + parseFloat(i.total_price), 0)
    const cost   = sale.items.reduce((s, i) => s + parseFloat(i.unit_cost_price) * i.quantity, 0)
    const profit = total - cost
    return { total, cost, profit }
  }

  const totalRevenue = filtered.reduce((acc, s) => acc + getSaleTotals(s).total, 0)
  const totalProfit  = filtered.reduce((acc, s) => acc + getSaleTotals(s).profit, 0)

  /* ─── Delete single item ───────────────────────────────────────── */
  const handleDeleteItem = async (sale, item) => {
    const isLast = sale.items.length === 1
    const msg = isLast
      ? `Remove "${item.product_name || 'this item'}"? It's the only item — the whole transaction will be voided and stock restored.`
      : `Remove "${item.product_name || 'this item'}" (×${item.quantity}) from Invoice #${sale.invoice_number}? Stock will be restored.`
    if (!window.confirm(msg)) return
    setDeletingItem(item.id)
    try {
      await posApi.deleteItem(sale.id, item.id)
      if (isLast) {
        // Whole sale gone — remove from list
        setSales(prev => prev.filter(s => s.id !== sale.id))
        setExpandedId(null)
      } else {
        // Refresh the sale in the list
        const res = await posApi.recentSales(50)
        setSales(res.data)
      }
    } catch (e) {
      alert('Failed to remove item: ' + (e.response?.data?.detail || e.message))
    } finally {
      setDeletingItem(null)
    }
  }

  /* ─── Delete ─────────────────────────────────────────────────────────────── */
  const handleDelete = async (sale) => {
    if (!window.confirm(`Void Invoice #${sale.invoice_number}?\nThis will restore stock for all ${sale.items.length} item(s).`)) return
    setDeleting(sale.id)
    try {
      await posApi.deleteSale(sale.id)
      setSales(prev => prev.filter(s => s.id !== sale.id))
      if (expandedId === sale.id) setExpandedId(null)
    } catch (e) {
      alert('Failed to void: ' + (e.response?.data?.detail || e.message))
    } finally {
      setDeleting(null)
    }
  }

  /* ─── Qty edit ───────────────────────────────────────────────────────────── */
  const startEdit = (item) => {
    setEditState(prev => ({ ...prev, [item.id]: { qty: item.quantity, saving: false } }))
  }

  const cancelEdit = (itemId) => {
    setEditState(prev => { const n = { ...prev }; delete n[itemId]; return n })
  }

  const commitEdit = async (sale, item) => {
    const state = editState[item.id]
    if (!state) return
    const newQty = parseInt(state.qty, 10)
    if (isNaN(newQty) || newQty < 1) return cancelEdit(item.id)
    if (newQty === item.quantity) return cancelEdit(item.id)

    setEditState(prev => ({ ...prev, [item.id]: { ...prev[item.id], saving: true } }))
    try {
      const res = await posApi.updateItemQty(sale.id, item.id, newQty)
      setSales(prev => prev.map(s => s.id === sale.id ? res.data : s))
      cancelEdit(item.id)
    } catch (e) {
      alert('Failed to update: ' + (e.response?.data?.detail || e.message))
      setEditState(prev => ({ ...prev, [item.id]: { ...prev[item.id], saving: false } }))
    }
  }

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-[#0d0d14] transition-colors duration-200">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 bg-white/80 dark:bg-[#0a0a14]/80 backdrop-blur-sm flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 dark:text-white font-bold text-lg flex items-center gap-2">
            <Receipt size={20} className="text-brand-600 dark:text-brand-400" />
            Transactions
          </h1>
          <p className="text-slate-500 dark:text-white/40 text-xs mt-0.5">
            Last {sales.length} sales · Click a row to expand · Hover items to edit
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-white/60 transition-all active:scale-95"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div className="flex gap-4 px-6 py-3 border-b border-slate-200 dark:border-white/5 bg-white dark:bg-[#0a0a14]">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-xs text-slate-400 dark:text-white/30 font-medium">Transactions</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{filtered.length}</p>
          </div>
          <div className="w-px h-8 bg-slate-200 dark:bg-white/10" />
          <div className="text-center">
            <p className="text-xs text-slate-400 dark:text-white/30 font-medium">Revenue</p>
            <p className="text-xl font-bold text-brand-600 dark:text-brand-400">₹{totalRevenue.toFixed(2)}</p>
          </div>
          <div className="w-px h-8 bg-slate-200 dark:bg-white/10" />
          <div className="text-center">
            <p className="text-xs text-slate-400 dark:text-white/30 font-medium">Profit</p>
            <p className={`text-xl font-bold ${totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
              ₹{totalProfit.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 dark:border-white/5 bg-white dark:bg-[#0a0a14]">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30" />
          <input
            type="text"
            className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:border-brand-400 dark:focus:border-brand-500 transition-colors"
            placeholder="Search by invoice # or product name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white">
              <X size={13} />
            </button>
          )}
        </div>
        {/* Payment filter pills */}
        <div className="flex items-center gap-1.5">
          {['ALL', 'CASH', 'UPI', 'CARD'].map(m => (
            <button
              key={m}
              onClick={() => setFilterMode(m)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${filterMode === m
                ? 'bg-brand-600 text-white dark:bg-brand-500 shadow-sm'
                : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-white/50 hover:bg-slate-200 dark:hover:bg-white/10'}`}
            >
              {m === 'ALL' ? 'All' : m}
            </button>
          ))}
        </div>
      </div>

      {/* ── Transaction List ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-48 gap-3 text-slate-400 dark:text-white/30">
            <Loader2 size={22} className="animate-spin text-brand-500" />
            <span className="text-sm">Loading transactions…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400 dark:text-white/30">
            <Receipt size={36} className="opacity-30" />
            <p className="text-sm font-semibold">No transactions found</p>
            {search && <p className="text-xs">Try clearing your search filter</p>}
          </div>
        ) : (
          filtered.map(sale => {
            const badge = PAYMENT_BADGE[sale.payment_mode] || PAYMENT_BADGE.CASH
            const isExpanded = expandedId === sale.id
            const isDeleting = deleting === sale.id
            const { total: saleTotal, cost: saleCost, profit: saleProfit } = getSaleTotals(sale)
            const margin = saleTotal > 0 ? (saleProfit / saleTotal * 100).toFixed(1) : '0.0'

            return (
              <div
                key={sale.id}
                className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                  isExpanded
                    ? 'border-brand-300 dark:border-brand-600/50 shadow-md shadow-brand-500/10'
                    : 'border-slate-200 dark:border-white/8 hover:border-slate-300 dark:hover:border-white/15 hover:shadow-sm'
                } bg-white dark:bg-[#111120]`}
              >
                {/* Sale header — click to expand */}
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer select-none"
                  onClick={() => setExpandedId(isExpanded ? null : sale.id)}
                >
                  {/* Invoice badge */}
                  <div className="w-12 h-12 rounded-xl bg-brand-50 dark:bg-brand-600/10 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold text-brand-500 dark:text-brand-400 uppercase tracking-wider">INV</span>
                    <span className="text-base font-black text-brand-700 dark:text-brand-300 leading-none">#{sale.invoice_number}</span>
                  </div>

                  {/* Date + time */}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">{formatDate(sale.created_at)}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock size={11} className="text-slate-400 dark:text-white/30" />
                      <span className="text-xs text-slate-400 dark:text-white/40">{formatTime(sale.created_at)} · {timeAgo(sale.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex-1" />

                  {/* Items count */}
                  <div className="text-center hidden sm:block">
                    <p className="text-lg font-bold text-slate-700 dark:text-white/80">{sale.items.length}</p>
                    <p className="text-[10px] text-slate-400 dark:text-white/30">item{sale.items.length !== 1 ? 's' : ''}</p>
                  </div>

                  {/* Profit */}
                  <div className="text-center hidden md:block">
                    <p className={`text-lg font-bold ${saleProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      ₹{saleProfit.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-white/30">{margin}% margin</p>
                  </div>

                  {/* Total + payment badge */}
                  <div className="text-right shrink-0">
                    <p className="text-xl font-black text-slate-900 dark:text-white">₹{saleTotal.toFixed(2)}</p>
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleDelete(sale)}
                      disabled={isDeleting}
                      title="Void & delete this transaction"
                      className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:text-white/30 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-all active:scale-90"
                    >
                      {isDeleting
                        ? <Loader2 size={16} className="animate-spin text-red-500" />
                        : <Trash2 size={16} />
                      }
                    </button>
                    <div className="p-2 text-slate-400 dark:text-white/30">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {/* ── Expanded items table ──────────────────────────────── */}
                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-white/5 px-5 py-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-3">
                      Items in this transaction
                    </p>
                    <div className="space-y-2">
                      {sale.items.map(item => {
                        const es = editState[item.id]
                        const isSaving = es?.saving
                        const isEditing = !!es

                        return (
                          <div
                            key={item.id}
                            className="group flex items-center gap-4 px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/10 transition-all"
                          >
                            {/* Product name */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                                {item.product_name || 'Unknown Product'}
                              </p>
                              <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">
                                ₹{parseFloat(item.unit_selling_price).toFixed(2)} each
                              </p>
                            </div>

                            {/* Qty section */}
                            <div className="flex items-center gap-2">
                              {isEditing ? (
                                <>
                                  <span className="text-xs text-slate-400 dark:text-white/30">Qty</span>
                                  <input
                                    type="number"
                                    min="1"
                                    autoFocus
                                    value={es.qty}
                                    onChange={e => setEditState(prev => ({ ...prev, [item.id]: { ...prev[item.id], qty: e.target.value } }))}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') commitEdit(sale, item)
                                      if (e.key === 'Escape') cancelEdit(item.id)
                                    }}
                                    className="w-16 text-center text-sm font-bold bg-white dark:bg-white/10 border-2 border-brand-400 dark:border-brand-500 rounded-lg px-2 py-1 text-slate-800 dark:text-white focus:outline-none"
                                    disabled={isSaving}
                                  />
                                  <button
                                    onClick={() => commitEdit(sale, item)}
                                    disabled={isSaving}
                                    className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 transition-colors"
                                  >
                                    {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                  </button>
                                  <button
                                    onClick={() => cancelEdit(item.id)}
                                    disabled={isSaving}
                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 dark:text-white/40 transition-colors"
                                  >
                                    <X size={13} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-xs text-slate-400 dark:text-white/30">×</span>
                                  <span className="text-base font-bold text-slate-700 dark:text-white/80 w-8 text-center">
                                    {item.quantity}
                                  </span>
                                  <button
                                    onClick={() => startEdit(item)}
                                    title="Edit quantity"
                                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-slate-100 hover:bg-brand-50 dark:bg-white/5 dark:hover:bg-brand-600/20 text-slate-400 hover:text-brand-600 dark:text-white/30 dark:hover:text-brand-400 transition-all"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(sale, item)}
                                    disabled={deletingItem === item.id}
                                    title="Remove this item from transaction"
                                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-slate-100 hover:bg-red-50 dark:bg-white/5 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 dark:text-white/30 dark:hover:text-red-400 transition-all"
                                  >
                                    {deletingItem === item.id
                                      ? <Loader2 size={13} className="animate-spin text-red-400" />
                                      : <X size={13} />
                                    }
                                  </button>
                                </>
                              )}
                            </div>

                            {/* Line total */}
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-slate-800 dark:text-white">
                                ₹{parseFloat(item.total_price).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Sale summary footer */}
                    <div className="mt-4 flex items-center justify-between px-4 py-3 rounded-xl bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-700/30">
                      <div className="flex items-center gap-6">
                        <div>
                          <p className="text-[10px] text-brand-500 dark:text-brand-400 font-medium uppercase tracking-wider">Cost</p>
                          <p className="text-sm font-bold text-slate-600 dark:text-white/70">₹{saleCost.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-brand-500 dark:text-brand-400 font-medium uppercase tracking-wider">Profit</p>
                          <p className={`text-sm font-bold ${saleProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                            ₹{saleProfit.toFixed(2)} ({margin}%)
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-brand-500 dark:text-brand-400 font-medium uppercase tracking-wider">Total</p>
                        <p className="text-lg font-black text-brand-700 dark:text-brand-300">₹{saleTotal.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
