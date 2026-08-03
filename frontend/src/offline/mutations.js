import {
  productsApi as rawProducts,
  posApi as rawPos,
  expensesApi as rawExpenses,
  accountsApi as rawAccounts,
  getTenantId,
} from '../services/api'
import { OFFLINE_MODE } from './config'
import { getConnectivity, isQueueableOfflineError, markOffline, isBrowserOffline } from './connectivity'
import { getOfflineDb } from './db'
import {
  enqueueOp,
  newClientOpId,
  discardPendingCheckout,
  updatePendingOp,
  findCheckoutOpForSale,
} from './outbox'

function withIdempotency(extra = {}) {
  const id = extra.idempotencyKey || newClientOpId()
  const { idempotencyKey: _key, timeout, headers, ...rest } = extra
  return {
    clientOpId: id,
    config: {
      ...rest,
      headers: { ...(headers || {}), 'Idempotency-Key': id },
      // Fail faster when the link is dead so we can queue offline
      timeout: timeout ?? 8000,
    },
  }
}

function shouldAttemptOnline() {
  if (!OFFLINE_MODE) return true
  if (isBrowserOffline()) return false
  return getConnectivity().online
}

async function applyOptimisticStock(db, items, sign) {
  for (const item of items || []) {
    const product = await db.cache_products.get(item.product_id)
    if (product) {
      product.stock_quantity =
        (product.stock_quantity || 0) + sign * Number(item.quantity)
      await db.cache_products.put(product)
    }
  }
}

/**
 * After replacing cache_products with server rows, re-apply stock for
 * checkouts that are still queued locally (not yet on the server).
 */
export async function reapplyPendingCheckoutStock(db) {
  const pendingSales = await db.cache_sales.filter((s) => s.pending).toArray()
  const applied = new Set()
  for (const sale of pendingSales) {
    await applyOptimisticStock(db, sale.items || [], -1)
    if (sale.id) applied.add(sale.id)
    if (sale.client_sale_id) applied.add(sale.client_sale_id)
  }
  const ops = await db.pending_ops.where('type').equals('sale.checkout').toArray()
  for (const op of ops) {
    if (op.status === 'synced') continue
    if (applied.has(op.local_entity_id) || applied.has(op.client_op_id)) continue
    await applyOptimisticStock(db, op.payload?.items || [], -1)
  }
}

/** Patch in-memory product lists after a sale (or restore). */
export function patchProductsStock(products, items, sign = -1) {
  if (!products?.length || !items?.length) return products
  const deltas = new Map()
  for (const item of items) {
    const id = item.product_id
    if (!id) continue
    deltas.set(id, (deltas.get(id) || 0) + Number(item.quantity || 0))
  }
  if (deltas.size === 0) return products
  return products.map((p) => {
    const qty = deltas.get(p.id)
    if (!qty) return p
    return {
      ...p,
      stock_quantity: Math.max(0, Number(p.stock_quantity || 0) + sign * qty),
    }
  })
}

async function applyOptimisticWallet(db, accountId, delta) {
  if (!accountId) return
  const acc = await db.cache_accounts.get(accountId)
  if (acc) {
    acc.balance = Number(acc.balance || 0) + delta
    await db.cache_accounts.put(acc)
  }
}

function cartTotal(items) {
  return (items || []).reduce(
    (s, i) => s + Number(i.unit_selling_price) * Number(i.quantity),
    0,
  )
}

/**
 * Resolve account_id for a payment mode from cached accounts.
 */
export async function resolveAccountIdForMode(paymentMode, tenantId = getTenantId()) {
  const db = getOfflineDb(tenantId)
  const accounts = await db.cache_accounts.toArray()
  const match = accounts.find((a) => (a.payment_modes || []).includes(paymentMode))
  return match?.id || null
}

async function enqueueCheckoutLocal(tenantId, body, clientSaleId, accountId) {
  const db = getOfflineDb(tenantId)
  const localId = clientSaleId
  const items = body.items || []
  const total = cartTotal(items)

  const enrichedItems = []
  for (const i of items) {
    const product = await db.cache_products.get(i.product_id)
    enrichedItems.push({
      id: newClientOpId(),
      product_id: i.product_id,
      product_name: product?.name || null,
      quantity: i.quantity,
      unit_selling_price: i.unit_selling_price,
      unit_cost_price: i.unit_cost_price || 0,
      total_price: Number(i.unit_selling_price) * Number(i.quantity),
      total_profit:
        (Number(i.unit_selling_price) - Number(i.unit_cost_price || 0)) * Number(i.quantity),
    })
  }

  const provisional = {
    id: localId,
    tenant_id: tenantId,
    invoice_number: null,
    total_amount: total,
    total_cost: enrichedItems.reduce(
      (s, i) => s + Number(i.unit_cost_price || 0) * Number(i.quantity),
      0,
    ),
    total_profit: enrichedItems.reduce((s, i) => s + Number(i.total_profit || 0), 0),
    payment_mode: body.payment_mode,
    cashier_id: null,
    created_at: new Date().toISOString(),
    client_sale_id: clientSaleId,
    pending: true,
    items: enrichedItems,
  }

  const op = await enqueueOp({
    type: 'sale.checkout',
    payload: body,
    localEntityId: localId,
    clientOpId: clientSaleId,
    tenantId,
  })

  await applyOptimisticStock(db, items, -1)
  await applyOptimisticWallet(db, accountId, total)
  await db.cache_sales.put(provisional)

  return { data: provisional, offline: true, clientOpId: op.client_op_id }
}

export async function offlineCheckout(payload) {
  const tenantId = getTenantId()
  const clientSaleId = payload.client_sale_id || newClientOpId()
  const accountId =
    payload.account_id || (await resolveAccountIdForMode(payload.payment_mode, tenantId))
  const body = {
    ...payload,
    client_sale_id: clientSaleId,
    account_id: accountId || undefined,
  }

  if (shouldAttemptOnline()) {
    const { clientOpId, config } = withIdempotency({ idempotencyKey: clientSaleId })
    try {
      const res = await rawPos.checkout(
        { ...body, client_sale_id: clientSaleId },
        config,
      )
      if (OFFLINE_MODE) {
        const db = getOfflineDb(tenantId)
        await db.cache_sales.put({ ...res.data, pending: false })
        // Keep local catalog in sync until the next hydrate/list refresh
        await applyOptimisticStock(db, body.items, -1)
      }
      return { data: res.data, offline: false, clientOpId }
    } catch (err) {
      if (OFFLINE_MODE && isQueueableOfflineError(err)) {
        markOffline('checkout-timeout')
        return enqueueCheckoutLocal(tenantId, body, clientSaleId, accountId)
      }
      throw err
    }
  }

  return enqueueCheckoutLocal(tenantId, body, clientSaleId, accountId)
}

export async function editUnsyncedCheckout(clientOpId, nextPayload) {
  const tenantId = getTenantId()
  const db = getOfflineDb(tenantId)
  const op = await db.pending_ops.get(clientOpId)
  if (!op || op.type !== 'sale.checkout') throw new Error('Checkout op not found')
  if (op.status === 'syncing') throw new Error('Cannot edit while syncing')

  const oldItems = op.payload?.items || []
  const newItems = nextPayload.items || []
  const oldTotal = cartTotal(oldItems)
  const newTotal = cartTotal(newItems)
  const accountId =
    nextPayload.account_id ||
    op.payload.account_id ||
    (await resolveAccountIdForMode(nextPayload.payment_mode || op.payload.payment_mode))

  // Reverse old optimistic, apply new
  await applyOptimisticStock(db, oldItems, +1)
  await applyOptimisticWallet(db, op.payload.account_id, -oldTotal)
  await applyOptimisticStock(db, newItems, -1)
  await applyOptimisticWallet(db, accountId, newTotal)

  const payload = {
    ...op.payload,
    ...nextPayload,
    client_sale_id: op.payload.client_sale_id,
    account_id: accountId,
  }
  await updatePendingOp(clientOpId, { payload, status: 'pending', last_error: null }, tenantId)

  const localId = op.local_entity_id
  const sale = await db.cache_sales.get(localId)
  if (sale) {
    await db.cache_sales.put({
      ...sale,
      ...payload,
      total_amount: newTotal,
      payment_mode: payload.payment_mode,
      items: newItems.map((i) => ({
        id: i.id || newClientOpId(),
        product_id: i.product_id,
        quantity: i.quantity,
        unit_selling_price: i.unit_selling_price,
        unit_cost_price: i.unit_cost_price || 0,
        total_price: Number(i.unit_selling_price) * Number(i.quantity),
        total_profit: 0,
      })),
      pending: true,
    })
  }
  return payload
}

export { discardPendingCheckout, findCheckoutOpForSale }

export async function offlineVoidSale(saleId) {
  const tenantId = getTenantId()
  const checkoutOp = await findCheckoutOpForSale(saleId, tenantId)
  if (checkoutOp && (checkoutOp.status === 'pending' || checkoutOp.status === 'failed')) {
    await discardPendingCheckout(checkoutOp.client_op_id, tenantId)
    return { offline: true, discarded: true }
  }

  const { online } = getConnectivity()
  const { clientOpId, config } = withIdempotency()
  if (!OFFLINE_MODE || online) {
    await rawPos.deleteSale(saleId, config)
    if (OFFLINE_MODE) {
      const db = getOfflineDb(tenantId)
      await db.cache_sales.delete(saleId)
    }
    return { offline: false, clientOpId }
  }

  await enqueueOp({
    type: 'sale.void',
    payload: { sale_id: saleId },
    clientOpId,
    tenantId,
    dependsOn: checkoutOp ? [checkoutOp.client_op_id] : [],
  })
  const db = getOfflineDb(tenantId)
  const sale = await db.cache_sales.get(saleId)
  if (sale) {
    for (const item of sale.items || []) {
      await applyOptimisticStock(db, [item], +1)
    }
    // wallet reverse best-effort via payment mode account
    const accId = await resolveAccountIdForMode(sale.payment_mode, tenantId)
    await applyOptimisticWallet(db, accId, -Number(sale.total_amount || 0))
    await db.cache_sales.delete(saleId)
  }
  return { offline: true, clientOpId }
}

export async function offlineProductCreate(data) {
  const tenantId = getTenantId()
  const { online } = getConnectivity()
  const { clientOpId, config } = withIdempotency()
  if (!OFFLINE_MODE || online) {
    const res = await rawProducts.create(data, config)
    if (OFFLINE_MODE) {
      await getOfflineDb(tenantId).cache_products.put({ ...res.data, pending: false })
    }
    return { data: res.data, offline: false }
  }
  const localId = newClientOpId()
  const provisional = {
    id: localId,
    tenant_id: tenantId,
    ...data,
    is_active: true,
    is_low_stock: (data.stock_quantity || 0) <= 10,
    created_at: new Date().toISOString(),
    pending: true,
  }
  await enqueueOp({
    type: 'product.create',
    payload: data,
    localEntityId: localId,
    clientOpId,
    tenantId,
  })
  await getOfflineDb(tenantId).cache_products.put(provisional)
  return { data: provisional, offline: true, clientOpId }
}

export async function offlineProductUpdate(id, data) {
  const tenantId = getTenantId()
  const { clientOpId, config } = withIdempotency()

  const enqueueLocal = async () => {
    await enqueueOp({
      type: 'product.update',
      payload: { id, ...data },
      clientOpId,
      tenantId,
    })
    const db = getOfflineDb(tenantId)
    const existing = (await db.cache_products.get(id)) || { id }
    await db.cache_products.put({ ...existing, ...data, pending: true })
    return { data: { ...existing, ...data }, offline: true, clientOpId }
  }

  if (shouldAttemptOnline()) {
    try {
      const res = await rawProducts.update(id, data, config)
      if (OFFLINE_MODE) {
        await getOfflineDb(tenantId).cache_products.put({ ...res.data, pending: false })
      }
      return { data: res.data, offline: false }
    } catch (err) {
      if (OFFLINE_MODE && isQueueableOfflineError(err)) {
        markOffline('product-update-timeout')
        return enqueueLocal()
      }
      throw err
    }
  }
  return enqueueLocal()
}

export async function offlineProductDelete(id) {
  const tenantId = getTenantId()
  const { online } = getConnectivity()
  const { clientOpId, config } = withIdempotency()
  if (!OFFLINE_MODE || online) {
    await rawProducts.delete(id, config)
    if (OFFLINE_MODE) {
      const db = getOfflineDb(tenantId)
      const p = await db.cache_products.get(id)
      if (p) await db.cache_products.put({ ...p, is_active: false, pending: false })
    }
    return { offline: false }
  }
  await enqueueOp({
    type: 'product.delete',
    payload: { id },
    clientOpId,
    tenantId,
  })
  const db = getOfflineDb(tenantId)
  const p = await db.cache_products.get(id)
  if (p) await db.cache_products.put({ ...p, is_active: false, pending: true })
  return { offline: true, clientOpId }
}

export async function offlineExpenseCreate(data) {
  const tenantId = getTenantId()
  const { clientOpId, config } = withIdempotency()

  const enqueueLocal = async () => {
    const localId = newClientOpId()
    const provisional = {
      id: localId,
      tenant_id: tenantId,
      ...data,
      created_at: new Date().toISOString(),
      pending: true,
    }
    await enqueueOp({
      type: 'expense.create',
      payload: data,
      localEntityId: localId,
      clientOpId,
      tenantId,
    })
    const db = getOfflineDb(tenantId)
    if (data.account_id) {
      await applyOptimisticWallet(db, data.account_id, -Number(data.amount || 0))
    }
    await db.cache_expenses.put(provisional)
    return { data: provisional, offline: true, clientOpId }
  }

  if (shouldAttemptOnline()) {
    try {
      const res = await rawExpenses.create(data, config)
      if (OFFLINE_MODE) {
        await getOfflineDb(tenantId).cache_expenses.put({ ...res.data, pending: false })
      }
      return { data: res.data, offline: false }
    } catch (err) {
      if (OFFLINE_MODE && isQueueableOfflineError(err)) {
        markOffline('expense-timeout')
        return enqueueLocal()
      }
      throw err
    }
  }
  return enqueueLocal()
}

export async function offlineExpenseDelete(id) {
  const tenantId = getTenantId()
  const { online } = getConnectivity()
  const { clientOpId, config } = withIdempotency()
  if (!OFFLINE_MODE || online) {
    await rawExpenses.delete(id, config)
    if (OFFLINE_MODE) await getOfflineDb(tenantId).cache_expenses.delete(id)
    return { offline: false }
  }
  const db = getOfflineDb(tenantId)
  const exp = await db.cache_expenses.get(id)
  await enqueueOp({
    type: 'expense.delete',
    payload: { id },
    clientOpId,
    tenantId,
  })
  if (exp?.account_id) {
    await applyOptimisticWallet(db, exp.account_id, Number(exp.amount || 0))
  }
  await db.cache_expenses.delete(id)
  return { offline: true, clientOpId }
}

export async function offlineAccountCreate(data) {
  const tenantId = getTenantId()
  const { online } = getConnectivity()
  const { clientOpId, config } = withIdempotency()
  if (!OFFLINE_MODE || online) {
    const res = await rawAccounts.create(data, config)
    if (OFFLINE_MODE) await getOfflineDb(tenantId).cache_accounts.put({ ...res.data, pending: false })
    return { data: res.data, offline: false }
  }
  const localId = newClientOpId()
  const provisional = {
    id: localId,
    tenant_id: tenantId,
    balance: 0,
    ...data,
    created_at: new Date().toISOString(),
    pending: true,
  }
  await enqueueOp({
    type: 'account.create',
    payload: data,
    localEntityId: localId,
    clientOpId,
    tenantId,
  })
  await getOfflineDb(tenantId).cache_accounts.put(provisional)
  return { data: provisional, offline: true, clientOpId }
}

export async function offlineAccountUpdate(id, data) {
  const tenantId = getTenantId()
  const { online } = getConnectivity()
  const { clientOpId, config } = withIdempotency()
  if (!OFFLINE_MODE || online) {
    const res = await rawAccounts.update(id, data, config)
    if (OFFLINE_MODE) await getOfflineDb(tenantId).cache_accounts.put({ ...res.data, pending: false })
    return { data: res.data, offline: false }
  }
  await enqueueOp({
    type: 'account.update',
    payload: { id, ...data },
    clientOpId,
    tenantId,
  })
  const db = getOfflineDb(tenantId)
  const existing = (await db.cache_accounts.get(id)) || { id }
  await db.cache_accounts.put({ ...existing, ...data, pending: true })
  return { data: { ...existing, ...data }, offline: true }
}

export async function offlineAccountDelete(id) {
  const tenantId = getTenantId()
  const { online } = getConnectivity()
  const { clientOpId, config } = withIdempotency()
  if (!OFFLINE_MODE || online) {
    await rawAccounts.delete(id, config)
    if (OFFLINE_MODE) await getOfflineDb(tenantId).cache_accounts.delete(id)
    return { offline: false }
  }
  await enqueueOp({
    type: 'account.delete',
    payload: { id },
    clientOpId,
    tenantId,
  })
  await getOfflineDb(tenantId).cache_accounts.delete(id)
  return { offline: true }
}

export async function offlineTransfer(data) {
  const tenantId = getTenantId()
  const { clientOpId, config } = withIdempotency()

  const enqueueLocal = async () => {
    await enqueueOp({
      type: 'account.transfer',
      payload: data,
      clientOpId,
      tenantId,
    })
    const db = getOfflineDb(tenantId)
    await applyOptimisticWallet(db, data.from_account_id, -Number(data.amount))
    await applyOptimisticWallet(db, data.to_account_id, Number(data.amount))
    return { offline: true, clientOpId }
  }

  if (shouldAttemptOnline()) {
    try {
      const res = await rawAccounts.transfer(data, config)
      return { data: res.data, offline: false }
    } catch (err) {
      if (OFFLINE_MODE && isQueueableOfflineError(err)) {
        markOffline('transfer-error')
        return enqueueLocal()
      }
      throw err
    }
  }
  return enqueueLocal()
}

export async function offlineDeposit(data) {
  const tenantId = getTenantId()
  const { clientOpId, config } = withIdempotency()

  const enqueueLocal = async () => {
    await enqueueOp({
      type: 'account.deposit',
      payload: data,
      clientOpId,
      tenantId,
    })
    await applyOptimisticWallet(
      getOfflineDb(tenantId),
      data.account_id,
      Number(data.amount),
    )
    return { offline: true, clientOpId }
  }

  if (shouldAttemptOnline()) {
    try {
      const res = await rawAccounts.deposit(data, config)
      return { data: res.data, offline: false }
    } catch (err) {
      if (OFFLINE_MODE && isQueueableOfflineError(err)) {
        markOffline('deposit-timeout')
        return enqueueLocal()
      }
      throw err
    }
  }
  return enqueueLocal()
}

export async function offlineUpdateItemQty(saleId, itemId, quantity) {
  const tenantId = getTenantId()
  const checkoutOp = await findCheckoutOpForSale(saleId, tenantId)
  if (checkoutOp && (checkoutOp.status === 'pending' || checkoutOp.status === 'failed')) {
    const items = (checkoutOp.payload.items || []).map((i) =>
      String(i.id) === String(itemId) || String(i._local_item_id) === String(itemId)
        ? { ...i, quantity }
        : i,
    )
    // Prefer match by product line — TransactionsPage uses server item ids
    const sale = await getOfflineDb(tenantId).cache_sales.get(saleId)
    let nextItems = checkoutOp.payload.items || []
    if (sale?.items) {
      const target = sale.items.find((i) => String(i.id) === String(itemId))
      if (target) {
        nextItems = nextItems.map((i) =>
          String(i.product_id) === String(target.product_id) &&
          Number(i.quantity) === Number(target.quantity)
            ? { ...i, quantity }
            : i,
        )
        // If still unchanged, map by product_id only once
        if (JSON.stringify(nextItems) === JSON.stringify(checkoutOp.payload.items)) {
          let replaced = false
          nextItems = nextItems.map((i) => {
            if (!replaced && String(i.product_id) === String(target.product_id)) {
              replaced = true
              return { ...i, quantity }
            }
            return i
          })
        }
      } else {
        nextItems = items
      }
    }
    await editUnsyncedCheckout(checkoutOp.client_op_id, {
      ...checkoutOp.payload,
      items: nextItems,
    })
    return { offline: true, local: true }
  }

  const { online } = getConnectivity()
  const { clientOpId, config } = withIdempotency()
  if (!OFFLINE_MODE || online) {
    const res = await rawPos.updateItemQty(saleId, itemId, quantity, config)
    return { data: res.data, offline: false }
  }
  await enqueueOp({
    type: 'sale.item_qty',
    payload: { sale_id: saleId, item_id: itemId, quantity },
    clientOpId,
    tenantId,
  })
  return { offline: true, clientOpId }
}

export async function offlineDeleteItem(saleId, itemId) {
  const tenantId = getTenantId()
  const checkoutOp = await findCheckoutOpForSale(saleId, tenantId)
  if (checkoutOp && (checkoutOp.status === 'pending' || checkoutOp.status === 'failed')) {
    const sale = await getOfflineDb(tenantId).cache_sales.get(saleId)
    const target = sale?.items?.find((i) => String(i.id) === String(itemId))
    let nextItems = checkoutOp.payload.items || []
    if (target) {
      let removed = false
      nextItems = nextItems.filter((i) => {
        if (
          !removed &&
          String(i.product_id) === String(target.product_id) &&
          Number(i.quantity) === Number(target.quantity)
        ) {
          removed = true
          return false
        }
        return true
      })
    }
    if (!nextItems.length) {
      await discardPendingCheckout(checkoutOp.client_op_id, tenantId)
      return { offline: true, discarded: true }
    }
    await editUnsyncedCheckout(checkoutOp.client_op_id, {
      ...checkoutOp.payload,
      items: nextItems,
    })
    return { offline: true, local: true }
  }

  const { online } = getConnectivity()
  const { clientOpId, config } = withIdempotency()
  if (!OFFLINE_MODE || online) {
    await rawPos.deleteItem(saleId, itemId, config)
    return { offline: false }
  }
  await enqueueOp({
    type: 'sale.item_delete',
    payload: { sale_id: saleId, item_id: itemId },
    clientOpId,
    tenantId,
  })
  return { offline: true, clientOpId }
}

/** List products preferring cache when offline. */
export async function listProductsCached(params = {}) {
  const tenantId = getTenantId()
  const { online } = getConnectivity()
  if (!OFFLINE_MODE || online) {
    try {
      const res = await rawProducts.list(params)
      if (OFFLINE_MODE) {
        const db = getOfflineDb(tenantId)
        // merge without wiping pending product creates/edits
        for (const p of res.data || []) {
          const existing = await db.cache_products.get(p.id)
          if (!existing?.pending) await db.cache_products.put({ ...p, pending: false })
        }
        // Server stock ignores queued checkouts — re-apply local deductions
        await reapplyPendingCheckoutStock(db)
        let rows = await db.cache_products.toArray()
        if (params.active_only !== false) rows = rows.filter((p) => p.is_active !== false)
        if (params.search) {
          const q = String(params.search).toLowerCase()
          rows = rows.filter((p) => (p.name || '').toLowerCase().includes(q))
        }
        if (params.category) rows = rows.filter((p) => p.category === params.category)
        return rows
      }
      return res.data
    } catch (err) {
      if (!OFFLINE_MODE) throw err
    }
  }
  const db = getOfflineDb(tenantId)
  let rows = await db.cache_products.toArray()
  if (params.active_only !== false) rows = rows.filter((p) => p.is_active !== false)
  if (params.search) {
    const q = String(params.search).toLowerCase()
    rows = rows.filter((p) => (p.name || '').toLowerCase().includes(q))
  }
  if (params.category) rows = rows.filter((p) => p.category === params.category)
  return rows
}

async function enrichSalesWithProductNames(tenantId, sales) {
  const db = getOfflineDb(tenantId)
  const out = []
  for (const sale of sales || []) {
    if (!sale?.items?.length) {
      out.push(sale)
      continue
    }
    const items = []
    let changed = false
    for (const item of sale.items) {
      if (item.product_name) {
        items.push(item)
        continue
      }
      const product = await db.cache_products.get(item.product_id)
      if (product?.name) {
        items.push({ ...item, product_name: product.name })
        changed = true
      } else {
        items.push(item)
      }
    }
    const next = changed ? { ...sale, items } : sale
    if (changed && sale.pending) {
      await db.cache_sales.put(next)
    }
    out.push(next)
  }
  return out
}

export async function listSalesCached(targetDate = null, limit = 50) {
  const tenantId = getTenantId()
  const { online } = getConnectivity()
  if (!OFFLINE_MODE || online) {
    try {
      const res = await rawPos.recentSales(targetDate, limit)
      if (OFFLINE_MODE) {
        const db = getOfflineDb(tenantId)
        for (const s of res.data || []) {
          const existing = await db.cache_sales.get(s.id)
          if (!existing?.pending) await db.cache_sales.put({ ...s, pending: false })
        }
      }
      // Merge pending
      if (OFFLINE_MODE) {
        const pending = await getOfflineDb(tenantId).cache_sales.filter((s) => s.pending).toArray()
        const serverIds = new Set((res.data || []).map((s) => s.id))
        const merged = [...pending.filter((p) => !serverIds.has(p.id)), ...(res.data || [])]
        return enrichSalesWithProductNames(tenantId, merged)
      }
      return res.data
    } catch (err) {
      if (!OFFLINE_MODE) throw err
    }
  }
  let rows = await getOfflineDb(tenantId).cache_sales.orderBy('created_at').reverse().toArray()
  if (targetDate) {
    rows = rows.filter((s) => String(s.created_at || '').startsWith(targetDate))
  } else {
    rows = rows.slice(0, limit)
  }
  return enrichSalesWithProductNames(tenantId, rows)
}

export async function listExpensesCached(params = {}) {
  const tenantId = getTenantId()
  const { online } = getConnectivity()

  const applyLocalFilters = (rows) => {
    let out = rows || []
    if (params.category) {
      out = out.filter((e) => e.category === params.category)
    }
    if (params.start_date) {
      out = out.filter((e) => String(e.created_at || '').slice(0, 10) >= params.start_date)
    }
    if (params.end_date) {
      out = out.filter((e) => String(e.created_at || '').slice(0, 10) <= params.end_date)
    }
    // Never mix in sales/deposits — expenses cache only; drop malformed rows
    out = out.filter((e) => e && e.category != null && e.amount != null && !e.invoice_number)
    out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    if (params.limit) out = out.slice(0, params.limit)
    return out
  }

  if (!OFFLINE_MODE || online) {
    try {
      const res = await rawExpenses.list(params)
      if (OFFLINE_MODE) {
        const pending = await getOfflineDb(tenantId)
          .cache_expenses.filter((e) => e.pending)
          .toArray()
        const serverIds = new Set((res.data || []).map((e) => e.id))
        return applyLocalFilters([
          ...pending.filter((p) => !serverIds.has(p.id)),
          ...(res.data || []),
        ])
      }
      return res.data
    } catch (err) {
      if (!OFFLINE_MODE) throw err
    }
  }
  const rows = await getOfflineDb(tenantId).cache_expenses.toArray()
  return applyLocalFilters(rows)
}

export async function listAccountsCached() {
  const tenantId = getTenantId()
  const { online } = getConnectivity()
  if (!OFFLINE_MODE || online) {
    try {
      const res = await rawAccounts.list()
      if (OFFLINE_MODE) {
        const db = getOfflineDb(tenantId)
        for (const a of res.data || []) {
          const existing = await db.cache_accounts.get(a.id)
          if (!existing?.pending) await db.cache_accounts.put({ ...a, pending: false })
        }
        const pending = await db.cache_accounts.filter((a) => a.pending).toArray()
        const ids = new Set((res.data || []).map((a) => a.id))
        return [...pending.filter((p) => !ids.has(p.id)), ...(res.data || [])]
      }
      return res.data
    } catch (err) {
      if (!OFFLINE_MODE) throw err
    }
  }
  return getOfflineDb(tenantId).cache_accounts.toArray()
}
