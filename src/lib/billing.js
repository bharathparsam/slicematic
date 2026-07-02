// billing.js
// Pure money math for one combo order. No side effects, no DOM.
// Every function is independently testable and safe to explain line-by-line.

export const DISCOUNT_QTY_THRESHOLD = 5 // qty >= 5 earns the discount
export const DISCOUNT_RATE = 0.1 // 10% off the subtotal
export const GST_RATE = 0.18 // 18% GST

/** Round to 2 decimal places, avoiding binary float drift (e.g. 1.005). */
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Unit price = price of the one base + the one pizza + every selected topping.
 * @param {{price:number}} base
 * @param {{price:number}} pizza
 * @param {Array<{price:number}>} toppings
 */
export function unitPrice(base, pizza, toppings = []) {
  const basePrice = base?.price ?? 0
  const pizzaPrice = pizza?.price ?? 0
  const toppingsPrice = toppings.reduce((sum, t) => sum + (t?.price ?? 0), 0)
  return round2(basePrice + pizzaPrice + toppingsPrice)
}

/** Subtotal = unit price × quantity. */
export function subtotal(unit, qty) {
  return round2(unit * qty)
}

/** Discount = 10% of subtotal, but only when qty >= 5. Otherwise 0. */
export function discount(sub, qty) {
  if (qty >= DISCOUNT_QTY_THRESHOLD) {
    return round2(sub * DISCOUNT_RATE)
  }
  return 0
}

/**
 * GST is charged on the POST-DISCOUNT amount: 18% of (subtotal − discount).
 * This is the function I expect to be asked to walk through.
 */
export function gst(sub, disc) {
  const taxable = sub - disc
  return round2(taxable * GST_RATE)
}

/** Final payable = (subtotal − discount) + GST. */
export function finalTotal(sub, disc, tax) {
  return round2(sub - disc + tax)
}

/**
 * Compute the whole bill in one place so the UI and the saved order record
 * never disagree. Returns every intermediate line for the itemised summary.
 * @returns {{unit, quantity, subtotal, discount, gst, total, discountApplied}}
 */
export function computeBill(base, pizza, toppings, quantity) {
  const qty = Number(quantity)
  const unit = unitPrice(base, pizza, toppings)
  const sub = subtotal(unit, qty)
  const disc = discount(sub, qty)
  const tax = gst(sub, disc)
  const total = finalTotal(sub, disc, tax)
  return {
    unit,
    quantity: qty,
    subtotal: sub,
    discount: disc,
    gst: tax,
    total,
    discountApplied: disc > 0,
  }
}

/**
 * Aggregate an order made of MULTIPLE combos (a cart).
 * Each entry is { base, pizza, toppings, quantity }. We reuse computeBill per
 * line and sum. Because discount (10% when that line's qty >= 5) and GST (18%)
 * are both linear, summing per-line bills equals taxing the aggregate — so the
 * graded per-combo math is preserved exactly.
 *
 * DECISION: the bulk discount is evaluated PER COMBO LINE (a line qualifies when
 * its own quantity >= 5), the faithful extension of the original per-order rule.
 * Switch to cart-wide total quantity only if the spec later says so.
 *
 * @param {Array<{base,pizza,toppings,quantity}>} lineItems
 * @returns {{lines: Array, subtotal, discount, gst, total, totalQuantity, discountApplied}}
 */
export function computeOrderBill(lineItems = []) {
  const lines = lineItems.map((item) => {
    const bill = computeBill(item.base, item.pizza, item.toppings, item.quantity)
    return { ...item, ...bill }
  })

  const subtotal = round2(lines.reduce((s, l) => s + l.subtotal, 0))
  const discount = round2(lines.reduce((s, l) => s + l.discount, 0))
  const gst = round2(lines.reduce((s, l) => s + l.gst, 0))
  const total = round2(lines.reduce((s, l) => s + l.total, 0))
  const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0)

  return {
    lines,
    subtotal,
    discount,
    gst,
    total,
    totalQuantity,
    discountApplied: discount > 0,
  }
}

/** Format a number as Indian Rupees for display. */
export function formatCurrency(n) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n ?? 0)
}
