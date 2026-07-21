import { useState, useEffect } from 'react'
import {
  TrendingUp, DollarSign, ShoppingBag, Receipt, BarChart3,
  Loader2, RefreshCw, Banknote, Smartphone, CreditCard, Calendar, Wallet, Download,
  Flame, AlertTriangle, AlertCircle
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import { analyticsApi } from '../services/api'
import StatCard from '../components/StatCard'
import ExportReportModal from '../components/ExportReportModal'
import { getCategoryEmoji } from '../utils/categoryUtils'

const INR = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const PAYMENT_COLORS = {
  CASH: '#10b981',
  UPI: '#3b82f6',
  CARD: '#8b5cf6',
}

const EXPENSE_COLORS = ['#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#64748b']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-[#1a1a2e] border border-slate-200 dark:border-white/10 p-3 rounded-xl shadow-lg text-xs">
      <p className="text-slate-500 dark:text-white/60 mb-2 font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {INR(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [targetDate, setTargetDate] = useState('')
  const [chartMode, setChartMode] = useState('daily')  // 'daily' | 'monthly'
  const [showExportModal, setShowExportModal] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await analyticsApi.summary(targetDate || null)
      setData(r.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [targetDate])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 dark:text-white/30 gap-2">
        <Loader2 className="animate-spin text-brand-600 dark:text-brand-400" size={24} />
        <span>Loading analytics...</span>
      </div>
    )
  }

  const today = data?.today
  const pb = data?.payment_breakdown
  const catExpenses = data?.category_expenses || []
  const chartData = chartMode === 'daily' ? data?.daily_chart : data?.monthly_chart

  const pieData = pb ? [
    { name: 'Cash', value: parseFloat(pb.cash), color: PAYMENT_COLORS.CASH, count: pb.cash_count },
    { name: 'UPI', value: parseFloat(pb.upi), color: PAYMENT_COLORS.UPI, count: pb.upi_count },
    { name: 'Card', value: parseFloat(pb.card), color: PAYMENT_COLORS.CARD, count: pb.card_count },
  ].filter(d => d.value > 0) : []

  return (
    <div className="flex flex-col h-screen overflow-auto px-6 py-5 gap-6 bg-slate-50 dark:bg-[#0d0d14] transition-colors duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 dark:text-white font-bold text-lg flex items-center gap-2">
            <BarChart3 size={20} className="text-brand-600 dark:text-brand-400" />
            Analytics & Financials
          </h1>
          <p className="text-slate-500 dark:text-white/40 text-xs mt-0.5">Revenue, Operating Expenses & True Net Profit</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30" size={14} />
            <input
              type="date"
              className="input-field pl-8 text-sm py-2 w-40"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
          <button onClick={load} disabled={loading} className="btn-ghost flex items-center gap-2 text-sm" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            className="btn-glow flex items-center gap-2 text-sm"
          >
            <Download size={14} />
            Export Report
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Gross Revenue"
          value={today ? INR(today.gross_revenue) : '—'}
          sub={`${today?.bill_count || 0} bills today`}
          icon={TrendingUp}
          color="brand"
        />
        <StatCard
          label="Net Profit"
          value={today ? INR(today.net_profit) : '—'}
          sub={today && today.gross_revenue > 0
            ? `${((today.net_profit / today.gross_revenue) * 100).toFixed(1)}% margin`
            : 'After COGS & Expenses'}
          icon={DollarSign}
          color="green"
        />
        <StatCard
          label="Total COGS"
          value={today ? INR(today.total_cogs) : '—'}
          sub="Cost of goods sold"
          icon={ShoppingBag}
          color="blue"
        />
        <StatCard
          label="Operating Expenses"
          value={today ? INR(today.total_expenses) : '—'}
          sub="Store transport, bills, etc."
          icon={Wallet}
          color="amber"
        />
      </div>

      {/* Charts & Split Cards */}
      <div className="grid grid-cols-3 gap-5">
        {/* Payment & Expense Split */}
        <div className="glass-card p-5 col-span-1 flex flex-col gap-4">
          <div>
            <h3 className="text-slate-900 dark:text-white font-semibold text-sm mb-3">Payment Split</h3>
            {pieData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 text-slate-400 dark:text-white/25 gap-1">
                <span className="text-2xl">💳</span>
                <p className="text-xs">No sales recorded</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pieData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                      <span className="text-slate-600 dark:text-white/60 font-medium">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-900 dark:text-white font-bold">{INR(item.value)}</span>
                      <span className="text-slate-400 dark:text-white/30 ml-1">({item.count})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr className="border-slate-200 dark:border-white/5 my-1" />

          {/* Expense Categories */}
          <div>
            <h3 className="text-slate-900 dark:text-white font-semibold text-sm mb-3">Expense Breakdown (Last 30 Days)</h3>
            {catExpenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-slate-400 dark:text-white/25 gap-1">
                <Receipt size={22} className="opacity-30" />
                <p className="text-xs">No expenses logged yet</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {catExpenses.map((cat, idx) => (
                  <div key={cat.category} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: EXPENSE_COLORS[idx % EXPENSE_COLORS.length] }} />
                      <span className="text-slate-600 dark:text-white/60 font-medium">{cat.category}</span>
                    </div>
                    <span className="text-slate-900 dark:text-white font-bold">{INR(cat.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Revenue vs Expenses vs Profit Chart */}
        <div className="glass-card p-5 col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-900 dark:text-white font-semibold text-sm">Income vs Expenses vs Profit</h3>
            <div className="flex gap-1">
              {['daily', 'monthly'].map((m) => (
                <button
                  key={m}
                  onClick={() => setChartMode(m)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${chartMode === m
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-white/5 dark:text-white/50 dark:hover:text-white'}`}
                >
                  {m === 'daily' ? '14 Days' : '6 Months'}
                </button>
              ))}
            </div>
          </div>
          {(!chartData || chartData.length === 0) ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-white/25 gap-2">
              <span className="text-3xl">📈</span>
              <p className="text-xs">No chart data available</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-white/5" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  className="text-slate-400 dark:text-white/30"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  className="text-slate-400 dark:text-white/30"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#7c3aed"
                  strokeWidth={2.5}
                  dot={{ fill: '#7c3aed', r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  name="Expenses"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={{ fill: '#f59e0b', r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  name="Net Profit"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ fill: '#10b981', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
          <div className="flex gap-4 mt-2 justify-end">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-white/50">
              <div className="w-3 h-0.5 bg-brand-600 dark:bg-brand-400 rounded" /> Revenue
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-white/50">
              <div className="w-3 h-0.5 bg-amber-500 rounded" /> Expenses
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-white/50">
              <div className="w-3 h-0.5 bg-emerald-500 dark:bg-emerald-400 rounded" /> Net Profit
            </div>
          </div>
        </div>
      </div>

      {/* Today's Payment Mode Cards */}
      {today && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Cash Sales', amount: today.cash_amount, icon: Banknote, color: 'green' },
            { label: 'UPI Sales', amount: today.upi_amount, icon: Smartphone, color: 'blue' },
            { label: 'Card Sales', amount: today.card_amount, icon: CreditCard, color: 'brand' },
          ].map(({ label, amount, icon, color }) => (
            <StatCard key={label} label={label} value={INR(amount)} icon={icon} color={color} />
          ))}
        </div>
      )}

      {/* ── 4 Key Business Intelligence Widgets ──────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* 1. Top Sold Items */}
        <div className="glass-card p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-white/5">
              <div className="w-7 h-7 rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
                <Flame size={15} className="text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <h3 className="text-slate-900 dark:text-white font-bold text-xs">Top Billed Items</h3>
                <p className="text-slate-400 dark:text-white/30 text-[10px]">By volume (Last 30d)</p>
              </div>
            </div>

            {(!data?.top_sold_items || data.top_sold_items.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-white/25 text-center">
                <span className="text-xl mb-1">🛒</span>
                <p className="text-xs">No items sold yet</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.top_sold_items.map((item, idx) => (
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
        <div className="glass-card p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-white/5">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <TrendingUp size={15} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-slate-900 dark:text-white font-bold text-xs">Top Profit Makers</h3>
                <p className="text-slate-400 dark:text-white/30 text-[10px]">Highest profit (Last 30d)</p>
              </div>
            </div>

            {(!data?.top_profit_items || data.top_profit_items.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-white/25 text-center">
                <span className="text-xl mb-1">💰</span>
                <p className="text-xs">No profit data yet</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.top_profit_items.map((item, idx) => (
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
        <div className="glass-card p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-white/5">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-slate-900 dark:text-white font-bold text-xs">Low Stock Alert</h3>
                <p className="text-slate-400 dark:text-white/30 text-[10px]">1 to 10 units remaining</p>
              </div>
            </div>

            {(!data?.low_stock_items || data.low_stock_items.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-white/25 text-center">
                <span className="text-xl mb-1">✅</span>
                <p className="text-xs">All items well stocked</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.low_stock_items.map((item) => (
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
        <div className="glass-card p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-white/5">
              <div className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                <AlertCircle size={15} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-slate-900 dark:text-white font-bold text-xs">Out of Stock Alert</h3>
                <p className="text-slate-400 dark:text-white/30 text-[10px]">0 units remaining</p>
              </div>
            </div>

            {(!data?.out_of_stock_items || data.out_of_stock_items.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-white/25 text-center">
                <span className="text-xl mb-1">🎉</span>
                <p className="text-xs">No out-of-stock products</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.out_of_stock_items.map((item) => (
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

      {/* Export Report Modal */}
      {showExportModal && (
        <ExportReportModal onClose={() => setShowExportModal(false)} />
      )}
    </div>
  )
}
