import { useState } from 'react'
import { Upload, Download, FileText, CheckCircle, AlertCircle, X, Loader2 } from 'lucide-react'

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

export default function CSVImportModal({ onImportSuccess, onClose }) {
  const [file, setFile] = useState(null)
  const [parsedItems, setParsedItems] = useState([])
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)

  // ── Download Sample CSV ───────────────────────────────────────────────────
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

  // ── Parse CSV File ────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (!selectedFile) return
    setFile(selectedFile)
    setError('')

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const text = evt.target.result
        const lines = text.split(/\r\n|\n/).filter(line => line.trim())
        if (lines.length < 2) {
          return setError('CSV file is empty or missing data rows')
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase())

        // Map column indices
        const catIdx = headers.findIndex(h => h.includes('cat'))
        const nameIdx = headers.findIndex(h => h.includes('item') || h.includes('name') || h.includes('product'))
        const spIdx = headers.findIndex(h => h.includes('sell') || h.includes('price'))
        const cpIdx = headers.findIndex(h => h.includes('cost'))
        const stockIdx = headers.findIndex(h => h.includes('stock') || h.includes('qty') || h.includes('quantity'))

        if (nameIdx === -1) {
          return setError('Could not find product name column. Download the sample CSV template for guidance.')
        }

        const items = []
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(',').map(cell => cell.trim())
          if (!row[nameIdx]) continue

          const name = row[nameIdx]
          const category = catIdx !== -1 && row[catIdx] ? row[catIdx] : 'Misc'
          const sellingPrice = spIdx !== -1 && row[spIdx] ? parseFloat(row[spIdx]) : null
          const costPrice = cpIdx !== -1 && row[cpIdx] ? parseFloat(row[cpIdx]) : null
          const stockQty = stockIdx !== -1 && row[stockIdx] ? parseInt(row[stockIdx]) : 0

          items.push({
            category,
            name,
            selling_price: isNaN(sellingPrice) ? null : sellingPrice,
            cost_price: isNaN(costPrice) ? null : costPrice,
            stock_quantity: isNaN(stockQty) ? 0 : stockQty,
            is_active: true,
          })
        }

        if (items.length === 0) {
          return setError('No valid products found in CSV file')
        }

        setParsedItems(items)
      } catch (err) {
        setError('Error reading CSV file. Ensure it is formatted correctly.')
      }
    }

    reader.readAsText(selectedFile)
  }

  // ── Import Action ─────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (parsedItems.length === 0) return
    setImporting(true)
    try {
      await onImportSuccess(parsedItems)
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Import failed. Please check the backend connection.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-card bg-white dark:bg-[#111122] p-6 w-full max-w-xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
              <Upload className="text-brand-600 dark:text-brand-400" size={20} />
            </div>
            <div>
              <h2 className="text-slate-900 dark:text-white font-bold text-base">Import Inventory CSV</h2>
              <p className="text-slate-500 dark:text-white/40 text-xs">Upload your product catalog in bulk</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white"><X size={18} /></button>
        </div>

        {/* Download Sample Template link */}
        <div className="mb-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="text-brand-600 dark:text-brand-400 shrink-0" size={16} />
            <span className="text-slate-700 dark:text-white/70 text-xs font-medium">Need a sample CSV format?</span>
          </div>
          <button
            onClick={downloadSampleCSV}
            className="text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200 flex items-center gap-1 bg-brand-50 dark:bg-brand-600/20 px-3 py-1.5 rounded-lg border border-brand-200 dark:border-brand-500/30 transition-all"
          >
            <Download size={13} /> Download Sample CSV
          </button>
        </div>

        {/* Upload File Input */}
        <div className="mb-4">
          <label className="border-2 border-dashed border-slate-300 dark:border-white/15 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-brand-500 transition-colors bg-slate-50/50 dark:bg-white/2">
            <Upload className="text-slate-400 dark:text-white/30 mb-2" size={28} />
            <p className="text-slate-800 dark:text-white text-xs font-semibold">
              {file ? file.name : 'Click or drag & drop a .csv file here'}
            </p>
            <p className="text-slate-400 dark:text-white/30 text-[11px] mt-0.5">Supports .csv file format</p>
            <input type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          </label>
        </div>

        {error && (
          <p className="text-red-500 dark:text-red-400 text-xs mb-4 flex items-center gap-1">
            <AlertCircle size={14} /> {error}
          </p>
        )}

        {/* Parsed Preview Table */}
        {parsedItems.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1">
                <CheckCircle size={14} className="text-emerald-500" />
                Parsed {parsedItems.length} products
              </span>
              <span className="text-[11px] text-slate-400 dark:text-white/30">Preview of first 5 items</span>
            </div>
            <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-white/10 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/50 sticky top-0">
                  <tr>
                    <th className="p-2">Category</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Selling ₹</th>
                    <th className="p-2">Cost ₹</th>
                    <th className="p-2">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-slate-700 dark:text-white/80">
                  {parsedItems.slice(0, 5).map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-medium">{item.category}</td>
                      <td className="p-2 font-semibold">{item.name}</td>
                      <td className="p-2">{item.selling_price != null ? `₹${item.selling_price}` : '—'}</td>
                      <td className="p-2">{item.cost_price != null ? `₹${item.cost_price}` : '—'}</td>
                      <td className="p-2 font-bold">{item.stock_quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1 text-sm">Cancel</button>
          <button
            onClick={handleImport}
            disabled={parsedItems.length === 0 || importing}
            className="btn-glow flex-1 text-sm disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2"
          >
            {importing ? <Loader2 className="animate-spin" size={16} /> : `Import ${parsedItems.length} Products`}
          </button>
        </div>
      </div>
    </div>
  )
}
