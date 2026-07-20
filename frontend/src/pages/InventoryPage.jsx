import { useState, useEffect, useCallback } from 'react'
import {
  Package, Plus, Edit2, Trash2, Search, AlertTriangle,
  X, Loader2, RefreshCw, ChevronDown, ChevronUp, Upload, FileSpreadsheet, RotateCcw
} from 'lucide-react'
import { productsApi } from '../services/api'
import LowStockBadge from '../components/LowStockBadge'
import CSVImportModal from '../components/CSVImportModal'

const EMPTY_FORM = {
  category: '', name: '', selling_price: '', cost_price: '', stock_quantity: 0, is_active: true,
}

function ResetConfirmationModal({ productCount, onConfirm, onClose, loading }) {
  const [confirmInput, setConfirmInput] = useState('')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-card bg-white dark:bg-[#111122] p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="text-red-500" size={20} />
          </div>
          <div>
            <h3 className="text-slate-900 dark:text-white font-bold text-base">Reset Store Inventory & Sales?</h3>
            <p className="text-slate-500 dark:text-white/50 text-xs mt-0.5 leading-relaxed">
              This will permanently delete all <span className="font-bold text-slate-900 dark:text-white">{productCount} products</span> from your store catalog.
            </p>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-500/30 rounded-xl p-3.5 mb-4 text-xs text-red-700 dark:text-red-300 space-y-1">
          <p className="font-bold flex items-center gap-1">
            ⚠️ DISCLAIMER:
          </p>
          <p className="leading-relaxed">
            All associated sales history & transaction records will also be cleared so your store can start fresh with a new catalog.
          </p>
          <p className="mt-2 pt-1 border-t border-red-200 dark:border-red-500/20">
            Type <strong className="font-mono underline">RESET</strong> below to confirm.
          </p>
        </div>

        <input
          type="text"
          className="input-field mb-4 font-mono uppercase text-sm"
          placeholder="Type RESET"
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value)}
        />

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1 text-sm">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={confirmInput.trim() !== 'RESET' || loading}
            className="btn-glow flex-1 text-sm bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:shadow-none"
          >
            {loading ? <Loader2 className="animate-spin mx-auto" size={16} /> : 'Reset Everything'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductModal({ product, categories, onSave, onClose }) {
  const [form, setForm] = useState(product ? {
    category: product.category,
    name: product.name,
    selling_price: product.selling_price ?? '',
    cost_price: product.cost_price ?? '',
    stock_quantity: product.stock_quantity,
    is_active: product.is_active,
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Product name is required')
    if (!form.category.trim()) return setError('Category is required')
    setSaving(true)
    try {
      const payload = {
        ...form,
        selling_price: form.selling_price === '' ? null : parseFloat(form.selling_price),
        cost_price: form.cost_price === '' ? null : parseFloat(form.cost_price),
        stock_quantity: parseInt(form.stock_quantity) || 0,
      }
      await onSave(payload)
      onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-card bg-white dark:bg-[#111122] p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-slate-900 dark:text-white font-bold">{product ? 'Edit Product' : 'Add Product'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-600 dark:text-white/50 text-xs mb-1 block font-medium">Category *</label>
              <input className="input-field" placeholder="e.g. Snack"
                value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                list="categories-list" />
              <datalist id="categories-list">
                {categories.filter(c => c !== 'All').map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="text-slate-600 dark:text-white/50 text-xs mb-1 block font-medium">Product Name *</label>
              <input className="input-field" placeholder="e.g. Amul Kulfi"
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-slate-600 dark:text-white/50 text-xs mb-1 block font-medium">Selling Price (₹)</label>
              <input className="input-field" type="number" min="0" step="0.5"
                placeholder="—" value={form.selling_price}
                onChange={(e) => setForm({ ...form, selling_price: e.target.value })} />
            </div>
            <div>
              <label className="text-slate-600 dark:text-white/50 text-xs mb-1 block font-medium">Cost Price (₹)</label>
              <input className="input-field" type="number" min="0" step="0.5"
                placeholder="—" value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
            </div>
            <div>
              <label className="text-slate-600 dark:text-white/50 text-xs mb-1 block font-medium">Stock Qty</label>
              <input className="input-field" type="number" min="0"
                value={form.stock_quantity}
                onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} />
            </div>
          </div>
        </div>

        {error && <p className="text-red-500 dark:text-red-400 text-xs mt-3">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-ghost flex-1 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-glow flex-1 text-sm">
            {saving ? <Loader2 className="animate-spin mx-auto" size={16} /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function InventoryPage() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState(['All'])
  const [activeCategory, setActiveCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(null)                     // null | 'add' | {product}
  const [showImportModal, setShowImportModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  const loadCategories = () => {
    productsApi.categories().then((r) => setCategories(['All', ...r.data])).catch(console.error)
  }

  const loadProducts = useCallback(async () => {
    setLoading(true)
    try {
      const params = { active_only: false }
      if (search) params.search = search
      if (activeCategory !== 'All') params.category = activeCategory
      if (lowStockOnly) params.low_stock = true
      const r = await productsApi.list(params)
      setProducts(r.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [search, activeCategory, lowStockOnly])

  useEffect(() => { loadCategories() }, [])
  useEffect(() => { loadProducts() }, [loadProducts])

  const handleCreate = async (payload) => {
    await productsApi.create(payload)
    loadProducts()
    loadCategories()
  }

  const handleBulkImport = async (parsedItems) => {
    await productsApi.importCsv(parsedItems)
    loadProducts()
    loadCategories()
  }

  const handleResetInventory = async () => {
    setResetting(true)
    try {
      await productsApi.reset()
      setShowResetModal(false)
      loadProducts()
      loadCategories()
    } catch (e) {
      alert('Failed to reset inventory')
    } finally {
      setResetting(false)
    }
  }

  const handleUpdate = async (id, payload) => {
    await productsApi.update(id, payload)
    loadProducts()
  }

  const handleDelete = async (product) => {
    if (!window.confirm(`Deactivate "${product.name}"?`)) return
    await productsApi.delete(product.id)
    loadProducts()
  }

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const sorted = [...products].sort((a, b) => {
    let av = a[sortField], bv = b[sortField]
    if (av === null) return 1
    if (bv === null) return -1
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronDown size={12} className="text-slate-400 dark:text-white/20" />
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-brand-600 dark:text-brand-400" />
      : <ChevronDown size={12} className="text-brand-600 dark:text-brand-400" />
  }

  const lowStockCount = products.filter(p => p.stock_quantity < 10 && p.is_active).length

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-[#0d0d14] transition-colors duration-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 dark:text-white font-bold text-lg flex items-center gap-2">
            <Package size={20} className="text-brand-600 dark:text-brand-400" />
            Inventory
          </h1>
          <p className="text-slate-500 dark:text-white/40 text-xs mt-0.5">{products.length} products · {lowStockCount} low stock</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadProducts} className="btn-ghost flex items-center gap-2 text-sm" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* Dynamic Actions based on inventory state */}
          {products.length > 0 ? (
            <button
              onClick={() => setShowResetModal(true)}
              className="btn-ghost text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-950/40 flex items-center gap-2 text-sm font-semibold"
            >
              <RotateCcw size={14} />
              Reset Inventory
            </button>
          ) : (
            <button
              onClick={() => setShowImportModal(true)}
              className="btn-glow flex items-center gap-2 text-sm"
            >
              <Upload size={14} />
              Import CSV
            </button>
          )}

          <button onClick={() => setModal('add')} className="btn-glow flex items-center gap-2 text-sm">
            <Plus size={14} />
            Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-slate-200 dark:border-white/5 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30" size={14} />
          <input className="input-field pl-8 text-sm py-2" placeholder="Search products..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {/* Categories */}
        <div className="flex gap-1.5 overflow-x-auto">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`category-tab text-xs py-1.5 ${activeCategory === cat ? 'active' : ''}`}>
              {cat}
            </button>
          ))}
        </div>
        {/* Low stock toggle */}
        <button
          onClick={() => setLowStockOnly(!lowStockOnly)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-all
            ${lowStockOnly
              ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-500/40 dark:text-red-300'
              : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:bg-white/5 dark:border-white/10 dark:text-white/50 dark:hover:text-white dark:hover:bg-white/10'}`}>
          <AlertTriangle size={12} />
          Low Stock Only
        </button>
      </div>

      {/* Table / Empty Onboarding State */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 dark:text-white/30 gap-2">
            <Loader2 className="animate-spin text-brand-600 dark:text-brand-400" size={20} /><span className="text-sm">Loading...</span>
          </div>
        ) : products.length === 0 ? (
          /* ── High-Impact Empty Store Onboarding Card ── */
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center max-w-lg mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-200 dark:bg-brand-900/30 dark:border-brand-500/30 flex items-center justify-center mb-4 shadow-lg shadow-brand-500/10">
              <FileSpreadsheet className="text-brand-600 dark:text-brand-400" size={32} />
            </div>
            <h2 className="text-slate-900 dark:text-white font-bold text-lg">Your Inventory Is Empty</h2>
            <p className="text-slate-500 dark:text-white/50 text-xs mt-1 leading-relaxed mb-6">
              Get started by importing your store's product catalog from a CSV file, or add products manually one by one.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowImportModal(true)}
                className="btn-glow px-5 py-2.5 text-sm flex items-center gap-2"
              >
                <Upload size={16} /> Import Catalog CSV
              </button>
              <button
                onClick={() => setModal('add')}
                className="btn-ghost px-5 py-2.5 text-sm flex items-center gap-2"
              >
                <Plus size={16} /> Add Item Manually
              </button>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-slate-500 dark:text-white/40 text-xs border-b border-slate-200 dark:border-white/5">
                {[
                  { key: 'category', label: 'Category' },
                  { key: 'name', label: 'Product Name' },
                  { key: 'selling_price', label: 'Selling ₹' },
                  { key: 'cost_price', label: 'Cost ₹' },
                  { key: 'stock_quantity', label: 'Stock' },
                  { key: 'profit_margin_pct', label: 'Margin %' },
                ].map(({ key, label }) => (
                  <th key={key} className="pb-3 pr-4 font-medium">
                    <button className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors"
                      onClick={() => toggleSort(key)}>
                      {label} <SortIcon field={key} />
                    </button>
                  </th>
                ))}
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5">
              {sorted.map((p) => (
                <tr key={p.id} className={`group hover:bg-slate-100/60 dark:hover:bg-white/3 transition-colors ${!p.is_active ? 'opacity-40' : ''}`}>
                  <td className="py-3 pr-4">
                    <span className="badge-category">{p.category}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <p className="text-slate-900 dark:text-white text-sm font-medium">{p.name}</p>
                    {!p.is_active && <p className="text-slate-400 dark:text-white/30 text-xs">Inactive</p>}
                  </td>
                  <td className="py-3 pr-4 text-sm">
                    {p.selling_price != null
                      ? <span className="text-slate-900 dark:text-white">₹{Number(p.selling_price).toFixed(2)}</span>
                      : <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">Not set</span>}
                  </td>
                  <td className="py-3 pr-4 text-sm">
                    {p.cost_price != null
                      ? <span className="text-slate-600 dark:text-white/70">₹{Number(p.cost_price).toFixed(2)}</span>
                      : <span className="text-slate-400 dark:text-white/25 text-xs">—</span>}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-900 dark:text-white text-sm">{p.stock_quantity}</span>
                      <LowStockBadge qty={p.stock_quantity} />
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    {p.profit_margin_pct != null ? (
                      <span className={`text-sm font-semibold ${p.profit_margin_pct >= 20 ? 'text-emerald-600 dark:text-emerald-400' : p.profit_margin_pct >= 10 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                        {p.profit_margin_pct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-white/25 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setModal({ product: p })}
                        className="p-1.5 rounded-lg hover:bg-brand-50 text-slate-400 hover:text-brand-600 dark:hover:bg-brand-600/20 dark:text-white/40 dark:hover:text-brand-400 transition-colors">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => handleDelete(p)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 dark:hover:bg-red-900/30 dark:text-white/40 dark:hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {modal === 'add' && (
        <ProductModal categories={categories} onSave={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.product && (
        <ProductModal
          product={modal.product}
          categories={categories}
          onSave={(payload) => handleUpdate(modal.product.id, payload)}
          onClose={() => setModal(null)}
        />
      )}
      {showImportModal && (
        <CSVImportModal
          onImportSuccess={handleBulkImport}
          onClose={() => setShowImportModal(false)}
        />
      )}
      {showResetModal && (
        <ResetConfirmationModal
          productCount={products.length}
          onConfirm={handleResetInventory}
          onClose={() => setShowResetModal(false)}
          loading={resetting}
        />
      )}
    </div>
  )
}
