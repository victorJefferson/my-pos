import { useState, useEffect } from 'react'
import {
  TrendingUp, DollarSign, ShoppingBag, Receipt, BarChart3,
  RefreshCw, Banknote, Smartphone, CreditCard, Calendar, Wallet, Download,
  ChevronDown, ChevronUp, Database, Search
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'
import { analyticsApi } from '../services/api'
import StatCard from '../components/StatCard'
import ExportReportModal from '../components/ExportReportModal'
import PurgeDataModal from '../components/PurgeDataModal'
import { getCategoryEmoji } from '../utils/categoryUtils'
import Skeleton from '../components/Skeleton'
import DateRangeSelector from '../components/DateRangeSelector'
import { useOffline } from '../context/OfflineContext'

const INR = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const PAYMENT_COLORS = {
  CASH: '#10b981',
  UPI: '#3b82f6',
  CARD: '#8b5cf6',
}

const EXPENSE_COLORS = ['#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#64748b']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const data = payload[0].payload;
  
  return (
    <div className="bg-white dark:bg-[#1a1a2e] border border-slate-200 dark:border-white/10 p-3 rounded-xl shadow-lg text-xs min-w-[140px]">
      <p className="text-slate-500 dark:text-white/60 mb-2 font-medium border-b border-slate-100 dark:border-white/10 pb-1">{label}</p>
      <div className="space-y-1">
        <p className="text-[#7c3aed] font-semibold flex justify-between">
          <span>Revenue:</span> <span>{INR(data.revenue)}</span>
        </p>
        <p className="text-slate-500 dark:text-slate-400 font-semibold flex justify-between">
          <span>COGS:</span> <span>-{INR(data.cost)}</span>
        </p>
        <p className="text-[#f59e0b] font-semibold flex justify-between">
          <span>Expenses:</span> <span>-{INR(data.expenses)}</span>
        </p>
      </div>
      <div className="my-2 border-t border-slate-100 dark:border-white/10" />
      <p className="text-[#10b981] font-bold flex justify-between">
        <span>Net Profit:</span> <span>{INR(data.profit)}</span>
      </p>
    </div>
  )
}

export default function AnalyticsPage() {
  const { hasPending, online, enabled: offlineEnabled } = useOffline()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dateFilter, setDateFilter] = useState({ mode: 'today', start: null, end: null })
  const [chartMode, setChartMode] = useState('daily')  // 'daily' | 'monthly'
  const [showExportModal, setShowExportModal] = useState(false)
  const [showPurgeModal, setShowPurgeModal] = useState(false)
  const [sortConfig, setSortConfig] = useState({ key: 'total_quantity', direction: 'desc' })
  const [searchQuery, setSearchQuery] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      if (offlineEnabled && !online) {
        setData(null)
        return
      }
      const sDate = dateFilter.mode === 'today' ? null : dateFilter.start || null
      const eDate = dateFilter.mode === 'today' ? null : dateFilter.end || null
      const r = await analyticsApi.summary(sDate, eDate)
      setData(r.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [dateFilter])



  const today = data?.today
  const pb = data?.payment_breakdown
  const catExpenses = data?.category_expenses || []
  const chartData = chartMode === 'daily' ? data?.daily_chart : data?.monthly_chart
  const dateSoldItems = data?.date_sold_items || []

  const filteredSoldItems = dateSoldItems.filter(item =>
    item.product_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const sortedDateSoldItems = [...filteredSoldItems].sort((a, b) => {
    let valA = a[sortConfig.key]
    let valB = b[sortConfig.key]

    if (['total_revenue', 'total_quantity'].includes(sortConfig.key)) {
      valA = Number(valA)
      valB = Number(valB)
    }

    // Calculate dynamic average rate for sorting if the key is 'avg_rate'
    if (sortConfig.key === 'avg_rate') {
      valA = a.total_quantity > 0 ? (Number(a.total_revenue) / a.total_quantity) : 0
      valB = b.total_quantity > 0 ? (Number(b.total_revenue) / b.total_quantity) : 0
    }

    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  const toggleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }))
  }

  const SortIcon = ({ field }) => {
    if (sortConfig.key !== field) return null
    return sortConfig.direction === 'asc'
      ? <ChevronUp size={14} className="inline ml-1 text-brand-500" />
      : <ChevronDown size={14} className="inline ml-1 text-brand-500" />
  }

  const pieData = pb ? [
    { name: 'Cash', value: parseFloat(pb.cash), color: PAYMENT_COLORS.CASH, count: pb.cash_count },
    { name: 'UPI', value: parseFloat(pb.upi), color: PAYMENT_COLORS.UPI, count: pb.upi_count },
    { name: 'Card', value: parseFloat(pb.card), color: PAYMENT_COLORS.CARD, count: pb.card_count },
  ].filter(d => d.value > 0) : []

  return (
    <div className="flex flex-col px-6 py-5 gap-6 pb-10 bg-slate-50 dark:bg-[#0d0d14] transition-colors duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 dark:text-white font-bold text-lg flex items-center gap-2">
            <BarChart3 size={20} className="text-brand-600 dark:text-brand-400" />
            Analytics & Financials
          </h1>
          <p className="text-slate-500 dark:text-white/40 text-xs mt-0.5">
            Revenue, Operating Expenses & True Net Profit
            {offlineEnabled && hasPending && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">· Includes unsynced data locally until sync finishes</span>
            )}
            {offlineEnabled && !online && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">· Offline — reconnect for live server analytics</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeSelector
            loading={loading}
            onFilterChange={(newFilter) => setDateFilter(newFilter)}
          />
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
          <button
            onClick={() => setShowPurgeModal(true)}
            className="px-3 py-2 text-sm font-semibold rounded-xl bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 transition-all flex items-center gap-1.5"
            title="Purge transaction history to free database storage"
          >
            <Database size={14} />
            Cleanup DB
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading && !data ? (
          <>
            <Skeleton className="h-[104px] w-full rounded-2xl" />
            <Skeleton className="h-[104px] w-full rounded-2xl" />
            <Skeleton className="h-[104px] w-full rounded-2xl" />
            <Skeleton className="h-[104px] w-full rounded-2xl" />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Charts & Split Cards */}
      <div className="grid grid-cols-3 gap-5">
        {/* Payment & Expense Split */}
        <div className="glass-card p-5 col-span-1 flex flex-col gap-4 min-h-[300px]">
          {loading && !data ? (
            <>
              <div>
                <Skeleton className="h-5 w-24 mb-3 rounded" />
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full rounded" />
                  <Skeleton className="h-4 w-5/6 rounded" />
                  <Skeleton className="h-4 w-4/6 rounded" />
                </div>
              </div>
              <hr className="border-slate-200 dark:border-white/5 my-1" />
              <div>
                <Skeleton className="h-5 w-48 mb-3 rounded" />
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full rounded" />
                  <Skeleton className="h-4 w-11/12 rounded" />
                  <Skeleton className="h-4 w-4/5 rounded" />
                  <Skeleton className="h-4 w-full rounded" />
                </div>
              </div>
            </>
          ) : (
            <>
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
                <h3 className="text-slate-900 dark:text-white font-semibold text-sm mb-3">
                  Expense Breakdown
                </h3>
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
            </>
          )}
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
          {loading && !data ? (
            <Skeleton className="h-[230px] w-full mt-8 rounded-xl" />
          ) : (!chartData || chartData.length === 0) ? (
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

      {/* Selected Date Sold Items */}
      <div className="glass-card p-5 mt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h3 className="text-slate-900 dark:text-white font-semibold text-sm flex items-center gap-2">
            <ShoppingBag size={16} className="text-brand-600 dark:text-brand-400" />
            Items Sold
          </h3>
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400 dark:text-white/30" />
            </div>
            <input
              type="text"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-[#0d0d14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            />
          </div>
        </div>

        {loading && !data ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex justify-between py-2 border-b border-slate-100 dark:border-white/5">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-4 w-12 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
              </div>
            ))}
          </div>
        ) : dateSoldItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400 dark:text-white/25 gap-2">
            <ShoppingBag size={28} className="opacity-30" />
            <p className="text-xs">No items sold on this date</p>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="sticky top-0 z-10 bg-white dark:bg-[#0d0d14]">
                <tr className="text-slate-500 dark:text-white/40 text-xs border-b border-slate-200 dark:border-white/5">
                  <th className="py-3 pr-4 font-medium cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => toggleSort('product_name')}>
                    Product Name <SortIcon field="product_name" />
                  </th>
                  <th className="py-3 pr-4 font-medium cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => toggleSort('category')}>
                    Category <SortIcon field="category" />
                  </th>
                  <th className="py-3 pr-4 font-medium text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => toggleSort('total_quantity')}>
                    Quantity Sold <SortIcon field="total_quantity" />
                  </th>
                  <th className="py-3 pr-4 font-medium text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => toggleSort('avg_rate')}>
                    Avg Rate <SortIcon field="avg_rate" />
                  </th>
                  <th className="py-3 font-medium text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => toggleSort('total_revenue')}>
                    Revenue <SortIcon field="total_revenue" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-sm">
                {sortedDateSoldItems.map((item) => {
                  const avgRate = item.total_quantity > 0 ? (item.total_revenue / item.total_quantity) : 0
                  return (
                    <tr key={item.product_id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 pr-4 text-slate-900 dark:text-white font-medium flex items-center gap-2">
                        <span className="text-base">{getCategoryEmoji(item.category, item.product_name)}</span>
                        {item.product_name}
                      </td>
                      <td className="py-3 pr-4 text-slate-500 dark:text-white/50">{item.category}</td>
                      <td className="py-3 pr-4 text-right font-bold text-slate-900 dark:text-white">{item.total_quantity}</td>
                      <td className="py-3 pr-4 text-right text-slate-500 dark:text-white/60">{INR(avgRate)}</td>
                      <td className="py-3 text-right font-medium text-brand-600 dark:text-brand-400">{INR(item.total_revenue)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showExportModal && (
        <ExportReportModal onClose={() => setShowExportModal(false)} />
      )}
      {showPurgeModal && (
        <PurgeDataModal
          onClose={() => setShowPurgeModal(false)}
          onPurgeSuccess={load}
        />
      )}
    </div>
  )
}
