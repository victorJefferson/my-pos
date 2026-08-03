import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import {
  SignedIn,
  SignedOut,
  SignIn,
} from '@clerk/clerk-react'
import Sidebar from './components/Sidebar'
import AuthWrapper from './components/AuthWrapper'
import POSPage from './pages/POSPage'
import InventoryPage from './pages/InventoryPage'
import ExpensesPage from './pages/ExpensesPage'
import AnalyticsPage from './pages/AnalyticsPage'
import AIPage from './pages/AIPage'
import TransactionsPage from './pages/TransactionsPage'

import MobileNavbar from './components/MobileNavbar'
import GlobalWidgetsDrawer from './components/GlobalWidgetsDrawer'
import { AiChatProvider } from './context/AiChatContext'
import { OfflineProvider } from './context/OfflineContext'
import OfflineBanner from './components/OfflineBanner'

// ── Desktop Only Route Guard ──────────────────────────────────────────────────
function DesktopOnlyRoute({ children }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (isMobile) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-slate-50 dark:bg-[#0d0d14]">
        <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center mb-4">
          <span className="text-2xl">💻</span>
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Desktop Only Feature</h2>
        <p className="text-sm text-slate-500 dark:text-white/40 mt-2 max-w-[250px]">
          This management page requires a larger screen. Please access it from a tablet or computer.
        </p>
      </div>
    )
  }
  return children
}

// ── Sign-in screen shown to unauthenticated users ─────────────────────────────
function SignInScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-slate-50 dark:bg-[#0d0d14] transition-colors duration-200 p-4">
      {/* Brand header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-2xl mb-2 shadow-brand-500/30">
          <span className="text-3xl">🏪</span>
        </div>
        <h1 className="text-slate-900 dark:text-white font-bold text-2xl md:text-3xl tracking-tight">Retail POS & Management</h1>
        <p className="text-slate-500 dark:text-white/40 text-sm">Multi-Tenant Point of Sale · Inventory · Financial Analytics</p>
      </div>

      {/* Clerk sign-in widget */}
      <SignIn
        appearance={{
          variables: {
            colorPrimary: '#7c3aed',
            borderRadius: '12px',
          },
          elements: {
            card: 'shadow-xl border border-slate-200 dark:border-white/10 dark:bg-[#111122]',
            headerTitle: 'text-slate-900 dark:text-white font-bold',
            socialButtonsBlockButton: 'border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10',
          },
        }}
      />

      <p className="text-slate-400 dark:text-white/20 text-xs">Powered by Clerk · Multi-Tenant POS v1.0</p>
    </div>
  )
}

// ── Main authenticated layout ──────────────────────────────────────────────────
function AppLayout() {
  return (
    <AuthWrapper>
      <BrowserRouter>
        <OfflineProvider>
          <AiChatProvider>
            <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-[#0d0d14] transition-colors duration-200 relative">
              <div className="hidden md:flex">
                <Sidebar />
              </div>
              <main className="flex-1 overflow-hidden pb-[60px] md:pb-0 flex flex-col">
                <OfflineBanner />
                <div className="flex-1 overflow-hidden">
                  <Routes>
                    <Route path="/" element={<POSPage />} />
                    <Route path="/inventory" element={<DesktopOnlyRoute><InventoryPage /></DesktopOnlyRoute>} />
                    <Route path="/expenses" element={<ExpensesPage />} />
                    <Route path="/analytics" element={<DesktopOnlyRoute><AnalyticsPage /></DesktopOnlyRoute>} />
                    <Route path="/ai" element={<DesktopOnlyRoute><AIPage /></DesktopOnlyRoute>} />
                    <Route path="/transactions" element={<TransactionsPage />} />
                  </Routes>
                </div>
              </main>
              <MobileNavbar />
              <GlobalWidgetsDrawer />
            </div>
          </AiChatProvider>
        </OfflineProvider>
      </BrowserRouter>
    </AuthWrapper>
  )
}

// ── Root — switches between sign-in and app based on auth state ───────────────
export default function App() {
  return (
    <>
      <SignedOut>
        <SignInScreen />
      </SignedOut>
      <SignedIn>
        <AppLayout />
      </SignedIn>
    </>
  )
}
