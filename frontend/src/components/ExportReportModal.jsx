import { useState } from 'react'
import { Download, FileText, FileSpreadsheet, Calendar, X, Loader2, AlertCircle } from 'lucide-react'
import { analyticsApi } from '../services/api'

export default function ExportReportModal({ onClose }) {
  const todayStr = new Date().toISOString().split('T')[0]

  const getSevenDaysAgo = () => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return d.toISOString().split('T')[0]
  }

  const getThirtyDaysAgo = () => {
    const d = new Date()
    d.setDate(d.getDate() - 29)
    return d.toISOString().split('T')[0]
  }

  const [preset, setPreset] = useState('7days') // 'today' | '7days' | '30days' | 'custom'
  const [startDate, setStartDate] = useState(getSevenDaysAgo())
  const [endDate, setEndDate] = useState(todayStr)
  const [format, setFormat] = useState('pdf') // 'pdf' | 'excel'
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const handlePresetChange = (p) => {
    setPreset(p)
    if (p === 'today') {
      setStartDate(todayStr)
      setEndDate(todayStr)
    } else if (p === '7days') {
      setStartDate(getSevenDaysAgo())
      setEndDate(todayStr)
    } else if (p === '30days') {
      setStartDate(getThirtyDaysAgo())
      setEndDate(todayStr)
    }
  }

  // ── Download Excel (.csv format formatted for Excel) ─────────────────────
  const downloadExcel = (data) => {
    let csv = `RELAX CORNER POS — FINANCIAL & SALES REPORT\n`
    csv += `Store Name,${data.store_name}\n`
    csv += `Report Period,${data.start_date} to ${data.end_date}\n`
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
    link.setAttribute('download', `RelaxCorner_FinancialReport_${data.start_date}_to_${data.end_date}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ── Print / Save PDF using embedded hidden iframe (Bypasses Browser Popup Blockers!) ──
  const generatePDFPrint = (data) => {
    let iframe = document.getElementById('pdf-report-frame')
    if (!iframe) {
      iframe = document.createElement('iframe')
      iframe.id = 'pdf-report-frame'
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      document.body.appendChild(iframe)
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Financial Report — ${data.store_name} (${data.start_date} to ${data.end_date})</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; padding: 40px; margin: 0; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #7c3aed; padding-bottom: 16px; margin-bottom: 24px; }
          .logo { font-size: 24px; font-weight: 800; color: #7c3aed; }
          .sub { font-size: 12px; color: #64748b; margin-top: 4px; }
          .meta { text-align: right; font-size: 12px; color: #475569; }
          .section-title { font-size: 14px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 24px; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
          .card-lbl { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; }
          .card-val { font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
          th { background: #f1f5f9; text-align: left; padding: 8px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; }
          td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #334155; }
          .text-right { text-align: right; }
          .font-bold { font-weight: 700; }
          .text-green { color: #16a34a; }
          .text-red { color: #dc2626; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; }
          @media print {
            body { padding: 0; }
            @page { margin: 1.5cm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo">🏪 ${data.store_name}</div>
            <div class="sub">Financial & Operating Profit Analysis Report</div>
          </div>
          <div class="meta">
            <div><strong>Report Period:</strong> ${data.start_date} to ${data.end_date}</div>
            <div><strong>Generated:</strong> ${data.generated_at}</div>
          </div>
        </div>

        <div class="section-title">Executive Financial Summary</div>
        <div class="grid">
          <div class="card">
            <div class="card-lbl">Gross Revenue</div>
            <div class="card-val">₹${Number(data.gross_revenue).toLocaleString('en-IN')}</div>
          </div>
          <div class="card">
            <div class="card-lbl">Operating Expenses</div>
            <div class="card-val">₹${Number(data.total_expenses).toLocaleString('en-IN')}</div>
          </div>
          <div class="card">
            <div class="card-lbl">Net Profit</div>
            <div class="card-val ${data.net_profit >= 0 ? 'text-green' : 'text-red'}">
              ₹${Number(data.net_profit).toLocaleString('en-IN')}
            </div>
          </div>
          <div class="card">
            <div class="card-lbl">Total Checkout Bills</div>
            <div class="card-val">${data.total_bills} bills</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div>
            <div class="section-title">Payment Method Split</div>
            <table>
              <thead>
                <tr><th>Method</th><th class="text-right">Bills</th><th class="text-right">Total (₹)</th></tr>
              </thead>
              <tbody>
                <tr><td>Cash 💵</td><td class="text-right">${data.payment_breakdown.cash_count}</td><td class="text-right font-bold">₹${Number(data.payment_breakdown.cash).toLocaleString('en-IN')}</td></tr>
                <tr><td>UPI 📱</td><td class="text-right">${data.payment_breakdown.upi_count}</td><td class="text-right font-bold">₹${Number(data.payment_breakdown.upi).toLocaleString('en-IN')}</td></tr>
                <tr><td>Card 💳</td><td class="text-right">${data.payment_breakdown.card_count}</td><td class="text-right font-bold">₹${Number(data.payment_breakdown.card).toLocaleString('en-IN')}</td></tr>
              </tbody>
            </table>
          </div>

          <div>
            <div class="section-title">Operating Expense Breakdown</div>
            <table>
              <thead>
                <tr><th>Category</th><th class="text-right">Total Spent (₹)</th></tr>
              </thead>
              <tbody>
                ${data.category_expenses.length === 0
                  ? '<tr><td colspan="2" style="text-align:center; color:#94a3b8;">No expenses recorded</td></tr>'
                  : data.category_expenses.map(c => `<tr><td>${c.category}</td><td class="text-right font-bold">₹${Number(c.amount).toLocaleString('en-IN')}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="section-title">Daily Financial & Transaction Log</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th class="text-right">Bills</th>
              <th class="text-right">Revenue (₹)</th>
              <th class="text-right">COGS (₹)</th>
              <th class="text-right">Expenses (₹)</th>
              <th class="text-right">Net Profit (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${data.daily_rows.map(r => `
              <tr>
                <td>${r.date}</td>
                <td class="text-right">${r.bill_count}</td>
                <td class="text-right">₹${Number(r.gross_revenue).toLocaleString('en-IN')}</td>
                <td class="text-right">₹${Number(r.total_cogs).toLocaleString('en-IN')}</td>
                <td class="text-right">₹${Number(r.total_expenses).toLocaleString('en-IN')}</td>
                <td class="text-right font-bold ${r.net_profit >= 0 ? 'text-green' : 'text-red'}">₹${Number(r.net_profit).toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          Confidential · Generated by Relax Corner Multi-Tenant Retail POS System
        </div>
      </body>
      </html>
    `

    const doc = iframe.contentWindow.document
    doc.open()
    doc.write(html)
    doc.close()

    setTimeout(() => {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
    }, 250)
  }

  // ── Handle Export ──────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (exporting) return
    if (!startDate || !endDate) {
      return setError('Please select valid start and end dates')
    }
    if (new Date(startDate) > new Date(endDate)) {
      return setError('Start date cannot be after end date')
    }

    setExporting(true)
    setError('')
    try {
      const { data } = await analyticsApi.report(startDate, endDate)
      if (format === 'excel') {
        downloadExcel(data)
      } else {
        generatePDFPrint(data)
      }
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to generate financial report')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !exporting && onClose()}>
      <div className="glass-card bg-white dark:bg-[#111122] p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
              <Download className="text-brand-600 dark:text-brand-400" size={18} />
            </div>
            <div>
              <h2 className="text-slate-900 dark:text-white font-bold text-base">Export Financial Report</h2>
              <p className="text-slate-500 dark:text-white/40 text-xs">Generate PDF or Excel statement</p>
            </div>
          </div>
          <button onClick={onClose} disabled={exporting} className="text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white disabled:opacity-30"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          {/* Time Range Presets */}
          <div>
            <label className="text-slate-600 dark:text-white/60 text-xs mb-1.5 block font-medium">Select Time Period *</label>
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {[
                { id: 'today', label: 'Today' },
                { id: '7days', label: '7 Days' },
                { id: '30days', label: '30 Days' },
                { id: 'custom', label: 'Custom' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handlePresetChange(id)}
                  className={`text-xs py-2 rounded-xl border transition-all text-center font-medium ${
                    preset === id
                      ? 'bg-brand-600 text-white border-brand-500 shadow-sm'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:bg-white/5 dark:text-white/60 dark:border-white/10 dark:hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range Picker */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">Start Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30" size={14} />
                <input
                  type="date"
                  className="input-field pl-8 text-xs py-2"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPreset('custom') }}
                />
              </div>
            </div>
            <div>
              <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">End Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30" size={14} />
                <input
                  type="date"
                  className="input-field pl-8 text-xs py-2"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPreset('custom') }}
                />
              </div>
            </div>
          </div>

          {/* Format Selector */}
          <div>
            <label className="text-slate-600 dark:text-white/60 text-xs mb-1.5 block font-medium">Report Format *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${
                  format === 'pdf'
                    ? 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-500/40 ring-2 ring-purple-500/30'
                    : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-white/5 dark:border-white/10 dark:text-white/50'
                }`}
              >
                <FileText size={18} className="text-purple-600 dark:text-purple-400" />
                <div className="text-left">
                  <p className="text-xs font-bold">PDF Report</p>
                  <p className="text-[10px] opacity-75">Printable / Save PDF</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('excel')}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${
                  format === 'excel'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-500/40 ring-2 ring-emerald-500/30'
                    : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-white/5 dark:border-white/10 dark:text-white/50'
                }`}
              >
                <FileSpreadsheet size={18} className="text-emerald-600 dark:text-emerald-400" />
                <div className="text-left">
                  <p className="text-xs font-bold">Excel (.xlsx)</p>
                  <p className="text-[10px] opacity-75">Spreadsheet (.csv)</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-red-500 dark:text-red-400 text-xs mt-3 flex items-center gap-1">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} disabled={exporting} className="btn-ghost flex-1 text-sm disabled:opacity-30">Cancel</button>
          <button onClick={handleExport} disabled={exporting} className="btn-glow flex-1 text-sm flex items-center justify-center gap-2">
            {exporting ? <Loader2 className="animate-spin" size={16} /> : <><Download size={15} /> Download Report</>}
          </button>
        </div>
      </div>
    </div>
  )
}
