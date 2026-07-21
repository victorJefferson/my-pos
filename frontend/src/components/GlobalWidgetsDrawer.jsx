import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronLeft, Flame, TrendingUp, AlertTriangle, AlertCircle, RefreshCw, Loader2, LayoutGrid, Wallet, Plus, Edit2, Trash2 } from 'lucide-react'
import { analyticsApi, accountsApi, expensesApi } from '../services/api'
import { getCategoryEmoji } from '../utils/categoryUtils'
import CreateAccountModal from './CreateAccountModal'
import AddTransactionModal from './AddTransactionModal'

export default function GlobalWidgetsDrawer() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  
  const [showCreateAccount, setShowCreateAccount] = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
  const [showAddTransaction, setShowAddTransaction] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState(null)

  const handleDeleteAccount = async (acc) => {
    if (acc.balance !== 0) return alert('Cannot delete account with non-zero balance.')
    if (!window.confirm(`Are you sure you want to delete the account "${acc.name}"?`)) return
    try {
      await accountsApi.delete(acc.id)
      loadData()
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to delete account')
    }
  }

  // Fluid water-like tracking refs
  const buttonRef = useRef(null)
  const targetYRef = useRef(window.innerHeight / 2)
  const currentYRef = useRef(window.innerHeight / 2)
  const animFrameRef = useRef(null)

  const [visible, setVisible] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [res, accRes] = await Promise.all([
        analyticsApi.summary(),
        accountsApi.list()
      ])
      setData(res.data)
      setAccounts(accRes.data)
    } catch (e) {
      console.error('Failed to fetch widget data:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleWidgetClick = (filterType) => {
    setOpen(false)
    navigate(`/inventory?filter=${filterType}`)
  }

  // Fetch fresh data whenever drawer opens
  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open, loadData])

  // Fluid 60fps Lerp loop for liquid water-like cursor tracking
  useEffect(() => {
    if (open) return

    const updatePosition = () => {
      const diff = targetYRef.current - currentYRef.current
      if (Math.abs(diff) > 0.05) {
        currentYRef.current += diff * 0.16
        if (buttonRef.current) {
          buttonRef.current.style.top = `${currentYRef.current}px`
        }
      }
      animFrameRef.current = requestAnimationFrame(updatePosition)
    }

    animFrameRef.current = requestAnimationFrame(updatePosition)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [open])

  // Mousemove listener for right edge proximity and target Y tracking
  useEffect(() => {
    if (open) return

    const handleMouseMove = (e) => {
      const distanceFromRight = window.innerWidth - e.clientX
      const isYInSafeZone = e.clientY >= 70 && e.clientY <= window.innerHeight - 200
      const isNearEdge = distanceFromRight <= 30 && isYInSafeZone

      if (isNearEdge || (isHovered && isYInSafeZone)) {
        setVisible(true)
        const clampedY = Math.max(70, Math.min(window.innerHeight - 200, e.clientY))
        targetYRef.current = clampedY
      } else if (!isHovered) {
        setVisible(false)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [open, isHovered])

  // ESC key listener to close drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const topSold = data?.top_sold_items || []
  const topProfit = data?.top_profit_items || []
  const lowStock = data?.low_stock_items || []
  const outOfStock = data?.out_of_stock_items || []

  return (
    <>
      {/* ── Fluid Water-Tracking Puller Button ─────────────────────────────── */}
      <div
        ref={buttonRef}
        style={{
          top: `${currentYRef.current}px`,
        }}
        className={`
          fixed right-0 z-40 -translate-y-1/2 pointer-events-auto
          transition-transform transition-opacity duration-200 ease-out
          ${open || (!visible && !isHovered)
            ? 'translate-x-full opacity-0 pointer-events-none'
            : 'translate-x-0 opacity-100'}
        `}
      >
        <button
          onClick={() => setOpen(true)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="group cursor-pointer flex items-center justify-center py-3.5 px-1.5 rounded-l-xl bg-slate-900/95 dark:bg-[#18182a]/95 text-white shadow-xl border-l border-y border-white/15 backdrop-blur-md active:scale-95"
          title="View Store Widgets"
        >
          <ChevronLeft size={22} className="group-hover:-translate-x-0.5 transition-transform text-white shrink-0" />
        </button>
      </div>

      {/* ── Slide-Over Panel Container ───────────────────────────────────────────── */}
      <div
        className={`
          fixed inset-0 z-50 overflow-hidden flex justify-end transition-opacity duration-300
          ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
      >
        {/* Backdrop overlay */}
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
          onClick={() => setOpen(false)}
        />

        {/* Sliding Panel */}
        <div
          className={`
            relative w-full max-w-lg md:max-w-xl bg-white dark:bg-[#111122] h-full shadow-2xl
            border-l border-slate-200 dark:border-white/10 flex flex-col z-10
            transition-transform duration-300 ease-out
            ${open ? 'translate-x-0' : 'translate-x-full'}
          `}
        >
          {/* Header Bar with Right Push Toggle Button */}
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0 bg-slate-50/90 dark:bg-[#0f0f1c]">
            <div className="flex items-center gap-2">
              <button
                onClick={loadData}
                disabled={loading}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-white/40 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors"
                title="Refresh widget data"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin text-brand-600' : ''} />
              </button>
              {loading && <span className="text-[11px] text-slate-400 dark:text-white/40 font-medium">Updating...</span>}
            </div>

            {/* Right Push Button to Collapse Panel */}
            <button
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-200/70 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-white text-xs font-bold transition-all active:scale-95 cursor-pointer"
              title="Push close"
            >
              <span>Close</span>
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Panel Content — Wallets & Widgets */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Wallets Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-slate-900 dark:text-white font-bold text-sm flex items-center gap-2">
                  <Wallet size={16} className="text-brand-600 dark:text-brand-400" />
                  Accounts & Wallets
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {loading && accounts.length === 0 ? (
                  <>
                    {[1, 2].map(i => (
                      <div key={i} className="glass-card p-3 h-24 animate-pulse flex flex-col justify-between">
                        <div className="w-1/2 h-3 bg-slate-200 dark:bg-white/10 rounded"></div>
                        <div className="w-2/3 h-6 bg-slate-200 dark:bg-white/10 rounded mt-2"></div>
                        <div className="flex gap-1 mt-2">
                          <div className="w-10 h-4 bg-slate-200 dark:bg-white/10 rounded"></div>
                          <div className="w-10 h-4 bg-slate-200 dark:bg-white/10 rounded"></div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {accounts.map(acc => (
                      <div
                        key={acc.id}
                        onClick={() => { setSelectedAccountId(acc.id); setShowAddTransaction(true) }}
                        className="glass-card p-3 cursor-pointer hover:border-brand-500/40 hover:shadow-lg dark:hover:border-brand-400/40 transition-all active:scale-[0.98]"
                      >
                        <div className="flex justify-between items-start">
                          <p className="text-xs text-slate-500 dark:text-white/40 font-medium truncate">{acc.name}</p>
                          <div className="flex gap-2">
                            <button onClick={(e) => { e.stopPropagation(); setEditingAccount(acc); setShowCreateAccount(true); }} className="text-slate-400 hover:text-brand-500 transition-colors"><Edit2 size={12} /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteAccount(acc); }} disabled={acc.balance != 0} className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"><Trash2 size={12} /></button>
                          </div>
                        </div>
                        <p className="text-lg font-bold text-slate-900 dark:text-white mt-1 mb-2">₹{Number(acc.balance).toFixed(0)}</p>
                        <div className="flex gap-1">
                          {acc.payment_modes.map(mode => (
                            <span key={mode} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 font-bold text-slate-500 dark:text-white/40">
                              {mode === 'CASH' ? '💵' : mode === 'UPI' ? '📱' : '💳'} {mode}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    
                    <div
                      onClick={() => setShowCreateAccount(true)}
                      className="glass-card p-3 flex flex-col items-center justify-center cursor-pointer border-dashed border-2 hover:border-brand-500/40 hover:bg-brand-50/50 dark:hover:border-brand-400/40 dark:hover:bg-brand-900/10 transition-all text-slate-400 hover:text-brand-600 dark:text-white/30 dark:hover:text-brand-400 group h-full min-h-[96px]"
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-2 group-hover:bg-brand-100 dark:group-hover:bg-brand-900/40 transition-colors">
                        <Plus size={16} />
                      </div>
                      <span className="text-xs font-bold">Add Account</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {loading && !data ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="glass-card p-4 flex flex-col h-48 animate-pulse">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-white/5">
                      <div className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-white/10 shrink-0"></div>
                      <div className="flex-1 space-y-1.5">
                        <div className="w-1/2 h-3 bg-slate-200 dark:bg-white/10 rounded"></div>
                        <div className="w-1/3 h-2 bg-slate-200 dark:bg-white/10 rounded"></div>
                      </div>
                    </div>
                    <div className="space-y-3 flex-1 mt-2">
                      {[1, 2, 3].map(j => (
                        <div key={j} className="flex justify-between items-center">
                          <div className="flex items-center gap-2 flex-1">
                            <div className="w-4 h-3 bg-slate-200 dark:bg-white/10 rounded"></div>
                            <div className="w-3/4 h-3 bg-slate-200 dark:bg-white/10 rounded"></div>
                          </div>
                          <div className="w-1/4 h-3 bg-slate-200 dark:bg-white/10 rounded"></div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Top Sold Items */}
                <div className="glass-card p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-white/5">
                      <div className="w-6 h-6 rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center shrink-0">
                        <Flame size={13} className="text-brand-600 dark:text-brand-400" />
                      </div>
                      <div>
                        <h3 className="text-slate-900 dark:text-white font-bold text-xs">Top Billed Items</h3>
                        <p className="text-slate-400 dark:text-white/30 text-[10px]">By volume (Last 30d)</p>
                      </div>
                    </div>

                    {topSold.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-slate-400 dark:text-white/25 text-center">
                        <span className="text-lg mb-1">🛒</span>
                        <p className="text-[11px]">No items sold yet</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {topSold.map((item, idx) => (
                          <div key={item.product_id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-2">
                              <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-white/30 w-3">#{idx + 1}</span>
                              <span className="text-xs">{getCategoryEmoji(item.category, item.product_name)}</span>
                              <span className="text-slate-800 dark:text-white/90 font-medium text-[11px] truncate" title={item.product_name}>
                                {item.product_name}
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-bold text-brand-600 dark:text-brand-400 text-[11px]">{item.total_quantity} sold</span>
                              <p className="text-[9px] text-slate-400 dark:text-white/30">₹{parseFloat(item.total_revenue).toFixed(0)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Top Profit Making Items */}
                <div className="glass-card p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-white/5">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                        <TrendingUp size={13} className="text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-slate-900 dark:text-white font-bold text-xs">Top Profit Makers</h3>
                        <p className="text-slate-400 dark:text-white/30 text-[10px]">Highest profit (Last 30d)</p>
                      </div>
                    </div>

                    {topProfit.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-slate-400 dark:text-white/25 text-center">
                        <span className="text-lg mb-1">💰</span>
                        <p className="text-[11px]">No profit data yet</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {topProfit.map((item, idx) => (
                          <div key={item.product_id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-2">
                              <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-white/30 w-3">#{idx + 1}</span>
                              <span className="text-xs">{getCategoryEmoji(item.category, item.product_name)}</span>
                              <span className="text-slate-800 dark:text-white/90 font-medium text-[11px] truncate" title={item.product_name}>
                                {item.product_name}
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">+₹{parseFloat(item.total_profit).toFixed(0)}</span>
                              <p className="text-[9px] text-emerald-700 dark:text-emerald-300 font-semibold">{item.margin_pct}% margin</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Low Stock Items (Clickable -> /inventory?filter=low_stock) */}
                <div
                  onClick={() => handleWidgetClick('low_stock')}
                  className="glass-card p-4 flex flex-col justify-between cursor-pointer border border-transparent hover:border-amber-500/60 hover:shadow-lg hover:shadow-amber-500/10 dark:hover:border-amber-400/60 transition-all duration-200 active:scale-[0.98] group/card"
                  title="Click to view all Low Stock products in Inventory"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-white/5">
                      <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                        <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-slate-900 dark:text-white font-bold text-xs group-hover/card:text-amber-600 dark:group-hover/card:text-amber-400 transition-colors flex items-center justify-between">
                          Low Stock Alert
                          <ChevronRight size={13} className="opacity-0 group-hover/card:opacity-100 transition-opacity text-amber-500 shrink-0" />
                        </h3>
                        <p className="text-slate-400 dark:text-white/30 text-[10px]">1 to 10 units remaining · Click to filter</p>
                      </div>
                    </div>

                    {lowStock.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-slate-400 dark:text-white/25 text-center">
                        <span className="text-lg mb-1">✅</span>
                        <p className="text-[11px]">All items well stocked</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {lowStock.map((item) => (
                          <div key={item.product_id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-2">
                              <span className="text-xs">{getCategoryEmoji(item.category, item.product_name)}</span>
                              <span className="text-slate-800 dark:text-white/90 font-medium text-[11px] truncate" title={item.product_name}>
                                {item.product_name}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0">
                              {item.stock_quantity} left
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Out of Stock Items (Clickable -> /inventory?filter=out_of_stock) */}
                <div
                  onClick={() => handleWidgetClick('out_of_stock')}
                  className="glass-card p-4 flex flex-col justify-between cursor-pointer border border-transparent hover:border-red-500/60 hover:shadow-lg hover:shadow-red-500/10 dark:hover:border-red-400/60 transition-all duration-200 active:scale-[0.98] group/card"
                  title="Click to view all Out of Stock products in Inventory"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-white/5">
                      <div className="w-6 h-6 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                        <AlertCircle size={13} className="text-red-600 dark:text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-slate-900 dark:text-white font-bold text-xs group-hover/card:text-red-600 dark:group-hover/card:text-red-400 transition-colors flex items-center justify-between">
                          Out of Stock Alert
                          <ChevronRight size={13} className="opacity-0 group-hover/card:opacity-100 transition-opacity text-red-500 shrink-0" />
                        </h3>
                        <p className="text-slate-400 dark:text-white/30 text-[10px]">0 units remaining · Click to filter</p>
                      </div>
                    </div>

                    {outOfStock.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-slate-400 dark:text-white/25 text-center">
                        <span className="text-lg mb-1">🎉</span>
                        <p className="text-[11px]">No out-of-stock products</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {outOfStock.map((item) => (
                          <div key={item.product_id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-2">
                              <span className="text-xs">{getCategoryEmoji(item.category, item.product_name)}</span>
                              <span className="text-slate-800 dark:text-white/90 font-medium text-[11px] truncate" title={item.product_name}>
                                {item.product_name}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 shrink-0">
                              Out of stock
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Modals */}
      {showCreateAccount && (
        <CreateAccountModal
          initialData={editingAccount}
          onSave={async (payload) => {
            if (editingAccount) {
              await accountsApi.update(editingAccount.id, payload)
            } else {
              await accountsApi.create(payload)
            }
            loadData()
          }}
          onClose={() => { setShowCreateAccount(false); setEditingAccount(null); }}
        />
      )}
      {showAddTransaction && (
        <AddTransactionModal
          initialAccountId={selectedAccountId}
          accounts={accounts}
          categories={[]}
          onSaveExpense={async (payload) => { await expensesApi.create(payload); loadData() }}
          onSaveTransfer={async (payload) => { await accountsApi.transfer(payload); loadData() }}
          onSaveDeposit={async (payload) => { await accountsApi.deposit(payload); loadData() }}
          onClose={() => { setShowAddTransaction(false); setSelectedAccountId(null) }}
        />
      )}
    </>
  )
}
