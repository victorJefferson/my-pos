import { getOfflineDb } from './db'
import { getTenantId } from '../services/api'

export function newClientOpId() {
  return crypto.randomUUID()
}

function nowIso() {
  return new Date().toISOString()
}

export async function listPendingOps(tenantId = getTenantId()) {
  const db = getOfflineDb(tenantId)
  return db.pending_ops.orderBy('created_at').toArray()
}

export async function countPending(tenantId = getTenantId()) {
  const ops = await listPendingOps(tenantId)
  return {
    pending: ops.filter((o) => o.status === 'pending' || o.status === 'syncing').length,
    failed: ops.filter((o) => o.status === 'failed').length,
    total: ops.length,
  }
}

export async function enqueueOp({
  type,
  payload,
  localEntityId = null,
  dependsOn = [],
  clientOpId = null,
  tenantId = null,
}) {
  const tid = tenantId || getTenantId()
  const db = getOfflineDb(tid)
  const op = {
    client_op_id: clientOpId || newClientOpId(),
    tenant_id: tid,
    type,
    payload,
    local_entity_id: localEntityId,
    depends_on: dependsOn,
    status: 'pending',
    attempts: 0,
    last_error: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  await db.pending_ops.put(op)
  return op
}

export async function updatePendingOp(clientOpId, patch, tenantId = getTenantId()) {
  const db = getOfflineDb(tenantId)
  const existing = await db.pending_ops.get(clientOpId)
  if (!existing) return null
  if (existing.status === 'syncing') {
    throw new Error('Cannot edit op while syncing')
  }
  const next = { ...existing, ...patch, updated_at: nowIso() }
  await db.pending_ops.put(next)
  return next
}

export async function getPendingOp(clientOpId, tenantId = getTenantId()) {
  return getOfflineDb(tenantId).pending_ops.get(clientOpId)
}

export async function findCheckoutOpForSale(localSaleId, tenantId = getTenantId()) {
  const ops = await listPendingOps(tenantId)
  return (
    ops.find(
      (o) =>
        o.type === 'sale.checkout' &&
        (o.local_entity_id === localSaleId || o.payload?.client_sale_id === localSaleId),
    ) || null
  )
}

/**
 * Discard an unsynced checkout (and dependent ops). Restores optimistic stock/wallet.
 */
export async function discardPendingCheckout(clientOpId, tenantId = getTenantId()) {
  const db = getOfflineDb(tenantId)
  const op = await db.pending_ops.get(clientOpId)
  if (!op) return
  if (op.status === 'syncing') {
    throw new Error('Cannot discard while syncing — wait for sync to finish or fail')
  }
  if (op.type !== 'sale.checkout') {
    throw new Error('Not a checkout op')
  }

  const dependents = (await listPendingOps(tenantId)).filter(
    (o) => o.depends_on?.includes(clientOpId) || o.client_op_id === clientOpId,
  )

  await db.transaction(
    'rw',
    db.pending_ops,
    db.cache_sales,
    db.cache_products,
    db.cache_accounts,
    async () => {
      // Restore stock
      const items = op.payload?.items || []
      for (const item of items) {
        const product = await db.cache_products.get(item.product_id)
        if (product) {
          product.stock_quantity = (product.stock_quantity || 0) + item.quantity
          await db.cache_products.put(product)
        }
      }
      // Restore wallet
      const total = items.reduce(
        (s, i) => s + Number(i.unit_selling_price) * Number(i.quantity),
        0,
      )
      if (op.payload?.account_id) {
        const acc = await db.cache_accounts.get(op.payload.account_id)
        if (acc) {
          acc.balance = Number(acc.balance || 0) - total
          await db.cache_accounts.put(acc)
        }
      }
      // Remove provisional sale
      const localId = op.local_entity_id || op.payload?.client_sale_id
      if (localId) {
        await db.cache_sales.delete(localId)
        // also delete by client_sale_id index scan
        const sales = await db.cache_sales.where('client_sale_id').equals(localId).toArray()
        for (const s of sales) await db.cache_sales.delete(s.id)
      }
      for (const d of dependents) {
        await db.pending_ops.delete(d.client_op_id)
      }
      await db.pending_ops.delete(clientOpId)
    },
  )
}

export async function setIdMap(localId, serverId, entityType, tenantId = getTenantId()) {
  const db = getOfflineDb(tenantId)
  await db.id_map.put({
    local_id: String(localId),
    server_id: String(serverId),
    entity_type: entityType,
  })
}

export async function resolveId(localOrServerId, tenantId = getTenantId()) {
  if (!localOrServerId) return localOrServerId
  const db = getOfflineDb(tenantId)
  const row = await db.id_map.get(String(localOrServerId))
  return row?.server_id || localOrServerId
}

export async function rewritePayloadIds(payload, tenantId = getTenantId()) {
  if (!payload || typeof payload !== 'object') return payload
  const out = Array.isArray(payload) ? [...payload] : { ...payload }
  const mapKeys = [
    'product_id',
    'account_id',
    'from_account_id',
    'to_account_id',
    'sale_id',
    'item_id',
    'expense_id',
    'id',
  ]
  if (Array.isArray(out)) {
    return Promise.all(out.map((item) => rewritePayloadIds(item, tenantId)))
  }
  for (const k of mapKeys) {
    if (out[k]) out[k] = await resolveId(out[k], tenantId)
  }
  if (Array.isArray(out.items)) {
    out.items = await Promise.all(
      out.items.map(async (item) => ({
        ...item,
        product_id: await resolveId(item.product_id, tenantId),
      })),
    )
  }
  return out
}
