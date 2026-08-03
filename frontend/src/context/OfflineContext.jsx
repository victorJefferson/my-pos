import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { OFFLINE_MODE, SYNC_INTERVAL_MS } from '../offline/config'
import { startConnectivityMonitor, subscribeConnectivity } from '../offline/connectivity'
import { countPending, listPendingOps } from '../offline/outbox'
import { drainOutbox, hydrateCaches } from '../offline/syncWorker'
import { getTenantId } from '../services/api'

const OfflineContext = createContext({
  enabled: false,
  online: true,
  pending: 0,
  failed: 0,
  ops: [],
  authRequired: false,
  syncing: false,
  syncMessage: null,
  refresh: async () => {},
  syncNow: async () => {},
  hasPending: false,
})

const MAX_DRAIN_PASSES = 5

export function OfflineProvider({ children }) {
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState(0)
  const [ops, setOps] = useState([])
  const [authRequired, setAuthRequired] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState(null)
  /** Shared in-flight sync so manual + background never race or drop work */
  const syncRunRef = useRef(null)
  /** How many UI callers want the Syncing banner (manual taps) */
  const syncUiDepth = useRef(0)
  const msgTimer = useRef(null)
  const reconnectTimer = useRef(null)
  const wasOnline = useRef(true)

  const showMessage = useCallback((text, ms = 4000) => {
    setSyncMessage(text)
    if (msgTimer.current) clearTimeout(msgTimer.current)
    if (ms > 0) {
      msgTimer.current = setTimeout(() => setSyncMessage(null), ms)
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!OFFLINE_MODE) return
    const tid = getTenantId()
    if (!tid) return
    const counts = await countPending(tid)
    setPending(counts.pending)
    setFailed(counts.failed)
    setOps(await listPendingOps(tid))
  }, [])

  const finishSyncMessage = useCallback(
    (result, remaining) => {
      if (result?.authRequired) {
        showMessage('Sign-in expired — refresh the page to sync', 5000)
      } else if (result?.offline) {
        showMessage('Still offline — will sync when the connection is solid', 4000)
      } else if (result?.synced > 0 && remaining.pending === 0 && remaining.failed === 0) {
        showMessage(`Synced ${result.synced} change(s) — all clear`, 4000)
      } else if (result?.synced > 0) {
        showMessage(
          `Synced ${result.synced}; ${remaining.pending} pending, ${remaining.failed} failed`,
          5000,
        )
      } else if (remaining.failed > 0) {
        showMessage(`${remaining.failed} change(s) failed — open Details`, 5000)
      } else if (remaining.pending > 0) {
        showMessage('Still waiting on network — tap Sync to retry', 4000)
      } else {
        showMessage('Everything is already synced', 2500)
      }
    },
    [showMessage],
  )

  const startSyncRun = useCallback(
    async (tid) => {
      let totalSynced = 0
      let last = { synced: 0, failed: 0 }
      for (let pass = 0; pass < MAX_DRAIN_PASSES; pass++) {
        last = await drainOutbox(tid)
        totalSynced += last.synced || 0
        if (last.authRequired || last.offline) {
          return { ...last, synced: totalSynced }
        }
        const counts = await countPending(tid)
        if (counts.pending === 0) break
        if ((last.synced || 0) === 0) break
      }
      return { ...last, synced: totalSynced }
    },
    [],
  )

  /**
   * Coordinated sync. Concurrent callers share one run.
   * Manual taps always show Syncing UI and join (never "already running").
   * After joining a background run, manual retries once if queue remains.
   */
  const syncNow = useCallback(
    async ({ quiet = false } = {}) => {
      if (!OFFLINE_MODE) return { synced: 0, failed: 0 }
      const tid = getTenantId()
      if (!tid) return { synced: 0, failed: 0 }

      if (quiet) {
        const counts = await countPending(tid)
        if (counts.total === 0) return { synced: 0, failed: 0, skipped: true }
      }

      if (!quiet) {
        syncUiDepth.current += 1
        setSyncing(true)
        showMessage('Syncing…', 0)
      }

      const ensureRun = () => {
        if (syncRunRef.current) return { promise: syncRunRef.current, joined: true }
        const promise = (async () => {
          try {
            const result = await startSyncRun(tid)
            if (result?.authRequired) setAuthRequired(true)
            else setAuthRequired(false)
            if (result?.synced > 0) {
              try {
                await hydrateCaches(tid)
              } catch (_) {
                /* best-effort */
              }
            }
            await refresh()
            return result
          } finally {
            if (syncRunRef.current === promise) syncRunRef.current = null
          }
        })()
        syncRunRef.current = promise
        return { promise, joined: false }
      }

      try {
        let { promise, joined } = ensureRun()
        let result = await promise

        // Manual tap that joined a background run: retry if work remains
        if (!quiet && joined) {
          const remaining = await countPending(tid)
          if (remaining.pending > 0 && !result?.authRequired && !result?.offline) {
            ;({ promise } = ensureRun())
            result = await promise
          } else {
            await refresh()
          }
        }

        const remaining = await countPending(tid)
        if (!quiet) finishSyncMessage(result, remaining)

        if (result?.synced > 0 || !quiet) {
          window.dispatchEvent(
            new CustomEvent('rc-offline-synced', {
              detail: { ...result, remaining },
            }),
          )
        }
        return result
      } finally {
        if (!quiet) {
          syncUiDepth.current = Math.max(0, syncUiDepth.current - 1)
          if (syncUiDepth.current === 0) setSyncing(false)
        }
      }
    },
    [refresh, showMessage, finishSyncMessage, startSyncRun],
  )

  useEffect(() => {
    if (!OFFLINE_MODE) return undefined
    const stopMonitor = startConnectivityMonitor()

    const scheduleReconnectSync = () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      // Let health settle, then one quiet sync (avoid burst of overlapping kicks)
      reconnectTimer.current = setTimeout(() => {
        syncNow({ quiet: true })
      }, 800)
    }

    const unsub = subscribeConnectivity((state) => {
      setOnline(state.online)
      if (state.online && !wasOnline.current) {
        scheduleReconnectSync()
      }
      wasOnline.current = state.online
    })

    const tid = getTenantId()
    if (tid) {
      hydrateCaches(tid).then(refresh)
    }

    const interval = setInterval(() => {
      syncNow({ quiet: true })
    }, SYNC_INTERVAL_MS)

    const onVis = () => {
      if (document.visibilityState === 'visible') scheduleReconnectSync()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      stopMonitor()
      unsub()
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVis)
      if (msgTimer.current) clearTimeout(msgTimer.current)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [refresh, syncNow])

  const value = {
    enabled: OFFLINE_MODE,
    online,
    pending,
    failed,
    ops,
    authRequired,
    syncing,
    syncMessage,
    refresh,
    syncNow,
    hasPending: pending + failed > 0,
    panelOpen,
    setPanelOpen,
  }

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
}

export function useOffline() {
  return useContext(OfflineContext)
}
