import { WifiOff, CloudOff, RefreshCw, AlertTriangle, X, CheckCircle2, Loader2 } from 'lucide-react'
import { useOffline } from '../context/OfflineContext'
import SyncQueueList from './SyncQueueList'

export default function OfflineBanner() {
  const {
    enabled,
    online,
    pending,
    failed,
    ops,
    authRequired,
    syncing,
    syncMessage,
    syncNow,
    panelOpen,
    setPanelOpen,
    refresh,
  } = useOffline()

  if (!enabled) return null

  const showBar =
    !online || pending > 0 || failed > 0 || authRequired || syncing || !!syncMessage

  return (
    <>
      {showBar && (
        <div
          className={`w-full px-4 py-2 text-sm flex items-center justify-between gap-3 ${
            syncMessage && !syncing && failed === 0 && online
              ? 'bg-emerald-600 text-white'
              : !online
                ? 'bg-amber-500 text-white'
                : failed > 0
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-800 text-white'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {syncing ? (
              <Loader2 size={16} className="animate-spin shrink-0" />
            ) : syncMessage && online && failed === 0 ? (
              <CheckCircle2 size={16} className="shrink-0" />
            ) : !online ? (
              <WifiOff size={16} className="shrink-0" />
            ) : failed > 0 ? (
              <AlertTriangle size={16} className="shrink-0" />
            ) : (
              <CloudOff size={16} className="shrink-0" />
            )}
            <span className="truncate">
              {syncing
                ? syncMessage || 'Syncing…'
                : syncMessage ||
                  (!online && 'Offline — changes are saved on this device') ||
                  (authRequired && 'Sign-in expired — refresh session to sync') ||
                  (failed > 0 && `${failed} failed sync(s) need attention`) ||
                  (pending > 0 && `${pending} change(s) waiting to sync`) ||
                  'Sync ready'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {online && (
              <button
                type="button"
                disabled={syncing}
                onClick={() => syncNow({ quiet: false })}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/15 hover:bg-white/25 disabled:opacity-60"
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Syncing…' : 'Sync'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="px-2 py-1 rounded-md bg-white/15 hover:bg-white/25"
            >
              Details
            </button>
          </div>
        </div>
      )}

      {panelOpen && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111122] rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10 shrink-0">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">Pending changes</h3>
                <p className="text-xs text-slate-500 dark:text-white/40 mt-0.5">
                  Saved on this device — upload when you’re back online
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <SyncQueueList
              ops={ops}
              syncing={syncing}
              onRefresh={refresh}
              onSyncNow={syncNow}
            />
          </div>
        </div>
      )}
    </>
  )
}
