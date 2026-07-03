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
 * Human-facing order code from a sequence number, e.g. 4 -> "SM-0004".
 * The internal `id` (a UUID) stays the technical key for dedup; this is the
 * short, readable number staff and customers use to track an order.
 */
export function formatOrderCode(n) {
  const num = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  return `SM-${String(num).padStart(4, '0')}`
}

/** Next per-outlet sequence number = highest existing orderNumber + 1. */
function nextOrderNumber(orders) {
  const max = orders.reduce(
    (m, o) => (Number.isFinite(o?.orderNumber) ? Math.max(m, o.orderNumber) : m),
    0
  )
  return max + 1
}

/**
 * Persist a complete order record. Returns the saved record (with a generated
 * id, a sequential orderNumber + orderCode, and savedAt). Idempotency: if an
 * order with the same `id` already exists, it is NOT written again — this blocks
 * double-logging from a double-click (and keeps its original order number).
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

    const orderNumber = Number.isFinite(order.orderNumber)
      ? order.orderNumber
      : nextOrderNumber(orders)

    const record = {
      ...order,
      id,
      orderNumber,
      orderCode: order.orderCode ?? formatOrderCode(orderNumber),
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

/**
 * Overwrite an existing order (admin "modify"). Matches by `id`; the caller
 * passes the full re-billed record. Preserves anything already on the record
 * that the patch doesn't mention (e.g. orderNumber/orderCode/timestamp) and
 * stamps `updatedAt`. No-op with `not-found` if the id isn't present.
 * @param {object} order - must include `id`
 * @returns {{ ok: boolean, order?: object, reason?: string }}
 */
export function updateOrder(order) {
  try {
    const orders = readAll()
    const idx = orders.findIndex((o) => o.id === order?.id)
    if (idx === -1) return { ok: false, reason: 'not-found' }

    const record = { ...orders[idx], ...order, updatedAt: new Date().toISOString() }
    orders[idx] = record
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders))
    return { ok: true, order: record }
  } catch (err) {
    console.error('[orderStore] failed to update order', err)
    return { ok: false, reason: 'write-failed' }
  }
}

/**
 * Soft-cancel an order: keep the record (auditable) but mark it cancelled.
 * @param {string} id
 * @returns {{ ok: boolean, order?: object, reason?: string }}
 */
export function cancelOrder(id) {
  return updateOrder({ id, status: 'cancelled', cancelledAt: new Date().toISOString() })
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
