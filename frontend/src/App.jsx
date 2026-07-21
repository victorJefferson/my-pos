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

import GlobalWidgetsDrawer from './components/GlobalWidgetsDrawer'

// ── Sign-in screen shown to unauthenticated users ─────────────────────────────
function SignInScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-slate-50 dark:bg-[#0d0d14] transition-colors duration-200">
      {/* Brand header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-2xl mb-2 shadow-brand-500/30">
          <span className="text-3xl">🏪</span>
        </div>
        <h1 className="text-slate-900 dark:text-white font-bold text-3xl tracking-tight">Retail POS & Management</h1>
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
        <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-[#0d0d14] transition-colors duration-200 relative">
          <Sidebar />
          <main className="flex-1 overflow-hidden">
            <Routes>
              <Route path="/" element={<POSPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/ai" element={<AIPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
            </Routes>
          </main>
          <GlobalWidgetsDrawer />
        </div>
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
