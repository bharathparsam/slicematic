// orderStore.js
// The persistence seam. Components NEVER touch localStorage directly — they go
// through saveOrder / getAllOrders. To move to Supabase later, only this file
// changes: swap the bodies for async supabase.from('orders')... calls and make
// the callers await them. The interface (order in, orders out) stays the same.

const STORAGE_KEY = 'slicematic_orders'

/** Safely read the raw array from localStorage. Never throws. */
function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.warn('[orderStore] could not read/parse orders — starting empty', err)
    return []
  }
}

/** Return all saved orders, most recent first. */
export function getAllOrders() {
  const orders = readAll()
  // Sort by savedAt desc; fall back to insertion order if missing.
  return [...orders].sort((a, b) => {
    const ta = Date.parse(a?.savedAt ?? a?.timestamp ?? 0) || 0
    const tb = Date.parse(b?.savedAt ?? b?.timestamp ?? 0) || 0
    return tb - ta
  })
}

/**
 * Persist a complete order record. Returns the saved record (with a generated
 * id + savedAt). Idempotency: if an order with the same `id` already exists,
 * it is NOT written again — this blocks double-logging from a double-click.
 * @param {object} order
 * @returns {{ ok: boolean, order?: object, reason?: string }}
 */
export function saveOrder(order) {
  try {
    const orders = readAll()

    const id = order.id ?? generateId()
    if (orders.some((o) => o.id === id)) {
      return { ok: false, reason: 'duplicate', order: orders.find((o) => o.id === id) }
    }

    const record = {
      ...order,
      id,
      savedAt: order.savedAt ?? new Date().toISOString(),
    }

    orders.push(record)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders))
    return { ok: true, order: record }
  } catch (err) {
    console.error('[orderStore] failed to save order', err)
    return { ok: false, reason: 'write-failed' }
  }
}

/** Clear all orders (admin utility / demo reset). */
export function clearOrders() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

/** Collision-resistant enough id for a single-outlet MVP. */
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
