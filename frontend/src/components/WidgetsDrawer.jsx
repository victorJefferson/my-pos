import { useEffect } from 'react'
import { Flame, TrendingUp, AlertTriangle, AlertCircle, X, LayoutGrid } from 'lucide-react'
import { getCategoryEmoji } from '../utils/categoryUtils'

export default function WidgetsDrawer({ data, onClose }) {
  // ESC key listener to close drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const topSold = data?.top_sold_items || []
  const topProfit = data?.top_profit_items || []
  const lowStock = data?.low_stock_items || []
  const outOfStock = data?.out_of_stock_items || []

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#111122] h-full shadow-2xl border-l border-slate-200 dark:border-white/10 flex flex-col z-10 animate-slide-in-right">
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0 bg-slate-50/80 dark:bg-[#111122]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600/15 border border-brand-500/30 flex items-center justify-center">
              <LayoutGrid size={20} className="text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <h2 className="text-slate-900 dark:text-white font-bold text-base flex items-center gap-2">
                Business Intelligence Widgets
              </h2>
              <p className="text-slate-500 dark:text-white/40 text-xs">
                Real-time sales highlights & stock alerts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:text-white/40 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. Top Sold Items */}
            <div className="glass-card p-4.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-slate-200 dark:border-white/5">
                  <div className="w-7 h-7 rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
                    <Flame size={15} className="text-brand-600 dark:text-brand-400" />
                  </div>
                  <div>
                    <h3 className="text-slate-900 dark:text-white font-bold text-xs">Top Billed Items</h3>
                    <p className="text-slate-400 dark:text-white/30 text-[10px]">By volume (Last 30d)</p>
                  </div>
                </div>

                {topSold.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-white/25 text-center">
                    <span className="text-xl mb-1">🛒</span>
                    <p className="text-xs">No items sold yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {topSold.map((item, idx) => (
                      <div key={item.product_id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                          <span className="text-xs font-mono font-bold text-slate-400 dark:text-white/30 w-4">#{idx + 1}</span>
                          <span className="text-sm">{getCategoryEmoji(item.category, item.product_name)}</span>
                          <span className="text-slate-800 dark:text-white/90 font-medium truncate" title={item.product_name}>
                            {item.product_name}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-brand-600 dark:text-brand-400">{item.total_quantity} sold</span>
                          <p className="text-[10px] text-slate-400 dark:text-white/30">₹{parseFloat(item.total_revenue).toFixed(0)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Top Profit Making Items */}
            <div className="glass-card p-4.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-slate-200 dark:border-white/5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                    <TrendingUp size={15} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-slate-900 dark:text-white font-bold text-xs">Top Profit Makers</h3>
                    <p className="text-slate-400 dark:text-white/30 text-[10px]">Highest profit (Last 30d)</p>
                  </div>
                </div>

                {topProfit.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-white/25 text-center">
                    <span className="text-xl mb-1">💰</span>
                    <p className="text-xs">No profit data yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {topProfit.map((item, idx) => (
                      <div key={item.product_id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                          <span className="text-xs font-mono font-bold text-slate-400 dark:text-white/30 w-4">#{idx + 1}</span>
                          <span className="text-sm">{getCategoryEmoji(item.category, item.product_name)}</span>
                          <span className="text-slate-800 dark:text-white/90 font-medium truncate" title={item.product_name}>
                            {item.product_name}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">+₹{parseFloat(item.total_profit).toFixed(0)}</span>
                          <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold">{item.margin_pct}% margin</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 3. Low Stock Items */}
            <div className="glass-card p-4.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-slate-200 dark:border-white/5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                    <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-slate-900 dark:text-white font-bold text-xs">Low Stock Alert</h3>
                    <p className="text-slate-400 dark:text-white/30 text-[10px]">1 to 10 units remaining</p>
                  </div>
                </div>

                {lowStock.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-white/25 text-center">
                    <span className="text-xl mb-1">✅</span>
                    <p className="text-xs">All items well stocked</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {lowStock.map((item) => (
                      <div key={item.product_id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                          <span className="text-sm">{getCategoryEmoji(item.category, item.product_name)}</span>
                          <span className="text-slate-800 dark:text-white/90 font-medium truncate" title={item.product_name}>
                            {item.product_name}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0">
                          {item.stock_quantity} left
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 4. Out of Stock Items */}
            <div className="glass-card p-4.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-slate-200 dark:border-white/5">
                  <div className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                    <AlertCircle size={15} className="text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-slate-900 dark:text-white font-bold text-xs">Out of Stock Alert</h3>
                    <p className="text-slate-400 dark:text-white/30 text-[10px]">0 units remaining</p>
                  </div>
                </div>

                {outOfStock.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-white/25 text-center">
                    <span className="text-xl mb-1">🎉</span>
                    <p className="text-xs">No out-of-stock products</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {outOfStock.map((item) => (
                      <div key={item.product_id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                          <span className="text-sm">{getCategoryEmoji(item.category, item.product_name)}</span>
                          <span className="text-slate-800 dark:text-white/90 font-medium truncate" title={item.product_name}>
                            {item.product_name}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 shrink-0">
                          Out of stock
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
