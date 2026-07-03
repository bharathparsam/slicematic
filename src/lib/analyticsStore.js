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
