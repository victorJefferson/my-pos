import { Loader2 } from 'lucide-react'
import { getCategoryEmoji } from '../utils/categoryUtils'

export default function ProductCard({ product, onAdd, updating = false }) {
  const hasPrice = product.selling_price !== null && product.selling_price !== undefined
  const outOfStock = product.stock_quantity === 0
  const emoji = getCategoryEmoji(product.category, product.name)
  const lowStock = product.stock_quantity < 10 && product.stock_quantity > 0

  return (
    <button
      onClick={() => !outOfStock && onAdd(product)}
      disabled={outOfStock}
      className={`product-card text-left w-full ${outOfStock ? 'opacity-40 cursor-not-allowed' : ''} ${
        updating ? 'ring-2 ring-brand-400/60 dark:ring-brand-500/50 animate-pulse' : ''
      }`}
      title={outOfStock ? 'Out of stock' : `Add ${product.name}`}
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-slate-800 dark:text-white text-xs font-medium text-center leading-tight line-clamp-2">
        {product.name}
      </span>
      {hasPrice ? (
        <span className="text-brand-700 dark:text-brand-300 text-sm font-bold">₹{Number(product.selling_price).toFixed(0)}</span>
      ) : (
        <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">Tap to set price</span>
      )}
      {lowStock && (
        <span
          className={`text-[10px] ${
            updating
              ? 'text-brand-600 dark:text-brand-400 font-semibold'
              : 'text-red-500 dark:text-red-400'
          }`}
        >
          Only {product.stock_quantity} left
        </span>
      )}
      {!lowStock && outOfStock && (
        <span className="text-slate-400 dark:text-white/40 text-[10px]">Out of stock</span>
      )}
      {updating && (
        <span className="text-brand-600 dark:text-brand-400 text-[10px] inline-flex items-center gap-1">
          <Loader2 size={10} className="animate-spin" />
          Stock updated
        </span>
      )}
    </button>
  )
}
