/** Parse sale/expense timestamps from server (naive UTC) or client ISO (with Z). */
export function parseAppDate(dateStr) {
  if (!dateStr) return null
  const s = String(dateStr).trim()
  if (!s) return null
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(`${s}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Local calendar day YYYY-MM-DD (cashier timezone). */
export function localDateKey(dateStrOrDate = new Date()) {
  if (dateStrOrDate instanceof Date) {
    if (Number.isNaN(dateStrOrDate.getTime())) return ''
    return dateStrOrDate.toLocaleDateString('en-CA')
  }
  const d = parseAppDate(dateStrOrDate)
  if (!d) return ''
  return d.toLocaleDateString('en-CA')
}

export function formatAppDate(dateStr, opts) {
  const d = parseAppDate(dateStr)
  if (!d) return '—'
  return d.toLocaleDateString('en-IN', opts)
}

export function formatAppTime(dateStr, opts) {
  const d = parseAppDate(dateStr)
  if (!d) return '—'
  return d.toLocaleTimeString('en-IN', opts)
}

export function timeAgoApp(dateStr) {
  const d = parseAppDate(dateStr)
  if (!d) return ''
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return `${Math.max(0, diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
