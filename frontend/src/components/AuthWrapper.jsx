import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Loader2, Store } from 'lucide-react'
import { setToken } from '../tokenStore'
import { authApi } from '../services/api'
import StoreSetupWizard from './StoreSetupWizard'

/**
 * AuthWrapper — Lives inside ClerkProvider.
 * 1. Ensures Clerk session token is fetched & placed in tokenStore BEFORE rendering children.
 * 2. Calls /api/v1/auth/me on sign-in to auto-register/fetch DB user & tenant_id.
 * 3. Shows full-screen Store Setup Wizard BEFORE rendering sidebar or dashboard if user store is unconfigured.
 * 4. Clears local storage on sign-out to prevent stale store leakage.
 * 5. Keeps token fresh in background every 45s.
 */
export default function AuthWrapper({ children }) {
  const { getToken, isSignedIn, isLoaded } = useAuth()
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [storeName, setStoreName] = useState('')
  const initialized = useRef(false)

  // Clear stale local storage on sign out
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      localStorage.removeItem('rc_tenant_id')
      localStorage.removeItem('rc_store_name')
    }
  }, [isLoaded, isSignedIn])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return

    const initAuth = async () => {
      try {
        const token = await getToken()
        setToken(token)

        if (!initialized.current) {
          initialized.current = true
          try {
            const { data } = await authApi.me()

            const isNewUser = Boolean(data?.is_new)
            const needsSetup = Boolean(isNewUser || data?.needs_setup || !data?.store_name || data?.store_name === 'New Store' || data?.store_name === 'My Store')

            if (data.tenant_id) {
              let validStores = []
              try {
                const res = await authApi.listStores()
                validStores = res.data || []
              } catch (e) {
                console.warn('[Appa Software] Could not list stores:', e)
              }

              const currentTenantId = localStorage.getItem('rc_tenant_id')
              const isValidTenant = validStores.some(s => s.tenant_id === currentTenantId)

              if (needsSetup || !currentTenantId || !isValidTenant) {
                localStorage.setItem('rc_tenant_id', data.tenant_id)
                localStorage.setItem('rc_store_name', data.store_name && !['New Store', 'My Store'].includes(data.store_name) ? data.store_name : '')
                setStoreName(data.store_name && !['New Store', 'My Store'].includes(data.store_name) ? data.store_name : '')
              } else {
                setStoreName(localStorage.getItem('rc_store_name') || '')
              }

              if (needsSetup) {
                setShowWizard(true)
              }
              console.info(`[Appa Software] Signed in as ${data.name} (${data.role}) · Store: ${data.store_name} · Tenant: ${data.tenant_id}`)
            }
          } finally {
            setLoading(false)
          }
        }
      } catch (e) {
        console.error('[Appa Software] Auth initialization error:', e)
        // If we hit an error outside the inner try, and we haven't loaded, we should still stop loading
        setLoading(false)
      }
    }

    initAuth()

    // Refresh token every 45s
    const interval = setInterval(async () => {
      try {
        const token = await getToken()
        setToken(token)
      } catch (e) {
        console.error('Failed to refresh token:', e)
      }
    }, 45_000)

    return () => clearInterval(interval)
  }, [isLoaded, isSignedIn, getToken])

  if (!isLoaded || (isSignedIn && loading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-900 text-white">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/20 mb-2">
          <Store className="w-6 h-6 text-white" />
        </div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="animate-spin text-brand-400" size={18} />
          <span>Loading workspace</span>
        </div>
      </div>
    )
  }

  const handleWizardComplete = (newStoreName) => {
    localStorage.setItem('rc_store_name', newStoreName)
    setStoreName(newStoreName)
    setShowWizard(false)
    window.location.reload()
  }

  // If store needs setup, render ONLY the wizard (blocking sidebar & dashboard)
  if (showWizard) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <StoreSetupWizard
          initialStoreName=""
          onComplete={handleWizardComplete}
        />
      </div>
    )
  }

  return children
}
