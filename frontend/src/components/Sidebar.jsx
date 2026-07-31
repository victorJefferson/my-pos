import { useState, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ShoppingCart,
  Package,
  Receipt,
  BarChart3,
  Sparkles,
  Store,
  ChevronRight,
  Sun,
  Moon,
  ChevronDown,
  Plus,
  Check,
  X,
  Loader2,
  History,
  MessageSquare,
  Trash2,
  ChevronsUpDown,
} from 'lucide-react'
import { UserButton, useUser } from '@clerk/clerk-react'
import { useTheme } from '../context/ThemeContext'
import { useAiChat } from '../context/AiChatContext'
import { authApi } from '../services/api'

const navItems = [
  { to: '/', icon: ShoppingCart, label: 'POS Billing', exact: true },
  { to: '/transactions', icon: History, label: 'Transactions' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/ai', icon: Sparkles, label: 'AI Insights' },
]

function CreateStoreModal({ onSave, onClose }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return
    if (!name.trim()) return setError('Please enter a store name')
    setSaving(true)
    try {
      await onSave(name.trim())
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create store')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay z-50" onClick={() => !saving && onClose()}>
      <div className="glass-card bg-white dark:bg-[#111122] p-6 w-full max-w-sm animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Store size={18} className="text-brand-600 dark:text-brand-400" />
            <h3 className="text-slate-900 dark:text-white font-bold text-sm">Create New Store</h3>
          </div>
          <button onClick={onClose} disabled={saving} className="text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white disabled:opacity-30"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">Store Name *</label>
            <input
              type="text"
              autoFocus
              disabled={saving}
              className="input-field text-sm font-semibold disabled:opacity-50"
              placeholder="e.g. Metro Mart"
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
            />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={saving} className="btn-ghost flex-1 text-xs disabled:opacity-30">Cancel</button>
            <button type="submit" disabled={saving} className="btn-glow flex-1 text-xs font-bold flex items-center justify-center gap-1">
              {saving ? <Loader2 className="animate-spin" size={14} /> : 'Create Store'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const { user } = useUser()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [stores, setStores] = useState([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const {
    threads,
    threadId,
    threadsLoading,
    chatExpanded,
    setChatExpanded,
    selectThread,
    newChat,
    removeThread,
    canCreateNewChat,
    newChatBusy,
  } = useAiChat()

  const activeTenantId = localStorage.getItem('rc_tenant_id') || ''
  const storeName = localStorage.getItem('rc_store_name') || 'My Store'
  const onAiPage = location.pathname === '/ai'

  // Expand on AI Insights; collapse when leaving
  useEffect(() => {
    setChatExpanded(onAiPage)
  }, [onAiPage, setChatExpanded])

  useEffect(() => {
    authApi.listStores()
      .then((r) => setStores(r.data))
      .catch(console.error)
  }, [])

  const handleSwitchStore = (st) => {
    localStorage.setItem('rc_tenant_id', st.tenant_id)
    localStorage.setItem('rc_store_name', st.store_name)
    setDropdownOpen(false)
    window.location.reload()
  }

  const handleCreateStore = async (newStoreName) => {
    const { data } = await authApi.createStore({ store_name: newStoreName })
    localStorage.setItem('rc_tenant_id', data.tenant_id)
    localStorage.setItem('rc_store_name', data.store_name)
    window.location.reload()
  }

  const openChatHistory = () => {
    setChatExpanded(true)
    if (!onAiPage) navigate('/ai')
  }

  const collapseChatHistory = () => {
    setChatExpanded(false)
  }

  const handleNavClick = () => {
    collapseChatHistory()
  }

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-white dark:bg-[#0a0a14] border-r border-slate-200 dark:border-white/5 shrink-0 transition-colors duration-200">
      {/* Brand & Store Switcher */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-white/5 relative shrink-0">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2.5 p-1.5 -ml-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all text-left group flex-1 min-w-0"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md shadow-brand-500/20 shrink-0">
              <Store className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="font-bold text-slate-900 dark:text-white text-xs truncate max-w-[105px]" title={storeName}>
                  {storeName}
                </p>
                <ChevronDown size={13} className="text-slate-400 dark:text-white/40 shrink-0 group-hover:text-slate-700 dark:group-hover:text-white" />
              </div>
              <p className="text-slate-500 dark:text-white/40 text-[10px]">POS System</p>
            </div>
          </button>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-white/40 dark:hover:text-white dark:hover:bg-white/5 border border-slate-200 dark:border-white/10 transition-all active:scale-95 shrink-0 ml-1"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? (
              <Sun size={16} className="text-amber-400" />
            ) : (
              <Moon size={16} className="text-slate-600" />
            )}
          </button>
        </div>

        {dropdownOpen && (
          <div className="absolute left-4 right-4 top-16 z-50 bg-white dark:bg-[#151528] border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl p-2 animate-scale-in">
            <p className="text-[10px] font-semibold text-slate-400 dark:text-white/30 px-2 py-1 uppercase tracking-wider">
              Switch Store ({stores.length})
            </p>
            <div className="max-h-40 overflow-y-auto space-y-1 my-1">
              {stores.map((st) => {
                const isActive = st.tenant_id === activeTenantId
                return (
                  <button
                    key={st.tenant_id}
                    onClick={() => handleSwitchStore(st)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-300'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="truncate max-w-[130px]">{st.store_name}</span>
                    {isActive && <Check size={13} className="text-brand-600 dark:text-brand-400 shrink-0" />}
                  </button>
                )
              })}
            </div>
            <div className="pt-1 border-t border-slate-100 dark:border-white/5">
              <button
                onClick={() => { setDropdownOpen(false); setShowCreateModal(true) }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-600/20 transition-all"
              >
                <Plus size={14} /> Add New Store
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Expanded: contracted nav icons at top */}
      {chatExpanded ? (
        <div className="px-3 py-2 border-b border-slate-200 dark:border-white/5 shrink-0">
          <div className="flex items-center justify-between gap-1">
            {navItems.map(({ to, icon: Icon, label, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                title={label}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  `flex items-center justify-center w-9 h-9 rounded-xl transition-all border ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-600/20 dark:text-brand-300 dark:border-brand-500/30'
                      : 'text-slate-400 border-transparent hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-white/70'
                  }`
                }
              >
                <Icon size={16} />
              </NavLink>
            ))}
          </div>
        </div>
      ) : (
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1 min-h-0 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              onClick={handleNavClick}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group border
                ${isActive
                  ? 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-600/20 dark:text-brand-300 dark:border-brand-500/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 border-transparent dark:text-white/50 dark:hover:text-white dark:hover:bg-white/5'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-4.5 h-4.5 ${
                      isActive
                        ? 'text-brand-600 dark:text-brand-400'
                        : 'text-slate-400 group-hover:text-slate-600 dark:text-white/40 dark:group-hover:text-white/70'
                    }`}
                    size={18}
                  />
                  <span className="flex-1">{label}</span>
                  {isActive && <ChevronRight size={14} className="text-brand-600 dark:text-brand-400" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      )}

      {/* Chat history: expanded fills middle; collapsed sits above user */}
      {chatExpanded ? (
        <div className="flex-1 min-h-0 flex flex-col border-b border-slate-200 dark:border-white/5">
          <div className="px-3 py-2.5 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={collapseChatHistory}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white"
              title="Collapse chat history"
            >
              <MessageSquare size={14} className="text-brand-600 dark:text-brand-400" />
              Chat History
              <ChevronsUpDown size={12} className="opacity-50" />
            </button>
            <button
              type="button"
              onClick={newChat}
              disabled={!canCreateNewChat}
              className="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-600/15 dark:hover:text-brand-300 disabled:opacity-30 disabled:pointer-events-none disabled:hover:bg-transparent"
              title={
                !canCreateNewChat
                  ? (newChatBusy ? 'Creating…' : 'Send a message before starting another chat')
                  : 'New chat'
              }
            >
              {newChatBusy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
            {threadsLoading && (
              <div className="flex justify-center py-6">
                <Loader2 size={16} className="animate-spin text-slate-400" />
              </div>
            )}
            {!threadsLoading && threads.length === 0 && (
              <p className="text-[11px] text-slate-400 dark:text-white/30 text-center py-4 px-2">
                No chats yet. Start one from AI Insights.
              </p>
            )}
            {!threadsLoading && threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  selectThread(t.id)
                  if (!onAiPage) navigate('/ai')
                }}
                className={`w-full text-left group flex items-start gap-2 rounded-xl px-2.5 py-2 text-xs transition-colors ${
                  t.id === threadId
                    ? 'bg-brand-50 border border-brand-200 text-brand-900 dark:bg-brand-600/20 dark:border-brand-500/30 dark:text-white'
                    : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-white/60 border border-transparent'
                }`}
              >
                <MessageSquare size={12} className="mt-0.5 shrink-0 opacity-60" />
                <span className="flex-1 line-clamp-2 leading-snug">{t.title}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeThread(t.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation()
                      removeThread(t.id)
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-500"
                >
                  <Trash2 size={11} />
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-3 pb-2 shrink-0">
          <button
            type="button"
            onClick={openChatHistory}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 dark:text-white/50 dark:hover:text-white dark:hover:bg-white/5 transition-all border border-transparent"
          >
            <MessageSquare size={18} className="text-slate-400" />
            <span className="flex-1 text-left">Chat History</span>
            <ChevronRight size={14} className="text-slate-400" />
          </button>
        </div>
      )}

      {/* User footer */}
      <div className="px-4 py-4 border-t border-slate-200 dark:border-white/5 flex items-center gap-3 shrink-0">
        <UserButton
          appearance={{
            elements: {
              avatarBox: 'w-8 h-8 ring-2 ring-brand-500/30',
            },
          }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-slate-900 dark:text-white text-xs font-medium truncate">
            {user?.firstName || user?.username || 'Staff'}
          </p>
          <p className="text-slate-500 dark:text-white/30 text-[10px]">v1.0.0 · Multi-Store</p>
        </div>
      </div>

      {showCreateModal && (
        <CreateStoreModal
          onSave={handleCreateStore}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </aside>
  )
}
