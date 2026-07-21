import { AlertTriangle } from 'lucide-react'

export default function LowStockBadge({ qty }) {
  if (qty > 10) return null
  return (
    <span className="badge-low-stock">
      <AlertTriangle size={10} />
      {qty === 0 ? 'Out of Stock' : `Low: ${qty}`}
    </span>
  )
}
