// analyticsStore.js
// Read-only analytics seam for the admin dashboard.

const API_BASE = import.meta.env.VITE_API_URL ?? ''

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* keep statusText */
    }
    throw new Error(detail || 'Request failed')
  }
  return res.json()
}

/** Hourly order counts for the last 7 days. */
export async function getOrdersPerHour() {
  try {
    return await apiFetch('/api/analytics/orders_per_hour')
  } catch (err) {
    console.warn('[analyticsStore] could not fetch orders per hour', err)
    return { points: [], timezone: 'Asia/Kolkata' }
  }
}

/** Highest-sold pizzas (units + revenue). */
export async function getTopProducts(limit = 8) {
  try {
    const data = await apiFetch(`/api/analytics/top_products?limit=${limit}`)
    return data.products ?? []
  } catch (err) {
    console.warn('[analyticsStore] could not fetch top products', err)
    return []
  }
}

/** Net/gross sales per business day for the last N days. */
export async function getSalesDaily(days = 7) {
  try {
    const data = await apiFetch(`/api/analytics/sales_daily?days=${days}`)
    return data.days ?? []
  } catch (err) {
    console.warn('[analyticsStore] could not fetch daily sales', err)
    return []
  }
}

/** Ops-first analytics summary (4 categories). */
export async function getAnalyticsSummary(days = 7) {
  try {
    return await apiFetch(`/api/analytics/summary?days=${days}`)
  } catch (err) {
    console.warn('[analyticsStore] could not fetch summary', err)
    return null
  }
}

/**
 * Day-wise sales (orders/gross/discount/net) for a custom inclusive date range.
 * Dates are IST business dates as 'YYYY-MM-DD'. Self-defaults to [] on error.
 */
export async function getSalesRange(start, end) {
  try {
    const data = await apiFetch(`/api/analytics/sales_range?start=${start}&end=${end}`)
    return data.days ?? []
  } catch (err) {
    console.warn('[analyticsStore] could not fetch sales range', err)
    return []
  }
}

/** Captured revenue by tender type for the last N days. */
export async function getPaymentMix(days = 7) {
  try {
    const data = await apiFetch(`/api/analytics/payment_mix?days=${days}`)
    return data.methods ?? []
  } catch (err) {
    console.warn('[analyticsStore] could not fetch payment mix', err)
    return []
  }
}

