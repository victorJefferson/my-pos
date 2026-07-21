/**
 * saleUtils.js — Single source of truth for sale financial calculations.
 *
 * ALL sale total displays across the app MUST use these functions so numbers
 * are always consistent, even when backend stored totals are stale.
 *
 * Rule: sale.total_amount from the DB can lag after item edits.
 *       Item-level unit_price × qty is always authoritative.
 *       We ALWAYS recompute from items on the frontend.
 */

/**
 * Compute sale-level totals from its item array.
 * @param {Object} sale - SaleRead object from API
 * @returns {{ total: number, cost: number, profit: number, margin: number }}
 */
export function computeSaleTotals(sale) {
  const items = sale?.items ?? []
  const total  = items.reduce((s, i) => s + parseFloat(i.total_price ?? 0), 0)
  const cost   = items.reduce((s, i) => s + parseFloat(i.unit_cost_price ?? 0) * (i.quantity ?? 1), 0)
  const profit = total - cost
  const margin = total > 0 ? (profit / total) * 100 : 0
  return { total, cost, profit, margin }
}

/**
 * Compute item-level line total — guards against stale item.total_price.
 * @param {Object} item - SaleItemRead object
 * @returns {{ lineTotal: number, lineProfit: number }}
 */
export function computeItemTotals(item) {
  const sp = parseFloat(item.unit_selling_price ?? 0)
  const cp = parseFloat(item.unit_cost_price ?? 0)
  const qty = item.quantity ?? 1
  return { lineTotal: sp * qty, lineProfit: (sp - cp) * qty }
}

/**
 * Aggregate totals across an array of sales.
 * @param {Array} sales
 * @returns {{ totalRevenue: number, totalProfit: number, totalCost: number }}
 */
export function computeAggregateTotals(sales) {
  return (sales ?? []).reduce(
    (acc, sale) => {
      const t = computeSaleTotals(sale)
      return {
        totalRevenue: acc.totalRevenue + t.total,
        totalCost:    acc.totalCost    + t.cost,
        totalProfit:  acc.totalProfit  + t.profit,
      }
    },
    { totalRevenue: 0, totalCost: 0, totalProfit: 0 }
  )
}

/** Format a number as rupee string with 2 decimal places. */
export function fmtRupee(amount) {
  return '\u20b9' + parseFloat(amount ?? 0).toFixed(2)
}
