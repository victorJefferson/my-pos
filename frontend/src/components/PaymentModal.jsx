import { X, Banknote, Smartphone, CreditCard, Loader2 } from 'lucide-react'

const PAYMENT_MODES = [
  {
    mode: 'CASH',
    label: 'Cash',
    icon: Banknote,
    color: 'from-emerald-50 to-emerald-100/60 border-emerald-300 hover:border-emerald-500 dark:from-emerald-600/20 dark:to-emerald-800/10 dark:border-emerald-500/30 dark:hover:border-emerald-400/60',
    iconColor: 'text-emerald-700 dark:text-emerald-400',
    emoji: '💵',
  },
  {
    mode: 'UPI',
    label: 'UPI',
    icon: Smartphone,
    color: 'from-blue-50 to-blue-100/60 border-blue-300 hover:border-blue-500 dark:from-blue-600/20 dark:to-blue-800/10 dark:border-blue-500/30 dark:hover:border-blue-400/60',
    iconColor: 'text-blue-700 dark:text-blue-400',
    emoji: '📱',
  },
  {
    mode: 'CARD',
    label: 'Card',
    icon: CreditCard,
    color: 'from-purple-50 to-purple-100/60 border-purple-300 hover:border-purple-500 dark:from-purple-600/20 dark:to-purple-800/10 dark:border-purple-500/30 dark:hover:border-purple-400/60',
    iconColor: 'text-purple-700 dark:text-purple-400',
    emoji: '💳',
  },
]

export default function PaymentModal({ total, onPay, onCancel, loading }) {
  return (
    <div className="modal-overlay" onClick={() => !loading && onCancel()}>
      <div
        className="glass-card bg-white dark:bg-[#111122] p-6 w-full max-w-md animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-slate-900 dark:text-white font-bold text-lg">Select Payment</h2>
            <p className="text-slate-500 dark:text-white/40 text-sm">Total amount to collect</p>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <X size={20} />
          </button>
        </div>

        {/* Amount Display */}
        <div className="text-center mb-8">
          <p className="text-slate-500 dark:text-white/40 text-sm mb-1 font-medium">Bill Total</p>
          <p className="text-5xl font-black text-slate-900 dark:text-white">
            ₹<span>{total.toFixed(2)}</span>
          </p>
        </div>

        {/* Payment Options */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {PAYMENT_MODES.map(({ mode, label, color, iconColor, emoji }) => (
            <button
              key={mode}
              onClick={() => !loading && onPay(mode)}
              disabled={loading}
              className={`
                flex flex-col items-center gap-3 p-5 rounded-2xl border bg-gradient-to-br
                transition-all duration-200 active:scale-95 cursor-pointer shadow-sm
                disabled:opacity-50 disabled:cursor-not-allowed
                ${color}
              `}
            >
              {loading ? (
                <Loader2 className="animate-spin text-slate-500 dark:text-white/60" size={28} />
              ) : (
                <>
                  <span className="text-3xl">{emoji}</span>
                  <span className={`font-bold text-sm ${iconColor}`}>{label}</span>
                </>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          disabled={loading}
          className="btn-ghost w-full text-sm mt-1 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Cancel (Esc)
        </button>
      </div>
    </div>
  )
}
