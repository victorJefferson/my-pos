import { useState, useMemo } from 'react'
import { Search, X, Check, Loader2 } from 'lucide-react'

export default function TeachScannerModal({ isOpen, onClose, allProducts, onTeach, currentFrame }) {
  const [search, setSearch] = useState('')
  const [teaching, setTeaching] = useState(false)

  const displayedProducts = useMemo(() => {
    if (!search.trim()) return allProducts.slice(0, 20) // Show a few by default
    const q = search.toLowerCase()
    return allProducts.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
  }, [search, allProducts])

  if (!isOpen) return null

  const handleTeach = async (product) => {
    setTeaching(true)
    try {
      await onTeach(product)
      onClose()
    } catch (e) {
      console.error(e)
      alert("Failed to teach product.")
    } finally {
      setTeaching(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#1a1a24] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Teach Scanner</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <p className="text-sm text-slate-500 dark:text-white/60 mb-4">
            Search and select the correct product for this item.
          </p>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              autoFocus
              type="text"
              className="w-full bg-slate-50 dark:bg-[#0a0a14] border border-slate-200 dark:border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Search product to map..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            {displayedProducts.length === 0 ? (
              <p className="text-sm text-center text-slate-400 py-4">No products found.</p>
            ) : (
              displayedProducts.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleTeach(p)}
                  disabled={teaching}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 text-left transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{p.name}</p>
                    <p className="text-xs text-slate-500 dark:text-white/40">{p.category}</p>
                  </div>
                  {teaching ? <Loader2 className="animate-spin text-slate-400" size={16} /> : <Check size={16} className="text-slate-400" />}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
