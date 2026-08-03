import Dexie from 'dexie'

/**
 * Per-tenant IndexedDB. Call getOfflineDb(tenantId) for the active store.
 */
const dbCache = new Map()

export function getOfflineDb(tenantId) {
  if (!tenantId) throw new Error('tenantId required for offline DB')
  const key = String(tenantId)
  if (dbCache.has(key)) return dbCache.get(key)

  const db = new Dexie(`rc_offline_${key}`)
  db.version(1).stores({
    cache_products: 'id, name, category, is_active',
    cache_sales: 'id, created_at, client_sale_id, pending',
    cache_expenses: 'id, created_at, pending',
    cache_accounts: 'id, name',
    pending_ops: 'client_op_id, created_at, status, type',
    id_map: 'local_id, entity_type, server_id',
    meta: 'key',
  })
  dbCache.set(key, db)
  return db
}

export async function clearTenantOfflineDb(tenantId) {
  const key = String(tenantId)
  const db = dbCache.get(key)
  if (db) {
    db.close()
    dbCache.delete(key)
  }
  await Dexie.delete(`rc_offline_${key}`)
}
