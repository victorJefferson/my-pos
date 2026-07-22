import { useState } from 'react'
import { Calendar } from 'lucide-react'

export default function DateRangeSelector({ onFilterChange, loading }) {
  const [mode, setMode] = useState('today') // 'today' | 'custom'
  const todayStr = new Date().toISOString().split('T')[0]
  const [start, setStart] = useState(todayStr)
  const [end, setEnd] = useState(todayStr)

  const handleToday = () => {
    setMode('today')
    onFilterChange({ mode: 'today', start: null, end: null })
  }

  const handleCustomMode = () => {
    setMode('custom')
  }

  const handleGo = () => {
    if (!start || !end) {
      alert("Please select both start and end dates.")
      return
    }
    if (start > end) {
      alert("End date cannot be before start date.")
      return
    }
    onFilterChange({ mode: 'custom', start, end })
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center bg-slate-200/50 dark:bg-white/5 p-1 rounded-lg">
        <button
          onClick={handleToday}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            mode === 'today'
              ? 'bg-white shadow-sm dark:bg-white/10 text-slate-900 dark:text-white'
              : 'text-slate-500 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/60'
          }`}
        >
          Today
        </button>
        <button
          onClick={handleCustomMode}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            mode === 'custom'
              ? 'bg-white shadow-sm dark:bg-white/10 text-slate-900 dark:text-white'
              : 'text-slate-500 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/60'
          }`}
        >
          Custom
        </button>
      </div>

      {mode === 'custom' && (
        <div className="flex items-center gap-1.5 bg-white dark:bg-white/5 p-1 rounded-lg border border-slate-200 dark:border-white/10 shadow-sm animate-fade-in">
          <div className="flex items-center px-2">
            <Calendar size={12} className="text-slate-400 dark:text-white/30 mr-1.5" />
            <input
              type="date"
              className="bg-transparent text-xs text-slate-700 dark:text-white outline-none w-[95px] cursor-pointer"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <span className="text-slate-300 dark:text-white/20 text-[10px] uppercase font-bold">To</span>
          <div className="flex items-center px-2">
            <Calendar size={12} className="text-slate-400 dark:text-white/30 mr-1.5" />
            <input
              type="date"
              className="bg-transparent text-xs text-slate-700 dark:text-white outline-none w-[95px] cursor-pointer"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <button
            onClick={handleGo}
            disabled={loading}
            className="ml-1 bg-brand-600 hover:bg-brand-500 text-white rounded-md px-3 py-1.5 text-xs font-bold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            Go
          </button>
        </div>
      )}
    </div>
  )
}
