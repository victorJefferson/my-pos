import { Trash2, Plus, Minus, Camera } from 'lucide-react'

export default function CartSidebar({ items, onRemove, onQtyChange, onClear, onCheckout, onOpenScanner }) {
  const total = items.reduce((sum, i) => sum + i.unit_selling_price * i.quantity, 0)
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)

  const imageRecEnabled = import.meta.env.VITE_ENABLE_IMAGE_RECOGNITION === 'true'

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-[#0a0a14] transition-colors duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/5">
        <div>
          <h2 className="text-slate-900 dark:text-white font-semibold text-sm">Current Bill</h2>
          <p className="text-slate-500 dark:text-white/40 text-xs">{itemCount} items</p>
        </div>
        <div className="flex items-center gap-3">
          {imageRecEnabled && (
            <button
              onClick={onOpenScanner}
              className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors flex items-center justify-center p-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-500/10"
              title="Smart Scanner"
            >
              <Camera size={18} />
            </button>
          )}
          {items.length > 0 && (
          <button
            onClick={onClear}
            className="text-slate-400 hover:text-red-600 dark:text-white/30 dark:hover:text-red-400 transition-colors text-xs flex items-center gap-1"
            title="Clear bill (Esc)"
          >
            <Trash2 size={14} />
            Clear
          </button>
        )}
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-white/20 gap-2 py-12">
            <span className="text-4xl">🛒</span>
            <p className="text-sm font-medium">Cart is empty</p>
            <p className="text-xs text-center text-slate-400 dark:text-white/40">Search for products or tap category tiles to add items</p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.product_id}
              className="glass-card p-3 animate-fade-in"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-800 dark:text-white text-xs font-medium truncate">{item.name}</p>
                  <p className="text-slate-500 dark:text-white/40 text-xs">₹{Number(item.unit_selling_price).toFixed(2)} each</p>
                </div>
                <button
                  onClick={() => onRemove(item.product_id)}
                  className="text-slate-400 hover:text-red-600 dark:text-white/20 dark:hover:text-red-400 transition-colors shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onQtyChange(item.product_id, item.quantity - 1)}
                    className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/60 dark:hover:text-white transition-colors flex items-center justify-center"
                  >
                    <Minus size={10} />
                  </button>
                  <span className="text-slate-900 dark:text-white text-sm font-semibold w-6 text-center">{item.quantity}</span>
                  <button
                    onClick={() => onQtyChange(item.product_id, item.quantity + 1)}
                    className="w-6 h-6 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 dark:bg-brand-600/30 dark:hover:bg-brand-600/50 dark:text-brand-300 dark:hover:text-brand-200 transition-colors flex items-center justify-center"
                  >
                    <Plus size={10} />
                  </button>
                </div>
                <span className="text-slate-900 dark:text-white font-bold text-sm">
                  ₹{(item.unit_selling_price * item.quantity).toFixed(2)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Total & Checkout */}
      <div className="px-4 pb-4 pt-3 border-t border-slate-200 dark:border-white/5 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-slate-600 dark:text-white/60 text-sm">Total</span>
          <span className="text-slate-900 dark:text-white text-2xl font-bold">₹{total.toFixed(2)}</span>
        </div>
        <button
          onClick={onCheckout}
          disabled={items.length === 0}
          className="w-full btn-glow py-3 text-sm disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
        >
          Checkout — ₹{total.toFixed(2)}
        </button>
        <p className="text-slate-400 dark:text-white/20 text-[10px] text-center">Press Space to open payment</p>
      </div>
    </div>
  )
}
