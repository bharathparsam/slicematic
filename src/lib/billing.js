// billing.js
// Pure money math for an order. No side effects, no DOM. Rates are NOT hardcoded
// here — they come from a tax config (see taxConfig.js), which is loaded from a
// data file at runtime. Each function takes the config so it stays pure and
// independently testable, and every function is safe to explain line-by-line.

import { DEFAULT_TAX_CONFIG } from './taxConfig'

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

/**
 * Discount = discount.rate of subtotal, but only when qty >= discount.minQuantity.
 * Otherwise 0. Rate + threshold come from config.
 */
export function discount(sub, qty, config = DEFAULT_TAX_CONFIG) {
  const { rate, minQuantity } = config.discount
  if (qty >= minQuantity) {
    return round2(sub * rate)
  }
  return 0
}

/**
 * GST is charged on the POST-DISCOUNT amount: rate × (subtotal − discount).
 * Rate comes from config (5% for a standalone restaurant, 18% for a hotel one).
 * This is the function reviewers ask me to walk through.
 */
export function gst(sub, disc, config = DEFAULT_TAX_CONFIG) {
  const taxable = sub - disc
  return round2(taxable * config.gst.rate)
}

/**
 * GST split into CGST + SGST for the itemised bill, the way a real Indian
 * restaurant invoice shows it. CGST is rounded, then SGST is taken as
 * (total − CGST) so the two halves always sum exactly to the GST total.
 * @returns {{ total:number, cgst:number, sgst:number }}
 */
export function gstBreakdown(sub, disc, config = DEFAULT_TAX_CONFIG) {
  const taxable = sub - disc
  const total = round2(taxable * config.gst.rate)
  const cgst = round2(taxable * config.gst.cgst)
  const sgst = round2(total - cgst)
  return { total, cgst, sgst }
}

/** Final payable = (subtotal − discount) + GST. */
export function finalTotal(sub, disc, tax) {
  return round2(sub - disc + tax)
}

/**
 * Compute one combo's bill in one place so the UI and the saved record never
 * disagree. Returns every intermediate line for the itemised summary.
 *
 * The discount is always 10% of THIS line's own subtotal, but WHETHER it applies
 * is gated by a quantity threshold. By default the gate is this line's own
 * quantity (a standalone single-combo bill / builder preview). An order passes
 * its TOTAL quantity as `discountGateQty` so every line in a qualifying cart is
 * discounted together — see computeOrderBill.
 * @returns {{unit, quantity, subtotal, discount, gst, cgst, sgst, total, discountApplied}}
 */
export function computeBill(base, pizza, toppings, quantity, config = DEFAULT_TAX_CONFIG, discountGateQty = null) {
  const qty = Number(quantity)
  const unit = unitPrice(base, pizza, toppings)
  const sub = subtotal(unit, qty)
  const gateQty = discountGateQty == null ? qty : discountGateQty
  const disc = discount(sub, gateQty, config)
  const { total: tax, cgst, sgst } = gstBreakdown(sub, disc, config)
  const total = finalTotal(sub, disc, tax)
  return {
    unit,
    quantity: qty,
    subtotal: sub,
    discount: disc,
    gst: tax,
    cgst,
    sgst,
    total,
    discountApplied: disc > 0,
  }
}

/**
 * Aggregate an order made of MULTIPLE combos (a cart). Each entry is
 * { base, pizza, toppings, quantity }. We reuse computeBill per line and sum.
 * Because discount and GST are both linear, summing per-line bills equals taxing
 * the aggregate — so the per-combo math is preserved exactly.
 *
 * DECISION: the bulk discount is gated by the ORDER's TOTAL quantity (the sum of
 * every line's quantity). When that total meets the threshold, each line is
 * discounted by 10% of its own subtotal (calculated + shown per line). So a cart
 * of small lines that together reach 5+ pizzas all qualify; below 5, none do.
 *
 * @param {Array<{base,pizza,toppings,quantity}>} lineItems
 * @param {typeof DEFAULT_TAX_CONFIG} config
 * @returns {{lines, subtotal, discount, gst, cgst, sgst, total, totalQuantity, discountApplied}}
 */
export function computeOrderBill(lineItems = [], config = DEFAULT_TAX_CONFIG) {
  // Order-wide gate: the discount decision uses the total pizzas across the cart.
  const totalQuantity = lineItems.reduce((s, item) => s + Number(item.quantity), 0)

  const lines = lineItems.map((item) => {
    const bill = computeBill(item.base, item.pizza, item.toppings, item.quantity, config, totalQuantity)
    return { ...item, ...bill }
  })

  const sum = (key) => round2(lines.reduce((s, l) => s + l[key], 0))
  const subtotalTotal = sum('subtotal')
  const discountTotal = sum('discount')
  const gstTotal = sum('gst')
  const cgstTotal = sum('cgst')
  const sgstTotal = sum('sgst')
  const grandTotal = sum('total')

  return {
    lines,
    subtotal: subtotalTotal,
    discount: discountTotal,
    gst: gstTotal,
    cgst: cgstTotal,
    sgst: sgstTotal,
    total: grandTotal,
    totalQuantity,
    discountApplied: discountTotal > 0,
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
