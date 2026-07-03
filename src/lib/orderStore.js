// orderStore.js
// The persistence seam. Components NEVER talk to fetch/localStorage directly —
// they go through saveOrder / getAllOrders. Backed by the Python API in /backend.

import { round2 } from './billing'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
      else if (Array.isArray(body.detail)) detail = body.detail.map((d) => d.msg).join(', ')
    } catch {
      /* keep statusText */
    }
    throw new Error(detail || 'Request failed')
  }

  if (res.status === 204) return null
  return res.json()
}

function paymentToApi(mode) {
  return (mode ?? '').toLowerCase()
}

function paymentFromApi(mode) {
  if (!mode) return ''
  return mode.charAt(0).toUpperCase() + mode.slice(1)
}

/** Map a saved frontend order record to the POST /api/orders body. */
function toCreatePayload(order) {
  return {
    name: order.customerName,
    phone: order.phone,
    table: order.table || null,
    payment_type: paymentToApi(order.paymentMode),
    items: (order.items ?? []).map((it) => {
      const lineSubtotal = it.lineSubtotal ?? 0
      const lineDiscount = it.lineDiscount ?? 0
      const taxable = round2(lineSubtotal - lineDiscount)
      const qty = it.quantity ?? 1
      return {
        pizza_type: it.pizza?.name ?? '',
        base: it.base?.name ?? '',
        toppings: (it.toppings ?? []).map((t) => t.name),
        quantity: qty,
        price_wo_gst: round2(taxable / qty),
        line_discount: lineDiscount,
        gst: it.lineGst ?? 0,
      }
    }),
  }
}

/** Map a GET /api/orders row back into the shape the UI already expects. */
export function mapApiOrder(row) {
  const items = (row.items ?? []).map((it, i) => ({
    base: { id: `b-${i}`, name: it.base ?? '—', price: 0 },
    pizza: { id: `p-${i}`, name: it.pizza_type ?? '—', price: 0 },
    toppings: (it.toppings ?? []).map((name, j) => ({ id: `t-${i}-${j}`, name, price: 0 })),
    quantity: it.quantity,
    unitPrice: 0,
    lineSubtotal: Number(it.line_subtotal ?? 0),
    lineDiscount: Number(it.line_discount ?? 0),
    lineGst: Number(it.line_tax ?? 0),
    lineTotal: Number(it.line_total ?? 0),
  }))

  const quantity = items.reduce((sum, it) => sum + it.quantity, 0)

  return {
    id: row.order_id,
    orderCode: row.order_code,
    customerName: row.name ?? '',
    phone: row.phone ?? '',
    table: row.table ?? null,
    items,
    itemCount: items.length,
    quantity,
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
    gst: Number(row.gst ?? 0),
    total: Number(row.grand_total ?? 0),
    paymentMode: paymentFromApi(row.payment_type),
    timestamp: row.created_at,
    savedAt: row.created_at,
    status: row.status ?? 'active',
  }
}

/** Return all saved orders, most recent first. */
export async function getAllOrders() {
  try {
    const rows = await apiFetch('/api/orders')
    return Array.isArray(rows) ? rows.map(mapApiOrder) : []
  } catch (err) {
    console.warn('[orderStore] could not fetch orders — returning empty', err)
    return []
  }
}

/**
 * Human-facing order code from a sequence number, e.g. 4 -> "SM-0004".
 * Kept for tests / display helpers.
 */
export function formatOrderCode(n) {
  const num = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  return `SM-${String(num).padStart(4, '0')}`
}

/**
 * Persist a complete order record via POST /api/orders.
 * Returns the saved record (with server-generated id + orderCode).
 */
export async function saveOrder(order) {
  try {
    const created = await apiFetch('/api/orders', {
      method: 'POST',
      body: JSON.stringify(toCreatePayload(order)),
    })

    const record = {
      ...order,
      id: created.order_id,
      orderCode: created.order_code,
      total: Number(created.grand_total),
      status: order.status ?? 'active',
      savedAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
    }

    return { ok: true, order: record }
  } catch (err) {
    console.error('[orderStore] failed to save order', err)
    return { ok: false, reason: 'write-failed', message: err.message }
  }
}

/**
 * Overwrite an existing order — not supported by the backend yet.
 */
export async function updateOrder(order) {
  void order
  return { ok: false, reason: 'not-supported', message: 'Order editing is not supported yet.' }
}

export async function cancelOrder(id) {
  void id
  return { ok: false, reason: 'not-supported' }
}

export async function completeOrder(id) {
  try {
    const result = await apiFetch('/api/complete_order', {
      method: 'POST',
      body: JSON.stringify({ order_id: id }),
    })
    return {
      ok: true,
      order: {
        id: result.order_id,
        orderCode: result.order_code,
        table: result.table ?? null,
        status: 'completed',
      },
    }
  } catch (err) {
    console.error('[orderStore] failed to complete order', err)
    return { ok: false, reason: 'write-failed', message: err.message }
  }
}

/** Which tables currently have an OPEN order. Pure read. */
export async function getOccupiedTables() {
  const orders = await getAllOrders()
  const open = orders.filter(
    (o) => o?.table && o.status !== 'completed' && o.status !== 'cancelled'
  )
  return [...new Set(open.map((o) => o.table))]
}

/** Clear all orders — not supported when backed by Postgres. */
export async function clearOrders() {
  return { ok: false, reason: 'not-supported' }
}

/** Collision-resistant enough id for a single-outlet MVP. */
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
