import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronLeft, Flame, TrendingUp, AlertTriangle, AlertCircle, RefreshCw, Loader2, LayoutGrid } from 'lucide-react'
import { analyticsApi } from '../services/api'
import { getCategoryEmoji } from '../utils/categoryUtils'

export default function GlobalWidgetsDrawer() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  // Magnetic gravity & edge proximity state
  const [visible, setVisible] = useState(false)
  const [posY, setPosY] = useState(() => window.innerHeight / 2)
  const [isHovered, setIsHovered] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await analyticsApi.summary()
      setData(res.data)
    } catch (e) {
      console.error('Failed to fetch widget data:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch fresh data whenever drawer opens
  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open, loadData])

  // Mousemove listener for right edge proximity and magnetic Y tracking
  useEffect(() => {
    if (open) return

    const handleMouseMove = (e) => {
      const distanceFromRight = window.innerWidth - e.clientX
      // Reveal when cursor is within 45px of the right screen edge or hovering the button
      const isNearEdge = distanceFromRight <= 45

      if (isNearEdge || isHovered) {
        setVisible(true)
        // Clamp Y position cleanly so it doesn't collide with screen edges
        const clampedY = Math.max(60, Math.min(window.innerHeight - 60, e.clientY))
        setPosY(clampedY)
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
      {/* ── Magnetic Liquid Jelly Puller Button ───────────────────────────────── */}
      <div
        style={{
          top: `${posY}px`,
        }}
        className={`
          fixed right-0 z-40 -translate-y-1/2 pointer-events-auto
          animate-jelly
          ${open || (!visible && !isHovered)
            ? 'translate-x-full opacity-0 pointer-events-none scale-75'
            : 'translate-x-0 opacity-100 scale-100'}
        `}
      >
        <button
          onClick={() => setOpen(true)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`
            group cursor-pointer flex items-center gap-2.5 py-2.5 px-3.5 rounded-l-2xl
            bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600
            text-white shadow-[0_8px_25px_rgba(124,58,237,0.45)]
            border-l-2 border-y border-white/20
            hover:shadow-[0_12px_30px_rgba(124,58,237,0.65)] hover:pr-4.5
            transition-all duration-200 active:scale-95 active:rounded-l-3xl
          `}
          title="View Store Widgets"
        >
          <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform text-white/90 shrink-0" />
          <div className="w-6 h-6 rounded-lg bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
            <LayoutGrid size={13} className="text-white" />
          </div>
          <span className="text-xs font-bold tracking-wide whitespace-nowrap pr-0.5">
            Widgets
          </span>
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

          {/* Panel Content — 4 Widgets */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {loading && !data ? (
              <div className="flex flex-col items-center justify-center h-64 gap-2 text-slate-400 dark:text-white/40">
                <Loader2 className="animate-spin text-brand-600 dark:text-brand-400" size={28} />
                <p className="text-xs font-medium">Loading store widgets...</p>
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

                {/* 3. Low Stock Items */}
                <div className="glass-card p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-white/5">
                      <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                        <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <h3 className="text-slate-900 dark:text-white font-bold text-xs">Low Stock Alert</h3>
                        <p className="text-slate-400 dark:text-white/30 text-[10px]">1 to 10 units remaining</p>
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

                {/* 4. Out of Stock Items */}
                <div className="glass-card p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-white/5">
                      <div className="w-6 h-6 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                        <AlertCircle size={13} className="text-red-600 dark:text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-slate-900 dark:text-white font-bold text-xs">Out of Stock Alert</h3>
                        <p className="text-slate-400 dark:text-white/30 text-[10px]">0 units remaining</p>
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
    </>
  )
}
