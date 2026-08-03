/** Offline mode is off unless explicitly enabled. */
export const OFFLINE_MODE =
  String(import.meta.env.VITE_OFFLINE_MODE || '').toLowerCase() === 'true' ||
  String(import.meta.env.VITE_OFFLINE_MODE || '') === '1'

export const HEALTH_URL = '/health'
export const HEALTH_INTERVAL_MS = 20000
/** Background drain interval — keep quiet and infrequent while online */
export const SYNC_INTERVAL_MS = 30000
