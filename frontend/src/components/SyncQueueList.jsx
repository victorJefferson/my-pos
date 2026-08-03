import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Receipt,
  Wallet,
  Package,
  ArrowLeftRight,
  Landmark,
  Trash2,
} from 'lucide-react'
import { getTenantId } from '../services/api'
import { getOfflineDb } from '../offline/db'
import { discardPendingCheckout, updatePendingOp } from '../offline/outbox'
import { timeAgoApp } from '../utils/dateUtils'

const INR = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

function statusLabel(status) {
  if (status === 'failed') return { text: 'Failed', cls: 'text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-300' }
  if (status === 'syncing') return { text: 'Syncing', cls: 'text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300' }
  return { text: 'Waiting', cls: 'text-slate-500 bg-slate-100 dark:bg-white/10 dark:text-white/50' }
}

function lineTotal(item) {
  if (item.total_price != null) return Number(item.total_price)
  return Number(item.unit_selling_price || 0) * Number(item.quantity || 0)
}

function BillCard({ op, productNames, onDiscard, onRetry }) {
  const [open, setOpen] = useState(false)
  const items = op.payload?.items || []
  const total = items.reduce((s, i) => s + lineTotal(i), 0)
  const qty = items.reduce((s, i) => s + Number(i.quantity || 0), 0)
  const st = statusLabel(op.status)
  const mode = op.payload?.payment_mode || '—'

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-[#0f0f1a]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.03]"
      >
        <div className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0 mt-0.5">
          <Receipt size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-slate-900 dark:text-white text-sm">Unsynced bill</p>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${st.cls}`}>
              {st.text}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-white/45 mt-0.5">
            {qty} item{qty === 1 ? '' : 's'} · {mode}
            {op.created_at ? ` · ${timeAgoApp(op.created_at)}` : ''}
          </p>
          <p className="text-base font-bold text-slate-900 dark:text-white mt-1">{INR(total)}</p>
        </div>
        <div className="text-slate-400 mt-1">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-3 border-t border-slate-100 dark:border-white/5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mt-3 mb-2">
            Items in this bill
          </p>
          <div className="space-y-2">
            {items.map((item, idx) => {
              const name =
                item.product_name ||
                productNames[item.product_id] ||
                'Product'
              const row = lineTotal(item)
              return (
                <div
                  key={item.id || `${item.product_id}-${idx}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-white/90 truncate">{name}</p>
                    <p className="text-xs text-slate-400">
                      {INR(item.unit_selling_price)} × {item.quantity}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white shrink-0">{INR(row)}</p>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 dark:border-white/5 text-sm">
            <span className="text-slate-500">Bill total</span>
            <span className="font-bold text-slate-900 dark:text-white">{INR(total)}</span>
          </div>
          {(op.type === 'sale.checkout' && op.status !== 'syncing') || op.status === 'failed' ? (
            <div className="mt-3 flex gap-2">
              {op.type === 'sale.checkout' && op.status !== 'syncing' && (
                <button
                  type="button"
                  onClick={onDiscard}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                >
                  Discard bill
                </button>
              )}
              {op.status === 'failed' && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white/80"
                >
                  Retry
                </button>
              )}
            </div>
          ) : null}
          {op.last_error?.message && (
            <p className="text-xs text-rose-500 mt-2">{op.last_error.message}</p>
          )}
        </div>
      )}
    </div>
  )
}

function ExpenseCard({ op, onRetry }) {
  const st = statusLabel(op.status)
  const p = op.payload || {}
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/10 px-4 py-3 bg-white dark:bg-[#0f0f1a]">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
          <Wallet size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-slate-900 dark:text-white text-sm">Expense</p>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${st.cls}`}>
              {st.text}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-white/45 mt-0.5">
            {p.category || 'Misc'}
            {p.payment_mode ? ` · ${p.payment_mode}` : ''}
            {op.created_at ? ` · ${timeAgoApp(op.created_at)}` : ''}
          </p>
          {p.description && (
            <p className="text-xs text-slate-400 mt-1 truncate">{p.description}</p>
          )}
          <p className="text-base font-bold text-slate-900 dark:text-white mt-1">{INR(p.amount)}</p>
          {op.status === 'failed' && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-white/10"
            >
              Retry
            </button>
          )}
          {op.last_error?.message && (
            <p className="text-xs text-rose-500 mt-2">{op.last_error.message}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function SimpleCard({ icon: Icon, title, subtitle, amount, op, onRetry, tone = 'slate' }) {
  const st = statusLabel(op.status)
  const tones = {
    slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  }
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/10 px-4 py-3 bg-white dark:bg-[#0f0f1a]">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-slate-900 dark:text-white text-sm">{title}</p>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${st.cls}`}>
              {st.text}
            </span>
          </div>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-white/45 mt-0.5">{subtitle}</p>
          )}
          {amount != null && (
            <p className="text-base font-bold text-slate-900 dark:text-white mt-1">{INR(amount)}</p>
          )}
          {op.status === 'failed' && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-white/10"
            >
              Retry
            </button>
          )}
          {op.last_error?.message && (
            <p className="text-xs text-rose-500 mt-2">{op.last_error.message}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function renderOp(op, { productNames, onDiscard, onRetry }) {
  switch (op.type) {
    case 'sale.checkout':
      return (
        <BillCard
          key={op.client_op_id}
          op={op}
          productNames={productNames}
          onDiscard={() => onDiscard(op)}
          onRetry={() => onRetry(op)}
        />
      )
    case 'expense.create':
      return <ExpenseCard key={op.client_op_id} op={op} onRetry={() => onRetry(op)} />
    case 'expense.delete':
      return (
        <SimpleCard
          key={op.client_op_id}
          icon={Trash2}
          title="Delete expense"
          subtitle="Remove a recorded expense"
          op={op}
          onRetry={() => onRetry(op)}
          tone="rose"
        />
      )
    case 'account.deposit':
      return (
        <SimpleCard
          key={op.client_op_id}
          icon={Landmark}
          title="Deposit"
          subtitle={op.created_at ? timeAgoApp(op.created_at) : null}
          amount={op.payload?.amount}
          op={op}
          onRetry={() => onRetry(op)}
          tone="emerald"
        />
      )
    case 'account.transfer':
      return (
        <SimpleCard
          key={op.client_op_id}
          icon={ArrowLeftRight}
          title="Transfer"
          subtitle={op.created_at ? timeAgoApp(op.created_at) : null}
          amount={op.payload?.amount}
          op={op}
          onRetry={() => onRetry(op)}
          tone="blue"
        />
      )
    case 'product.create':
      return (
        <SimpleCard
          key={op.client_op_id}
          icon={Package}
          title="New product"
          subtitle={op.payload?.name || 'Catalog update'}
          op={op}
          onRetry={() => onRetry(op)}
        />
      )
    case 'product.update':
      return (
        <SimpleCard
          key={op.client_op_id}
          icon={Package}
          title="Product update"
          subtitle={op.payload?.name || 'Price / stock change'}
          op={op}
          onRetry={() => onRetry(op)}
        />
      )
    case 'product.delete':
      return (
        <SimpleCard
          key={op.client_op_id}
          icon={Package}
          title="Deactivate product"
          op={op}
          onRetry={() => onRetry(op)}
          tone="rose"
        />
      )
    case 'sale.void':
      return (
        <SimpleCard
          key={op.client_op_id}
          icon={Trash2}
          title="Void sale"
          subtitle="Will restore stock when synced"
          op={op}
          onRetry={() => onRetry(op)}
          tone="rose"
        />
      )
    case 'account.create':
      return (
        <SimpleCard
          key={op.client_op_id}
          icon={Landmark}
          title="New account"
          subtitle={op.payload?.name}
          op={op}
          onRetry={() => onRetry(op)}
        />
      )
    default:
      return (
        <SimpleCard
          key={op.client_op_id}
          icon={Receipt}
          title="Pending change"
          subtitle={op.type?.replace(/\./g, ' · ')}
          op={op}
          onRetry={() => onRetry(op)}
        />
      )
  }
}

export default function SyncQueueList({ ops, syncing, onRefresh, onSyncNow }) {
  const [productNames, setProductNames] = useState({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const tid = getTenantId()
      if (!tid) return
      try {
        const db = getOfflineDb(tid)
        const products = await db.cache_products.toArray()
        if (cancelled) return
        const map = {}
        for (const p of products) map[p.id] = p.name
        // Prefer names already on cached pending sales
        const pendingSales = await db.cache_sales.filter((s) => s.pending).toArray()
        for (const sale of pendingSales) {
          for (const item of sale.items || []) {
            if (item.product_id && item.product_name) {
              map[item.product_id] = item.product_name
            }
          }
        }
        setProductNames(map)
      } catch (_) {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ops])

  const handleDiscard = async (op) => {
    if (!confirm('Discard this bill? It was never uploaded to the server.')) return
    try {
      await discardPendingCheckout(op.client_op_id)
      await onRefresh()
    } catch (e) {
      alert(e.message || 'Could not discard')
    }
  }

  const handleRetry = async (op) => {
    await updatePendingOp(op.client_op_id, { status: 'pending', last_error: null })
    await onSyncNow()
  }

  return (
    <div className="p-4 overflow-y-auto max-h-[60vh] space-y-3">
      {syncing && (
        <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Sync in progress…
        </p>
      )}
      {ops.length === 0 && !syncing && (
        <p className="text-sm text-slate-500">No pending changes.</p>
      )}
      {ops.map((op) =>
        renderOp(op, {
          productNames,
          onDiscard: handleDiscard,
          onRetry: handleRetry,
        }),
      )}
    </div>
  )
}
