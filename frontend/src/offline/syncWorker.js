import api, { getTenantId, productsApi, posApi, expensesApi, accountsApi } from '../services/api'
import { getOfflineDb } from './db'
import {
  listPendingOps,
  rewritePayloadIds,
  setIdMap,
  resolveId,
} from './outbox'
import { getConnectivity } from './connectivity'
import { getFreshToken } from '../tokenStore'
import { OFFLINE_MODE } from './config'
import { reapplyPendingCheckoutStock } from './mutations'

function parseError(err) {
  const detail = err?.response?.data?.detail
  if (detail && typeof detail === 'object') {
    return {
      code: detail.code || 'ERROR',
      message: detail.message || err.message,
      details: detail,
    }
  }
  if (typeof detail === 'string') {
    return { code: 'ERROR', message: detail }
  }
  return {
    code: err?.response?.status === 0 || !err?.response ? 'NETWORK' : 'ERROR',
    message: err?.message || 'Request failed',
  }
}

async function executeOp(op) {
  const headers = { 'Idempotency-Key': op.client_op_id }
  const payload = await rewritePayloadIds(op.payload, op.tenant_id)
  const tid = op.tenant_id

  switch (op.type) {
    case 'sale.checkout': {
      const res = await posApi.checkout(
        {
          ...payload,
          tenant_id: tid,
          client_sale_id: payload.client_sale_id || op.local_entity_id,
        },
        { headers },
      )
      const sale = res.data
      if (op.local_entity_id && sale?.id) {
        await setIdMap(op.local_entity_id, sale.id, 'sale', tid)
        if (payload.client_sale_id) {
          await setIdMap(payload.client_sale_id, sale.id, 'sale', tid)
        }
      }
      return sale
    }
    case 'sale.void': {
      const saleId = await resolveId(payload.sale_id, tid)
      await posApi.deleteSale(saleId, { headers, params: { tenant_id: tid } })
      return { status: 'deleted' }
    }
    case 'sale.item_qty': {
      const saleId = await resolveId(payload.sale_id, tid)
      const itemId = await resolveId(payload.item_id, tid)
      const res = await posApi.updateItemQty(saleId, itemId, payload.quantity, {
        headers,
        params: { tenant_id: tid },
      })
      return res.data
    }
    case 'sale.item_delete': {
      const saleId = await resolveId(payload.sale_id, tid)
      const itemId = await resolveId(payload.item_id, tid)
      await posApi.deleteItem(saleId, itemId, { headers, params: { tenant_id: tid } })
      return { status: 'deleted' }
    }
    case 'product.create': {
      const res = await productsApi.create(payload, {
        headers,
        params: { tenant_id: tid },
      })
      if (op.local_entity_id && res.data?.id) {
        await setIdMap(op.local_entity_id, res.data.id, 'product', tid)
      }
      return res.data
    }
    case 'product.update': {
      const id = await resolveId(payload.id, tid)
      const { id: _i, ...body } = payload
      const res = await productsApi.update(id, body, {
        headers,
        params: { tenant_id: tid },
      })
      return res.data
    }
    case 'product.delete': {
      const id = await resolveId(payload.id, tid)
      await productsApi.delete(id, { headers, params: { tenant_id: tid } })
      return { status: 'deleted' }
    }
    case 'expense.create': {
      const res = await expensesApi.create(payload, {
        headers,
        params: { tenant_id: tid },
      })
      if (op.local_entity_id && res.data?.id) {
        await setIdMap(op.local_entity_id, res.data.id, 'expense', tid)
      }
      return res.data
    }
    case 'expense.delete': {
      const id = await resolveId(payload.id, tid)
      await expensesApi.delete(id, { headers, params: { tenant_id: tid } })
      return { status: 'deleted' }
    }
    case 'account.create': {
      const res = await accountsApi.create(payload, {
        headers,
        params: { tenant_id: tid },
      })
      if (op.local_entity_id && res.data?.id) {
        await setIdMap(op.local_entity_id, res.data.id, 'account', tid)
      }
      return res.data
    }
    case 'account.update': {
      const id = await resolveId(payload.id, tid)
      const { id: _i, ...body } = payload
      const res = await accountsApi.update(id, body, {
        headers,
        params: { tenant_id: tid },
      })
      return res.data
    }
    case 'account.delete': {
      const id = await resolveId(payload.id, tid)
      await accountsApi.delete(id, { headers, params: { tenant_id: tid } })
      return { status: 'deleted' }
    }
    case 'account.transfer': {
      const res = await accountsApi.transfer(payload, {
        headers,
        params: { tenant_id: tid },
      })
      return res.data
    }
    case 'account.deposit': {
      const res = await accountsApi.deposit(payload, {
        headers,
        params: { tenant_id: tid },
      })
      return res.data
    }
    default:
      throw new Error(`Unknown op type: ${op.type}`)
  }
}

async function patchCachesAfterOp(op, result) {
  const db = getOfflineDb(op.tenant_id)
  if (op.type === 'sale.checkout' && result?.id) {
    const localId = op.local_entity_id
    if (localId) await db.cache_sales.delete(localId)
    await db.cache_sales.put({
      ...result,
      pending: false,
      client_sale_id: op.payload?.client_sale_id || result.client_sale_id,
    })
  }
  if (op.type === 'product.create' && result?.id) {
    if (op.local_entity_id) await db.cache_products.delete(op.local_entity_id)
    await db.cache_products.put({ ...result, pending: false })
  }
  if (op.type === 'expense.create' && result?.id) {
    if (op.local_entity_id) await db.cache_expenses.delete(op.local_entity_id)
    await db.cache_expenses.put({ ...result, pending: false })
  }
  if (op.type === 'account.create' && result?.id) {
    if (op.local_entity_id) await db.cache_accounts.delete(op.local_entity_id)
    await db.cache_accounts.put({ ...result, pending: false })
  }
}

/**
 * Drain pending_ops FIFO with Web Locks so only one tab syncs.
 * Concurrent callers in this tab await the same in-flight drain (never a fake empty result).
 */
let drainInFlight = null

export async function drainOutbox(tenantId = getTenantId()) {
  if (!OFFLINE_MODE || !tenantId) return { synced: 0, failed: 0 }
  // Only hard-stop when the browser itself is offline. A flaky /health ping
  // must not block Sync — executeOp will fail soft and leave ops pending.
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, failed: 0, offline: true }
  }

  if (drainInFlight) return drainInFlight

  const run = async () => {
    let synced = 0
    let failed = 0
    try {
      const token = await getFreshToken({ skipCache: true })
      if (!token) {
        return { synced: 0, failed: 0, authRequired: true }
      }

      const db = getOfflineDb(tenantId)

      // Crash / reload can leave ops stuck in "syncing" — reclaim them
      const stuck = await db.pending_ops.where('status').equals('syncing').toArray()
      for (const op of stuck) {
        await db.pending_ops.update(op.client_op_id, {
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
      }

      const ops = await listPendingOps(tenantId)
      const opsById = new Map(ops.map((o) => [o.client_op_id, o]))
      const done = new Set()
      const failedIds = new Set()

      for (const op of ops) {
        // Re-read after reclaim
        const current = (await db.pending_ops.get(op.client_op_id)) || op
        if (current.status === 'failed') {
          failedIds.add(op.client_op_id)
          failed += 1
          continue
        }
        const deps = op.depends_on || []
        if (deps.some((d) => failedIds.has(d) || opsById.get(d)?.status === 'failed')) {
          await db.pending_ops.update(op.client_op_id, {
            status: 'failed',
            last_error: {
              code: 'DEPENDENCY_NOT_SYNCED',
              message: 'A related operation failed',
            },
            updated_at: new Date().toISOString(),
          })
          failedIds.add(op.client_op_id)
          failed += 1
          continue
        }
        // Deps still in the queue and not yet done this pass → wait
        const blocking = deps.filter((d) => opsById.has(d) && !done.has(d))
        if (blocking.length) {
          continue
        }

        await db.pending_ops.update(op.client_op_id, {
          status: 'syncing',
          updated_at: new Date().toISOString(),
        })

        try {
          const result = await executeOp(op)
          await patchCachesAfterOp(op, result)
          await db.pending_ops.delete(op.client_op_id)
          done.add(op.client_op_id)
          synced += 1
        } catch (err) {
          const status = err?.response?.status
          // Idempotent delete already gone
          if (status === 404 && String(op.type).includes('delete')) {
            await db.pending_ops.delete(op.client_op_id)
            done.add(op.client_op_id)
            synced += 1
            continue
          }
          const parsed = parseError(err)
          const isConflict =
            parsed.code === 'STOCK_INSUFFICIENT' ||
            parsed.code === 'PRODUCT_MISSING' ||
            parsed.code === 'ACCOUNT_MISSING' ||
            parsed.code === 'BALANCE_INSUFFICIENT' ||
            parsed.code === 'ACCOUNT_MODE_MISMATCH' ||
            (status >= 400 && status < 500 && status !== 401 && status !== 408)

          if (isConflict) {
            await db.pending_ops.update(op.client_op_id, {
              status: 'failed',
              attempts: (op.attempts || 0) + 1,
              last_error: parsed,
              updated_at: new Date().toISOString(),
            })
            failedIds.add(op.client_op_id)
            failed += 1
          } else {
            // Network / 5xx — leave pending and stop this pass
            await db.pending_ops.update(op.client_op_id, {
              status: 'pending',
              attempts: (op.attempts || 0) + 1,
              last_error: parsed,
              updated_at: new Date().toISOString(),
            })
            break
          }
        }
      }
      return { synced, failed }
    } catch (err) {
      console.warn('[offline] drainOutbox failed', err)
      return { synced, failed, error: err?.message || 'Sync failed' }
    }
  }

  const start = () => {
    if (navigator.locks?.request) {
      return navigator.locks.request('rc-offline-sync', run)
    }
    return run()
  }

  drainInFlight = start().finally(() => {
    drainInFlight = null
  })
  return drainInFlight
}

export async function hydrateCaches(tenantId = getTenantId()) {
  if (!OFFLINE_MODE || !tenantId) return
  const { online } = getConnectivity()
  if (!online) return

  const db = getOfflineDb(tenantId)
  try {
    const [products, sales, expenses, accounts] = await Promise.all([
      productsApi.list(),
      posApi.recentSales(null, 100),
      expensesApi.list({ limit: 100 }),
      accountsApi.list(),
    ])

    await db.transaction(
      'rw',
      db.cache_products,
      db.cache_sales,
      db.cache_expenses,
      db.cache_accounts,
      db.meta,
      async () => {
        // Don't wipe pending local rows
        const pendingSales = await db.cache_sales.filter((s) => s.pending).toArray()
        const pendingProducts = await db.cache_products.filter((p) => p.pending).toArray()
        const pendingExpenses = await db.cache_expenses.filter((e) => e.pending).toArray()
        const pendingAccounts = await db.cache_accounts.filter((a) => a.pending).toArray()

        await db.cache_products.clear()
        await db.cache_sales.clear()
        await db.cache_expenses.clear()
        await db.cache_accounts.clear()

        await db.cache_products.bulkPut((products.data || []).map((p) => ({ ...p, pending: false })))
        await db.cache_sales.bulkPut((sales.data || []).map((s) => ({ ...s, pending: false })))
        await db.cache_expenses.bulkPut((expenses.data || []).map((e) => ({ ...e, pending: false })))
        await db.cache_accounts.bulkPut((accounts.data || []).map((a) => ({ ...a, pending: false })))

        if (pendingSales.length) await db.cache_sales.bulkPut(pendingSales)
        if (pendingProducts.length) await db.cache_products.bulkPut(pendingProducts)
        if (pendingExpenses.length) await db.cache_expenses.bulkPut(pendingExpenses)
        if (pendingAccounts.length) await db.cache_accounts.bulkPut(pendingAccounts)

        // Server catalog doesn't include stock for queued offline bills
        await reapplyPendingCheckoutStock(db)

        await db.meta.put({ key: 'last_sync_at', value: new Date().toISOString() })
      },
    )
  } catch (err) {
    console.warn('[offline] hydrateCaches failed', err)
  }
}

// Silence unused import warning if tree-shaken oddly
void api
