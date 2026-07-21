import { useState } from 'react'
import { Wallet, X, AlertCircle, Loader2 } from 'lucide-react'

const PAYMENT_MODES = [
  { mode: 'CASH', label: 'Cash', emoji: '💵' },
  { mode: 'UPI', label: 'UPI', emoji: '📱' },
  { mode: 'CARD', label: 'Card', emoji: '💳' },
]

export default function CreateAccountModal({ initialData = null, onSave, onClose }) {
  const [name, setName] = useState(initialData?.name || '')
  const [selectedModes, setSelectedModes] = useState(initialData?.payment_modes || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleMode = (mode) => {
    setSelectedModes(prev => 
      prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]
    )
    setError('')
  }

  const handleSave = async () => {
    if (!name.trim()) return setError('Please provide an account name')
    if (selectedModes.length === 0) return setError('Please select at least one linked payment mode')
    
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        payment_modes: selectedModes
      })
      onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to create account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="glass-card bg-white dark:bg-[#111122] p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
              <Wallet size={18} className="text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <h2 className="text-slate-900 dark:text-white font-bold text-base">{initialData ? 'Edit Account' : 'Create Account'}</h2>
              <p className="text-slate-500 dark:text-white/40 text-xs">{initialData ? 'Update wallet details' : 'Add a new wallet or bank account'}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white disabled:opacity-30"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-slate-600 dark:text-white/60 text-xs mb-1 block font-medium">Account Name *</label>
            <input
              type="text"
              autoFocus
              className="input-field text-sm"
              placeholder="e.g. Cash Box, Payzapp"
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
            />
          </div>

          <div>
            <label className="text-slate-600 dark:text-white/60 text-xs mb-1.5 block font-medium">
              Linked Payment Modes
              <span className="block text-[10px] font-normal text-slate-400 mt-0.5">Sales with these modes will automatically add to this account</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_MODES.map(({ mode, label, emoji }) => {
                const isSelected = selectedModes.includes(mode)
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => toggleMode(mode)}
                    className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-brand-50 border-brand-300 ring-2 ring-brand-500/40 text-brand-700 dark:bg-brand-900/30 dark:border-brand-500/40 dark:text-brand-400'
                        : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-white/5 dark:border-white/10 dark:text-white/50'
                    }`}
                  >
                    <span className="text-lg">{emoji}</span>
                    <span className="text-xs font-bold">{label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {error && (
          <p className="text-red-500 dark:text-red-400 text-xs mt-3 flex items-center gap-1">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} disabled={saving} className="btn-ghost flex-1 text-sm disabled:opacity-30">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-glow flex-1 text-sm">
            {saving ? <Loader2 className="animate-spin mx-auto" size={16} /> : (initialData ? 'Save Changes' : 'Create Account')}
          </button>
        </div>
      </div>
    </div>
  )
}
