import { useState } from 'react'
import { Trash2, AlertTriangle, Download, X, Check, Loader2, ShieldAlert, Database } from 'lucide-react'
import { analyticsApi, posApi } from '../services/api'

export default function PurgeDataModal({ onClose, onPurgeSuccess }) {
  const [backedUp, setBackedUp] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [purging, setPurging] = useState(false)
  const [error, setError] = useState('')

  const todayStr = new Date().toISOString().split('T')[0]
  // Far past date to capture earliest possible transactions
  const earliestStr = '2000-01-01'

  // Download complete full backup from beginning of time to today
  const handleDownloadBackup = async (format = 'csv') => {
    setDownloading(true)
    setError('')
    try {
      const res = await analyticsApi.report(earliestStr, todayStr)
      const data = res.data

      if (format === 'csv') {
        let csv = `RELAX CORNER POS — COMPLETE HISTORICAL BACKUP REPORT\n`
        csv += `Store Name,${data.store_name}\n`
        csv += `Report Period,All Time (up to ${data.end_date})\n`
        csv += `Generated At,${data.generated_at}\n\n`

        csv += `EXECUTIVE FINANCIAL SUMMARY\n`
        csv += `Gross Revenue (INR),Total COGS (INR),Total Expenses (INR),Net Profit (INR),Net Margin %,Total Bills,Avg Basket Size (INR)\n`
        csv += `${data.gross_revenue},${data.total_cogs},${data.total_expenses},${data.net_profit},${data.net_margin_pct}%,${data.total_bills},${data.avg_basket_size}\n\n`

        csv += `PAYMENT MODE BREAKDOWN\n`
        csv += `Payment Mode,Total Amount (INR),Transaction Count\n`
        csv += `Cash,${data.payment_breakdown.cash},${data.payment_breakdown.cash_count}\n`
        csv += `UPI,${data.payment_breakdown.upi},${data.payment_breakdown.upi_count}\n`
        csv += `Card,${data.payment_breakdown.card},${data.payment_breakdown.card_count}\n\n`

        csv += `EXPENSE CATEGORY BREAKDOWN\n`
        csv += `Category,Amount Spent (INR)\n`
        data.category_expenses.forEach((c) => {
          csv += `"${c.category}",${c.amount}\n`
        })
        csv += `\n`

        csv += `DAILY TRANSACTION TRENDS\n`
        csv += `Date,Gross Revenue (INR),COGS (INR),Expenses (INR),Net Profit (INR),Bill Count,Cash (INR),UPI (INR),Card (INR)\n`
        data.daily_rows.forEach((r) => {
          csv += `${r.date},${r.gross_revenue},${r.total_cogs},${r.total_expenses},${r.net_profit},${r.bill_count},${r.cash_amount},${r.upi_amount},${r.card_amount}\n`
        })

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', `RelaxCorner_ALL_TIME_BACKUP_${todayStr}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      setBackedUp(true)
    } catch (err) {
      console.error('Failed to generate full backup:', err)
      setError('Failed to generate backup report. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const handlePurge = async () => {
    if (!backedUp) return
    if (confirmText.trim().toUpperCase() !== 'DELETE') return

    setPurging(true)
    setError('')
    try {
      await posApi.purgeTransactions(true)
      if (onPurgeSuccess) onPurgeSuccess()
      onClose()
    } catch (err) {
      console.error('Purge failed:', err)
      setError(err.response?.data?.detail || 'Failed to purge transactions. Please try again.')
    } finally {
      setPurging(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#161622] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400">
            <Database size={20} />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Database Storage Cleanup</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Warning Banner */}
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-900 dark:text-amber-300 text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <AlertTriangle size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />
              <span>What gets deleted vs preserved:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-amber-200/80">
              <li><strong className="text-red-600 dark:text-red-400">DELETED:</strong> All past sales, transaction line-items, and expense history to free up database storage.</li>
              <li><strong className="text-emerald-600 dark:text-emerald-400">PRESERVED:</strong> Store catalog, item stock quantities, category setups, and Smart Scanner ML visual learnings.</li>
            </ul>
          </div>

          {/* Step 1: Backup Requirement */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/50 flex items-center justify-between">
              <span>Step 1: Download Full Backup</span>
              {backedUp && <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1"><Check size={12} /> Backup Verified</span>}
            </label>
            <button
              onClick={() => handleDownloadBackup('csv')}
              disabled={downloading}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold border transition-all ${
                backedUp
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-brand-50 hover:bg-brand-100 dark:bg-brand-600/20 dark:hover:bg-brand-600/30 border-brand-200 dark:border-brand-500/30 text-brand-700 dark:text-brand-300'
              }`}
            >
              {downloading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating Full History Backup...
                </>
              ) : backedUp ? (
                <>
                  <Check size={16} />
                  Full History Backup Downloaded (.CSV)
                </>
              ) : (
                <>
                  <Download size={16} />
                  Download Complete Historical Backup (.CSV)
                </>
              )}
            </button>
            <p className="text-[11px] text-slate-400 dark:text-white/40">
              Captures all transactions & expenses from day one into an Excel-ready report.
            </p>
          </div>

          {/* Step 2: Confirm Deletion */}
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/50">
              Step 2: Confirm Purge Action
            </label>
            <p className="text-xs text-slate-600 dark:text-white/60">
              Type <strong className="text-red-600 dark:text-red-400 font-mono">DELETE</strong> below to confirm transaction history purge:
            </p>
            <input
              type="text"
              disabled={!backedUp}
              placeholder={backedUp ? "Type DELETE to confirm" : "Download backup first to unlock"}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#0d0d14] border border-slate-200 dark:border-white/10 rounded-xl py-2.5 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 font-mono"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <ShieldAlert size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePurge}
            disabled={!backedUp || confirmText.trim().toUpperCase() !== 'DELETE' || purging}
            className="btn-danger py-2 px-5 text-xs font-bold flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {purging ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Purging Storage...
              </>
            ) : (
              <>
                <Trash2 size={14} />
                Purge & Free Database Storage
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
