import { NavLink } from 'react-router-dom'
import { ShoppingCart, History, Receipt } from 'lucide-react'

export default function MobileNavbar() {
  const tabs = [
    { to: '/', icon: ShoppingCart, label: 'POS' },
    { to: '/transactions', icon: History, label: 'History' },
    { to: '/expenses', icon: Receipt, label: 'Expenses' },
  ]

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-[60px] bg-white/90 dark:bg-[#111122]/90 backdrop-blur-md border-t border-slate-200 dark:border-white/10 flex items-center justify-around z-40 pb-safe">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
              isActive
                ? 'text-brand-600 dark:text-brand-400'
                : 'text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white'
            }`
          }
        >
          <tab.icon size={20} strokeWidth={2.5} />
          <span className="text-[10px] font-bold tracking-wide">{tab.label}</span>
        </NavLink>
      ))}
    </div>
  )
}
