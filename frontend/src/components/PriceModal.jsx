import { useState } from 'react'
import { X, AlertCircle } from 'lucide-react'

export default function PriceModal({ product, onConfirm, onCancel }) {
  const [sellingPrice, setSellingPrice] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [saveToDb, setSaveToDb] = useState(true)
  const [error, setError] = useState('')

  const handleConfirm = () => {
    const sp = parseFloat(sellingPrice)
    if (!sellingPrice || isNaN(sp) || sp <= 0) {
      setError('Please enter a valid selling price')
      return
    }
    const cp = costPrice ? parseFloat(costPrice) : 0
    onConfirm({
      selling_price: sp,
      cost_price: isNaN(cp) ? 0 : cp,
      save_to_db: saveToDb,
    })
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="glass-card bg-white dark:bg-[#111122] p-6 w-full max-w-sm animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <AlertCircle className="text-amber-500 dark:text-amber-400" size={20} />
            </div>
            <div>
              <h3 className="text-slate-900 dark:text-white font-semibold text-sm">Price Not Set</h3>
              <p className="text-slate-500 dark:text-white/50 text-xs mt-0.5">Enter price for this item</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Product name */}
        <div className="bg-slate-50 border border-slate-200 dark:bg-white/5 dark:border-white/10 rounded-xl px-4 py-3 mb-4">
          <p className="text-slate-500 dark:text-white/50 text-xs mb-0.5">Product</p>
          <p className="text-slate-900 dark:text-white font-semibold">{product?.name}</p>
        </div>

        {/* Price inputs */}
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">Selling Price (₹) *</label>
            <input
              type="number"
              autoFocus
              className="input-field"
              placeholder="e.g. 40"
              value={sellingPrice}
              onChange={(e) => { setSellingPrice(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              min="0"
              step="0.5"
            />
          </div>
          <div>
            <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">Cost Price (₹) — optional</label>
            <input
              type="number"
              className="input-field"
              placeholder="e.g. 30"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              min="0"
              step="0.5"
            />
          </div>
        </div>

        {error && (
          <p className="text-red-500 dark:text-red-400 text-xs mb-3 flex items-center gap-1">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        {/* Save to catalog toggle */}
        <label className="flex items-center gap-3 mb-4 cursor-pointer select-none">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only"
              checked={saveToDb}
              onChange={(e) => setSaveToDb(e.target.checked)}
            />
            <div className={`w-8 h-4 rounded-full transition-colors ${saveToDb ? 'bg-brand-600' : 'bg-slate-200 dark:bg-white/10'}`}>
              <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${saveToDb ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
            </div>
          </div>
          <span className="text-slate-600 dark:text-white/60 text-xs">Save price to product catalog</span>
        </label>

        {/* Buttons */}
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn-ghost flex-1 text-sm">Cancel</button>
          <button onClick={handleConfirm} className="btn-glow flex-1 text-sm">Add to Bill</button>
        </div>
      </div>
    </div>
  )
}
