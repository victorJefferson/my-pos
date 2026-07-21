import { Plus } from 'lucide-react'
import { getCategoryEmoji } from '../utils/categoryUtils'

export default function ProductCard({ product, onAdd }) {
  const hasPrice = product.selling_price !== null && product.selling_price !== undefined
  const outOfStock = product.stock_quantity === 0
  const emoji = getCategoryEmoji(product.category, product.name)

  return (
    <button
      onClick={() => !outOfStock && onAdd(product)}
      disabled={outOfStock}
      className={`product-card text-left w-full ${outOfStock ? 'opacity-40 cursor-not-allowed' : ''}`}
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
      {product.stock_quantity < 10 && product.stock_quantity > 0 && (
        <span className="text-red-500 dark:text-red-400 text-[10px]">Only {product.stock_quantity} left</span>
      )}
    </button>
  )
}
