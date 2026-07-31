import axios from 'axios'
import { getToken, getFreshToken } from '../tokenStore'

// Local default: same-origin `/api/v1` (Vite proxies to backend).
// Production: set VITE_API_BASE_URL to the full API host.
let rawBase = (import.meta.env.VITE_API_BASE_URL || '').trim()
if (!rawBase) {
  rawBase = '/api/v1'
} else {
  if (rawBase.endsWith('/')) rawBase = rawBase.slice(0, -1)
  if (!rawBase.endsWith('/api/v1')) rawBase = `${rawBase}/api/v1`
}
const BASE_URL = rawBase

export const getTenantId = () =>
  localStorage.getItem('rc_tenant_id') || import.meta.env.VITE_TENANT_ID || ''

// For backwards compatibility
export const TENANT_ID = getTenantId()

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
})

// ── Request interceptor — ensure active token on every request ─────────────────
api.interceptors.request.use(async (config) => {
  let token = getToken()
  if (!token) {
    token = await getFreshToken()
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor — auto-retry on 401 with force-refreshed Clerk token ─
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        const freshToken = await getFreshToken({ skipCache: true })
        if (freshToken) {
          originalRequest.headers.Authorization = `Bearer ${freshToken}`
          return api(originalRequest)
        }
      } catch (retryErr) {
        console.error('[Appa Software] Auto-retry after 401 failed:', retryErr)
      }
    }
    return Promise.reject(error)
  }
)

// ── Products ──────────────────────────────────────────────────────────────────
export const productsApi = {
  list: (params = {}) =>
    api.get('/products/', { params: { tenant_id: getTenantId(), ...params } }),

  frequentlySold: (limit = 20) =>
    api.get('/products/frequently-sold', { params: { tenant_id: getTenantId(), limit } }),

  search: (query, category = null) =>
    api.get('/products/', {
      params: { tenant_id: getTenantId(), search: query, category: category || undefined },
    }),

  categories: () =>
    api.get('/products/categories', { params: { tenant_id: getTenantId() } }),

  create: (data) =>
    api.post('/products/', data, { params: { tenant_id: getTenantId() } }),

  update: (id, data) =>
    api.patch(`/products/${id}`, data, { params: { tenant_id: getTenantId() } }),

  delete: (id) =>
    api.delete(`/products/${id}`, { params: { tenant_id: getTenantId() } }),

  lowStock: () =>
    api.get('/products/', { params: { tenant_id: getTenantId(), low_stock: true } }),

  reset: () =>
    api.post('/products/reset', null, { params: { tenant_id: getTenantId() } }),

  importCsv: (items) =>
    api.post('/products/import-csv', items, { params: { tenant_id: getTenantId() } }),
}

// ── POS ───────────────────────────────────────────────────────────────────────
export const posApi = {
  checkout: (payload) =>
    api.post('/pos/checkout', { tenant_id: getTenantId(), ...payload }),

  recentSales: (targetDate = null, limit = 50) =>
    api.get('/pos/sales', { params: { tenant_id: getTenantId(), target_date: targetDate || undefined, limit: targetDate ? 1000 : limit } }),

  deleteSale: (saleId) =>
    api.delete(`/pos/sales/${saleId}`, { params: { tenant_id: getTenantId() } }),

  updateItemQty: (saleId, itemId, quantity) =>
    api.patch(`/pos/sales/${saleId}/items/${itemId}`, { quantity }, { params: { tenant_id: getTenantId() } }),

  deleteItem: (saleId, itemId) =>
    api.delete(`/pos/sales/${saleId}/items/${itemId}`, { params: { tenant_id: getTenantId() } }),

  purgeTransactions: (includeExpenses = true) =>
    api.delete('/pos/purge-transactions', { params: { tenant_id: getTenantId(), include_expenses: includeExpenses } }),
}

// ── Expenses ──────────────────────────────────────────────────────────────────
export const expensesApi = {
  list: (params = {}) =>
    api.get('/expenses/', { params: { tenant_id: getTenantId(), ...params } }),

  create: (data) =>
    api.post('/expenses/', data, { params: { tenant_id: getTenantId() } }),

  categories: () =>
    api.get('/expenses/categories', { params: { tenant_id: getTenantId() } }),

  delete: (id) =>
    api.delete(`/expenses/${id}`, { params: { tenant_id: getTenantId() } }),
}

// ── Accounts ──────────────────────────────────────────────────────────────────
export const accountsApi = {
  list: () => 
    api.get('/accounts/', { params: { tenant_id: getTenantId() } }),
  create: (data) =>
    api.post('/accounts/', data, { params: { tenant_id: getTenantId() } }),
  update: (id, data) =>
    api.put(`/accounts/${id}`, data, { params: { tenant_id: getTenantId() } }),
  delete: (id) =>
    api.delete(`/accounts/${id}`, { params: { tenant_id: getTenantId() } }),
  transfer: (data) =>
    api.post('/accounts/transfer', data, { params: { tenant_id: getTenantId() } }),
  deposit: (data) =>
    api.post('/accounts/deposit', data, { params: { tenant_id: getTenantId() } }),
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export const analyticsApi = {
  summary: (startDate = null, endDate = null) =>
    api.get('/analytics/summary', {
      params: { tenant_id: getTenantId(), start_date: startDate || undefined, end_date: endDate || undefined },
    }),

  report: (startDate, endDate) =>
    api.get('/analytics/report', {
      params: { tenant_id: getTenantId(), start_date: startDate, end_date: endDate },
    }),
}

// ── AI ────────────────────────────────────────────────────────────────────────
export const aiApi = {
  status: () => api.get('/ai/status'),

  query: (question, threadId = null) =>
    api.post(
      '/ai/query',
      { question, tenant_id: getTenantId(), thread_id: threadId || undefined },
      { timeout: 60000 },
    ),

  listThreads: () =>
    api.get('/ai/threads', { params: { tenant_id: getTenantId() } }),

  createThread: (title = 'New chat') =>
    api.post('/ai/threads', { tenant_id: getTenantId(), title }),

  getMessages: (threadId) =>
    api.get(`/ai/threads/${threadId}/messages`, {
      params: { tenant_id: getTenantId() },
    }),

  deleteThread: (threadId) =>
    api.delete(`/ai/threads/${threadId}`, {
      params: { tenant_id: getTenantId() },
    }),

  eodSummary: (targetDate = null) =>
    api.get('/ai/eod-summary', {
      params: { tenant_id: getTenantId(), target_date: targetDate || undefined },
      timeout: 60000,
    }),
}

// ── ML (Image Recognition) ────────────────────────────────────────────────────
export const mlApi = {
  recognize: (vector) =>
    api.post('/ml/recognize', { vector }, { params: { tenant_id: getTenantId() } }),

  teach: (productId, vector) =>
    api.post('/ml/teach', { product_id: productId, vector }, { params: { tenant_id: getTenantId() } }),
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  me: () => api.get('/auth/me'),
  updateStore: (data) => api.post('/auth/update-store', data),
  listStores: () => api.get('/auth/stores'),
  createStore: (data) => api.post('/auth/create-store', data),
}

export default api
