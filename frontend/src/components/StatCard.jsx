export default function StatCard({ label, value, sub, icon: Icon, color = 'brand', trend }) {
  const colorMap = {
    brand: 'from-brand-50 to-brand-100/50 border-brand-200 dark:from-brand-500/20 dark:to-brand-700/10 dark:border-brand-500/20',
    green: 'from-emerald-50 to-emerald-100/50 border-emerald-200 dark:from-emerald-500/20 dark:to-emerald-700/10 dark:border-emerald-500/20',
    amber: 'from-amber-50 to-amber-100/50 border-amber-200 dark:from-amber-500/20 dark:to-amber-700/10 dark:border-amber-500/20',
    red: 'from-red-50 to-red-100/50 border-red-200 dark:from-red-500/20 dark:to-red-700/10 dark:border-red-500/20',
    blue: 'from-blue-50 to-blue-100/50 border-blue-200 dark:from-blue-500/20 dark:to-blue-700/10 dark:border-blue-500/20',
  }

  const iconColor = {
    brand: 'text-brand-600 dark:text-brand-400',
    green: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    blue: 'text-blue-600 dark:text-blue-400',
  }

  return (
    <div className={`stat-card bg-gradient-to-br ${colorMap[color]} border`}>
      <div className="flex items-start justify-between">
        <p className="text-slate-500 dark:text-white/50 text-xs font-medium uppercase tracking-wider">{label}</p>
        {Icon && (
          <div className={`p-2 rounded-lg bg-slate-100 dark:bg-white/5 ${iconColor[color]}`}>
            <Icon size={16} />
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
      {sub && <p className="text-slate-500 dark:text-white/40 text-xs mt-0.5">{sub}</p>}
      {trend !== undefined && (
        <p className={`text-xs font-medium mt-1 ${trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs yesterday
        </p>
      )}
    </div>
  )
}
