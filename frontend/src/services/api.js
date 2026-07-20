import axios from 'axios'
import { getToken } from '../tokenStore'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'

export const getTenantId = () =>
  localStorage.getItem('rc_tenant_id') || import.meta.env.VITE_TENANT_ID || ''

// For backwards compatibility
export const TENANT_ID = getTenantId()

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
})

// ── Auth interceptor — attach Clerk token to every request ────────────────────
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

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

  recentSales: (limit = 20) =>
    api.get('/pos/sales', { params: { tenant_id: getTenantId(), limit } }),
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

// ── Analytics ─────────────────────────────────────────────────────────────────
export const analyticsApi = {
  summary: (targetDate = null) =>
    api.get('/analytics/summary', {
      params: { tenant_id: getTenantId(), target_date: targetDate || undefined },
    }),

  report: (startDate, endDate) =>
    api.get('/analytics/report', {
      params: { tenant_id: getTenantId(), start_date: startDate, end_date: endDate },
    }),
}

// ── AI ────────────────────────────────────────────────────────────────────────
export const aiApi = {
  query: (question) =>
    api.post('/ai/query', { question, tenant_id: getTenantId() }),

  eodSummary: (targetDate = null) =>
    api.get('/ai/eod-summary', {
      params: { tenant_id: getTenantId(), target_date: targetDate || undefined },
    }),
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  me: () => api.get('/auth/me'),
  updateStore: (data) => api.post('/auth/update-store', data),
  listStores: () => api.get('/auth/stores'),
  createStore: (data) => api.post('/auth/create-store', data),
}

export default api
