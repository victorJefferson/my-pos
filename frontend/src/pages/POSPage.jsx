import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Search, X, CheckCircle, Loader2, Flame, ShoppingBag, Store } from 'lucide-react'
import { productsApi, posApi } from '../services/api'
import { TENANT_ID } from '../services/api'
import { usePOSKeyboard } from '../hooks/usePOSKeyboard'
import ProductCard from '../components/ProductCard'
import Skeleton from '../components/Skeleton'
import CartSidebar from '../components/CartSidebar'
import PriceModal from '../components/PriceModal'
import PaymentModal from '../components/PaymentModal'
import RecentTransactions from '../components/RecentTransactions'
import ScannerOverlay from '../components/ScannerOverlay'

import { getCategoryEmoji } from '../utils/categoryUtils'

export default function POSPage() {
  // ── States ─────────────────────────────────────────────────────────────────
  const [allProducts, setAllProducts] = useState([])            // In-memory catalog cache
  const [frequentlySold, setFrequentlySold] = useState([])      // Top sold items
  const [categories, setCategories] = useState(['All'])
  const [activeCategory, setActiveCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPayment, setShowPayment] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [paying, setPaying] = useState(false)
  const [priceModal, setPriceModal] = useState(null)            // {product}
  const [successMsg, setSuccessMsg] = useState(null)
  const [showMobileCart, setShowMobileCart] = useState(false)
  const searchRef = useRef(null)
  const recentRef = useRef(null)

  // ── Initial Load: Fetch full catalog & frequently sold items ────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [catRes, prodRes, freqRes] = await Promise.all([
        productsApi.categories(),
        productsApi.list({ limit: 1000 }),                      // Fast single batch fetch
        productsApi.frequentlySold(20).catch(() => ({ data: [] })),
      ])
      setCategories(['All', ...catRes.data])
      setAllProducts(prodRes.data)
      setFrequentlySold(freqRes.data)
    } catch (e) {
      console.error('Failed to load POS data:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Background Refresh Frequently Sold (e.g. after checkout) ───────────────
  const refreshFrequentlySold = async () => {
    try {
      const freqRes = await productsApi.frequentlySold(20)
      setFrequentlySold(freqRes.data)
      const prodRes = await productsApi.list({ limit: 1000 })
      setAllProducts(prodRes.data)
    } catch (e) {
      console.error(e)
    }
  }

  // ── High-Speed Instant In-Memory Filter ────────────────────────────────────
  const displayedProducts = useMemo(() => {
    const query = search.trim().toLowerCase()

    // 1. Searching: match against entire catalog instantly
    if (query) {
      return allProducts.filter((p) => {
        const matchesQuery = p.name.toLowerCase().includes(query) ||
                             p.category.toLowerCase().includes(query)
        const matchesCat = activeCategory === 'All' || p.category === activeCategory
        return matchesQuery && matchesCat
      })
    }

    // 2. Specific Category selected: filter catalog by category
    if (activeCategory !== 'All') {
      return allProducts.filter((p) => p.category === activeCategory)
    }

    // 3. Default view ("All" & no search): strictly show Frequently Sold items (or empty if no sales yet)
    return frequentlySold
  }, [search, activeCategory, allProducts, frequentlySold])

  const isFrequentlySoldView = activeCategory === 'All' && search.trim() === ''

  // ── Add to Cart ────────────────────────────────────────────────────────────
  const addToCart = (product) => {
    if (product.selling_price === null || product.selling_price === undefined) {
      setPriceModal({ product })
      return
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id)
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        unit_selling_price: parseFloat(product.selling_price),
        unit_cost_price: parseFloat(product.cost_price || 0),
        quantity: 1,
        max_stock: product.stock_quantity,
      }]
    })
  }

  const handlePriceConfirm = async ({ selling_price, cost_price, save_to_db }) => {
    const { product } = priceModal
    if (save_to_db) {
      try {
        await productsApi.update(product.id, { selling_price, cost_price })
        loadData()
      } catch (e) { console.error(e) }
    }
    addToCart({ ...product, selling_price, cost_price })
    setPriceModal(null)
  }

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((i) => i.product_id !== productId))
  }

  const changeQty = (productId, newQty) => {
    if (newQty <= 0) return removeFromCart(productId)
    const item = cart.find((i) => i.product_id === productId)
    if (item && newQty > item.max_stock) return
    setCart((prev) => prev.map((i) => i.product_id === productId ? { ...i, quantity: i.quantity + 1 } : i))
  }

  const clearBill = () => setCart([])

  // ── Checkout ───────────────────────────────────────────────────────────────
  const handlePay = async (paymentMode) => {
    if (paying) return
    if (!TENANT_ID) {
      alert('⚠️ VITE_TENANT_ID is not set in your .env file.')
      return
    }
    setPaying(true)
    try {
      await posApi.checkout({
        tenant_id: TENANT_ID,
        payment_mode: paymentMode,
        items: cart.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_selling_price: i.unit_selling_price,
          unit_cost_price: i.unit_cost_price,
        })),
      })
      setShowPayment(false)
      setCart([])
      setSuccessMsg(`✅ Payment via ${paymentMode} recorded!`)
      setTimeout(() => setSuccessMsg(null), 3000)
      refreshFrequentlySold()
      recentRef.current?.refresh()
    } catch (e) {
      alert('Checkout failed: ' + (e.response?.data?.detail || e.message))
    } finally {
      setPaying(false)
    }
  }

  const cartTotal = cart.reduce((s, i) => s + i.unit_selling_price * i.quantity, 0)
  const INR = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v)

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  usePOSKeyboard({
    onSpace: () => !paying && cart.length > 0 && setShowPayment(true),
    onEsc: () => { if (!paying) { if (showPayment) setShowPayment(false); else clearBill() } },
    onEnter: () => searchRef.current?.focus(),
  })

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden bg-slate-50 dark:bg-[#0d0d14] transition-colors duration-200">
      {/* ── Main Area ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/5 bg-white/80 dark:bg-[#0d0d14]/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {/* Instant Search */}
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30" size={16} />
              <input
                ref={searchRef}
                type="text"
                className="input-field pl-9 pr-9"
                placeholder="Instant search products... (try 'cola', 'amul', 'chips')"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Quick stats */}
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-white/40">
              <span>{allProducts.length} catalog items</span>
              <span>·</span>
              <span className="text-brand-600 dark:text-brand-300 font-medium">
                {cart.length} in cart
              </span>
            </div>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 px-5 py-3 overflow-x-auto border-b border-slate-200 dark:border-white/5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat)
              }}
              className={`category-tab ${activeCategory === cat ? 'active' : ''}`}
            >
              {getCategoryEmoji(cat)} {cat}
            </button>
          ))}
        </div>

        {/* Section Title Banner */}
        <div className="px-5 pt-3 pb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isFrequentlySoldView ? (
              <>
                <Flame size={16} className="text-amber-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-amber-400">
                  Frequently Sold Items
                </h2>
              </>
            ) : search.trim() ? (
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-white/60">
                Search Results ({displayedProducts.length})
              </h2>
            ) : (
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-white/60 flex items-center gap-1.5">
                <Store size={14} className="text-brand-600 dark:text-brand-400" />
                Store Catalog ({displayedProducts.length})
              </h2>
            )}
          </div>
          {isFrequentlySoldView && frequentlySold.length > 0 && (
            <span className="text-[11px] text-slate-400 dark:text-white/30">
              Top items by checkout volume
            </span>
          )}
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((i) => (
                <div key={i} className="product-card flex flex-col items-center justify-center gap-2">
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <Skeleton className="w-16 h-3 rounded" />
                  <Skeleton className="w-12 h-4 rounded mt-1" />
                </div>
              ))}
            </div>
          ) : displayedProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-white/30 gap-2 text-center p-6">
              <span className="text-3xl">{isFrequentlySoldView ? '🔥' : '🔍'}</span>
              <p className="text-sm font-semibold text-slate-700 dark:text-white/70">
                {isFrequentlySoldView ? 'No frequently sold items yet' : 'No products found'}
              </p>
              <p className="text-xs text-slate-400 dark:text-white/40 max-w-xs">
                {isFrequentlySoldView
                  ? 'Search for products or select a category tab above to start making checkouts!'
                  : 'Try adjusting your search query or selected category.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2.5">
              {displayedProducts.map((product) => (
                <ProductCard key={product.id} product={product} onAdd={addToCart} />
              ))}
            </div>
          )}
        </div>

        {/* Mobile View Cart Button */}
        <div className="md:hidden p-3 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d0d14]">
          <button
            onClick={() => setShowMobileCart(true)}
            className={`w-full py-3 rounded-xl flex items-center justify-between px-4 shadow-lg ${
              cart.length > 0
                ? 'btn-brand shadow-brand-500/20'
                : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <ShoppingBag size={18} />
              <span className="font-bold">{cart.reduce((a, b) => a + b.quantity, 0)} Items</span>
            </div>
            <span className="font-bold text-lg">{INR(cartTotal)} <span className="opacity-70 ml-1">➔</span></span>
          </button>
        </div>

        {/* Keyboard hint bar */}
        <div className="hidden md:flex px-5 py-2 border-t border-slate-200 dark:border-white/5 gap-4 text-[10px] text-slate-500 dark:text-white/20">
          <span><kbd className="bg-slate-200/80 dark:bg-white/5 px-1 rounded text-slate-700 dark:text-white/40">Space</kbd> Payment</span>
          <span><kbd className="bg-slate-200/80 dark:bg-white/5 px-1 rounded text-slate-700 dark:text-white/40">Esc</kbd> Clear</span>
          <span><kbd className="bg-slate-200/80 dark:bg-white/5 px-1 rounded text-slate-700 dark:text-white/40">Enter</kbd> Focus Search</span>
        </div>
      </div>

      {/* ── Cart Sidebar (Desktop) / Drawer (Mobile) ───────────────────────── */}
      <div className={`
        fixed inset-0 z-50 bg-white dark:bg-[#0a0a14] flex flex-col transition-transform duration-300
        md:relative md:z-0 md:w-72 md:translate-y-0 md:border-l md:border-slate-200 dark:md:border-white/5
        ${showMobileCart ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
      `}>
        {/* Mobile Header for Cart Drawer */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#111122]">
          <h2 className="font-bold text-lg text-slate-900 dark:text-white">Current Bill</h2>
          <button 
            onClick={() => setShowMobileCart(false)} 
            className="p-2 rounded-full bg-slate-200/50 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-600 dark:text-white transition-colors"
          >
            <X size={18}/>
          </button>
        </div>

        <CartSidebar
          items={cart}
          onRemove={removeFromCart}
          onQtyChange={changeQty}
          onClear={clearBill}
          onCheckout={() => {
            if (cart.length > 0) {
              setShowMobileCart(false)
              setShowPayment(true)
            }
          }}
          onOpenScanner={() => setShowScanner(true)}
        />
        <div className="hidden md:block">
          <RecentTransactions
            ref={recentRef}
            onRefresh={refreshFrequentlySold}
          />
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {priceModal && (
        <PriceModal
          product={priceModal.product}
          onConfirm={handlePriceConfirm}
          onCancel={() => setPriceModal(null)}
        />
      )}

      {showPayment && (
        <PaymentModal
          total={cartTotal}
          onPay={handlePay}
          onCancel={() => !paying && setShowPayment(false)}
          loading={paying}
        />
      )}

      <ScannerOverlay
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onAddToCart={addToCart}
        allProducts={allProducts}
      />

      {/* ── Success Toast ─────────────────────────────────────────────────────── */}
      {successMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-scale-in">
          <div className="flex items-center gap-2 bg-emerald-600 text-white dark:bg-emerald-900/90 dark:border dark:border-emerald-500/40 dark:text-emerald-300 px-5 py-3 rounded-2xl shadow-xl text-sm font-medium">
            <CheckCircle size={16} />
            {successMsg}
          </div>
        </div>
      )}
    </div>
  )
}
