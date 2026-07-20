import { useState } from 'react'
import { Store, Upload, Download, ArrowRight, CheckCircle, Sparkles, Loader2 } from 'lucide-react'
import { authApi, productsApi } from '../services/api'

const SAMPLE_CSV = `Category,Item Name,Selling Price,Cost Price,Stock Quantity
IceCream,Amul Vanilla Cup (125ml),30,22,50
IceCream,Amul Chocobar,30,22,40
IceCream,Kwality Walls Cornetto,50,38,30
CoolDrink,Coca-Cola 250ml Can,40,30,100
CoolDrink,Pepsi 250ml Can,40,30,80
CoolDrink,Sprite 250ml Can,40,30,90
Snack,Lays Classic Salted 52g,20,15,120
Dairy,Amul Butter 100g,58,48,45
Bakery,Britannia Bread 400g,45,35,30`

export default function StoreSetupWizard({ initialStoreName, onComplete }) {
  const [step, setStep] = useState(1) // 1: Store Name, 2: Catalog CSV Option
  const [storeName, setStoreName] = useState(initialStoreName && initialStoreName !== 'New Store' ? initialStoreName : '')
  const [file, setFile] = useState(null)
  const [parsedItems, setParsedItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ── Download Sample CSV Template ──────────────────────────────────────────
  const downloadSampleCSV = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'sample_inventory.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ── File parsing ──────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (!selectedFile) return
    setFile(selectedFile)
    setError('')

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const text = evt.target.result
        const lines = text.split(/\r\n|\n/).filter(l => l.trim())
        if (lines.length < 2) return setError('CSV file is empty')

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
        const catIdx = headers.findIndex(h => h.includes('cat'))
        const nameIdx = headers.findIndex(h => h.includes('item') || h.includes('name') || h.includes('product'))
        const spIdx = headers.findIndex(h => h.includes('sell') || h.includes('price'))
        const cpIdx = headers.findIndex(h => h.includes('cost'))
        const stockIdx = headers.findIndex(h => h.includes('stock') || h.includes('qty') || h.includes('quantity'))

        if (nameIdx === -1) return setError('Could not find item name column')

        const items = []
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(',').map(c => c.trim())
          if (!row[nameIdx]) continue

          items.push({
            category: catIdx !== -1 && row[catIdx] ? row[catIdx] : 'Misc',
            name: row[nameIdx],
            selling_price: spIdx !== -1 && row[spIdx] ? parseFloat(row[spIdx]) : null,
            cost_price: cpIdx !== -1 && row[cpIdx] ? parseFloat(row[cpIdx]) : null,
            stock_quantity: stockIdx !== -1 && row[stockIdx] ? parseInt(row[stockIdx]) : 0,
            is_active: true,
          })
        }

        setParsedItems(items)
      } catch (err) {
        setError('Failed to parse CSV file')
      }
    }
    reader.readAsText(selectedFile)
  }

  // ── Step 1 Continue ───────────────────────────────────────────────────────
  const handleStep1Submit = async (e) => {
    e?.preventDefault()
    if (!storeName.trim()) return setError("Please enter your store's name to continue")

    setSaving(true)
    setError('')
    try {
      await authApi.updateStore({ store_name: storeName.trim() })
      localStorage.setItem('rc_store_name', storeName.trim())
      setStep(2)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update store name')
    } finally {
      setSaving(false)
    }
  }

  // ── Step 2 Finish ─────────────────────────────────────────────────────────
  const handleFinish = async (importCatalog) => {
    setSaving(true)
    setError('')
    try {
      if (importCatalog && parsedItems.length > 0) {
        await productsApi.importCsv(parsedItems)
      }
      onComplete(storeName.trim())
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to finish store setup')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in">
      <div className="glass-card bg-white dark:bg-[#111122] p-8 w-full max-w-lg rounded-3xl shadow-2xl animate-scale-in">
        {/* Header Icon */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/30">
              <Store className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-slate-900 dark:text-white font-bold text-lg">Setup Your Retail Store</h2>
              <p className="text-slate-500 dark:text-white/40 text-xs">Step {step} of 2 — Onboarding Wizard</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-300 border border-brand-200 dark:border-brand-500/30">
            Multi-Tenant Setup
          </span>
        </div>

        {/* Step 1: Store Name */}
        {step === 1 && (
          <form onSubmit={handleStep1Submit} className="space-y-5">
            <div>
              <label className="text-slate-700 dark:text-white/70 text-xs font-semibold mb-1.5 block">
                Store / Shop Name *
              </label>
              <input
                type="text"
                autoFocus
                className="input-field text-base font-bold py-3"
                placeholder="e.g. My Convenience Store"
                value={storeName}
                onChange={(e) => { setStoreName(e.target.value); setError('') }}
              />
              <p className="text-slate-400 dark:text-white/30 text-[11px] mt-1.5">
                This store name will appear on all your printed thermal receipts, financial analytics, and dashboard branding.
              </p>
            </div>

            {error && <p className="text-red-500 text-xs font-medium">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="btn-glow w-full py-3 text-sm font-semibold flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <>Next: Catalog Setup <ArrowRight size={16} /></>}
            </button>
          </form>
        )}

        {/* Step 2: Catalog CSV Setup */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="text-center bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-200 dark:border-white/10">
              <Sparkles className="text-amber-500 mx-auto mb-2" size={24} />
              <h3 className="text-slate-900 dark:text-white font-bold text-sm">Populate Your Store Catalog</h3>
              <p className="text-slate-500 dark:text-white/40 text-xs mt-0.5">
                Import your product inventory from a CSV file now, or start empty and add items as you go.
              </p>
            </div>

            {/* CSV File Input */}
            <div>
              <label className="border-2 border-dashed border-slate-300 dark:border-white/15 rounded-2xl p-5 flex flex-col items-center justify-center cursor-pointer hover:border-brand-500 transition-colors bg-slate-50/50 dark:bg-white/2">
                <Upload className="text-slate-400 dark:text-white/30 mb-2" size={24} />
                <p className="text-slate-800 dark:text-white text-xs font-semibold">
                  {file ? file.name : 'Select or drop inventory CSV file'}
                </p>
                {parsedItems.length > 0 && (
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle size={14} /> Ready to import {parsedItems.length} products
                  </span>
                )}
                <input type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
              </label>

              <button
                type="button"
                onClick={downloadSampleCSV}
                className="mt-2 text-[11px] text-brand-600 dark:text-brand-300 hover:underline flex items-center gap-1 mx-auto"
              >
                <Download size={12} /> Download Sample CSV Template
              </button>
            </div>

            {error && <p className="text-red-500 text-xs font-medium text-center">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => handleFinish(false)}
                disabled={saving}
                className="btn-ghost flex-1 py-3 text-xs font-medium"
              >
                Skip & Start Empty
              </button>
              <button
                onClick={() => handleFinish(true)}
                disabled={parsedItems.length === 0 || saving}
                className="btn-glow flex-1 py-3 text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : `Import ${parsedItems.length} Products & Enter POS`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
