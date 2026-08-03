import { HEALTH_URL, HEALTH_INTERVAL_MS } from './config'

let online = typeof navigator !== 'undefined' ? navigator.onLine : true
let healthy = true
const listeners = new Set()

function emit() {
  const state = { online: online && healthy, rawOnline: online, healthy }
  listeners.forEach((fn) => {
    try {
      fn(state)
    } catch (_) {
      /* ignore */
    }
  })
}

/** Fresh read — Safari can lag on offline events; always check navigator. */
export function getConnectivity() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    online = false
    healthy = false
  }
  return { online: online && healthy, rawOnline: online, healthy }
}

export function markOffline(reason = 'network') {
  online = typeof navigator !== 'undefined' ? navigator.onLine : false
  healthy = false
  emit()
  return reason
}

export function subscribeConnectivity(fn) {
  listeners.add(fn)
  fn(getConnectivity())
  return () => listeners.delete(fn)
}

/**
 * True when the API never gave a real HTTP response (timeout, DNS, offline, CORS, etc.).
 */
export function isTransientNetworkError(err) {
  if (!err) return false
  if (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK') return true
  if (!err.response && err.message) {
    const m = String(err.message).toLowerCase()
    if (
      m.includes('timeout') ||
      m.includes('network') ||
      m.includes('offline') ||
      m.includes('failed to fetch')
    ) {
      return true
    }
  }
  const status = err.response?.status
  if (status === 502 || status === 503 || status === 504) return true
  return false
}

/**
 * True when we should queue the mutation instead of failing the cashier.
 * Local FastAPI can return 500 when Neon is unreachable while /health still passes.
 */
export function isQueueableOfflineError(err) {
  if (isTransientNetworkError(err)) return true
  const status = err?.response?.status
  if (!status) return true
  if (status === 502 || status === 503 || status === 504) return true
  // Backend up, DB dead — common when Wi‑Fi drops mid-request
  if (status === 500) return true
  return false
}

/** Prefer local queue immediately when the browser says offline. */
export function isBrowserOffline() {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

async function pingHealth() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    online = false
    healthy = false
    emit()
    return
  }
  online = true
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 3000)
    // Hit API root health via same-origin; still may pass without Neon.
    // Also try a tiny authenticated? No — keep public. Mutations use network-error fallback.
    const res = await fetch(HEALTH_URL, { signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(t)
    healthy = res.ok
  } catch {
    healthy = false
  }
  emit()
}

export function startConnectivityMonitor() {
  const onOnline = () => {
    online = true
    pingHealth()
  }
  const onOffline = () => {
    online = false
    healthy = false
    emit()
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  pingHealth()
  const interval = setInterval(pingHealth, HEALTH_INTERVAL_MS)
  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    clearInterval(interval)
  }
}
