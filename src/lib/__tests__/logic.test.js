import { describe, it, expect } from 'vitest'
import { validateName, validatePhone, validateQuantity } from '../validators'
import { unitPrice, subtotal, discount, gst, gstBreakdown, finalTotal, computeBill, computeOrderBill } from '../billing'
import { parseMenuText } from '../menuLoader'
import { parseTaxConfig, DEFAULT_TAX_CONFIG } from '../taxConfig'

describe('validateName', () => {
  it('rejects only-spaces', () => expect(validateName('   ').valid).toBe(false))
  it('rejects too short', () => expect(validateName('A').valid).toBe(false))
  it('rejects digits', () => expect(validateName('Raj4n').valid).toBe(false))
  it('accepts letters + spaces', () => expect(validateName('Rajan Sharma').valid).toBe(true))
  it('rejects >40 chars', () => expect(validateName('a'.repeat(41)).valid).toBe(false))
})

describe('validatePhone', () => {
  it('rejects starting with 1', () => expect(validatePhone('1234567890').valid).toBe(false))
  it('rejects <10 digits', () => expect(validatePhone('98765').valid).toBe(false))
  it('rejects letters', () => expect(validatePhone('98765abcde').valid).toBe(false))
  it('accepts valid 9-start', () => expect(validatePhone('9876543210').valid).toBe(true))
})

describe('validateQuantity', () => {
  it('rejects 0', () => expect(validateQuantity(0).valid).toBe(false))
  it('rejects 11', () => expect(validateQuantity(11).valid).toBe(false))
  it('rejects empty', () => expect(validateQuantity('').valid).toBe(false))
  it('rejects non-integer', () => expect(validateQuantity('2.5').valid).toBe(false))
  it('rejects negative', () => expect(validateQuantity(-3).valid).toBe(false))
  it('accepts 1 and 10', () => {
    expect(validateQuantity(1).valid).toBe(true)
    expect(validateQuantity(10).valid).toBe(true)
  })
})

describe('billing', () => {
  const base = { price: 150 }
  const pizza = { price: 200 }
  const toppings = [{ price: 60 }, { price: 40 }]

  it('unit price sums base+pizza+toppings', () => {
    expect(unitPrice(base, pizza, toppings)).toBe(450)
  })

  it('no discount below qty 5', () => {
    expect(discount(subtotal(450, 4), 4)).toBe(0)
  })

  it('10% discount at qty >= 5', () => {
    const sub = subtotal(450, 5) // 2250
    expect(discount(sub, 5)).toBe(225)
  })

  it('GST (default 5%) is charged on the POST-discount amount', () => {
    const sub = 2250
    const disc = 225
    expect(gst(sub, disc)).toBe(101.25) // 5% of 2025
  })

  it('gstBreakdown splits into CGST + SGST that sum to the GST total', () => {
    const b = gstBreakdown(2250, 225) // taxable 2025, 5%
    expect(b.total).toBe(101.25)
    expect(b.cgst).toBe(50.63) // 2.5% of 2025, rounded
    expect(b.sgst).toBe(50.62) // total - cgst, so parts reconcile exactly
    expect(round2(b.cgst + b.sgst)).toBe(b.total)
  })

  it('respects a custom 18% config (hotel restaurant)', () => {
    const hotel = { gst: { rate: 0.18, cgst: 0.09, sgst: 0.09 }, discount: { rate: 0.1, minQuantity: 5 } }
    const cfg = parseTaxConfig(hotel)
    expect(gst(2250, 225, cfg)).toBe(364.5) // 18% of 2025
  })

  it('final total = subtotal - discount + gst', () => {
    expect(finalTotal(2250, 225, 101.25)).toBe(2126.25)
  })

  it('computeBill end-to-end at qty 5 (5% GST)', () => {
    const bill = computeBill(base, pizza, toppings, 5)
    expect(bill).toMatchObject({
      unit: 450,
      subtotal: 2250,
      discount: 225,
      gst: 101.25,
      total: 2126.25,
      discountApplied: true,
    })
  })

  it('computeBill at qty 2 has no discount', () => {
    const bill = computeBill(base, pizza, toppings, 2)
    expect(bill.discount).toBe(0)
    expect(bill.gst).toBe(45) // 5% of 900
    expect(bill.total).toBe(945)
  })
})

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

describe('computeOrderBill (multi-combo cart)', () => {
  const base = { id: 'B1', price: 100 }
  const pizza = { id: 'P1', price: 200 }

  it('sums multiple line items', () => {
    const order = computeOrderBill([
      { base, pizza, toppings: [], quantity: 2 }, // unit 300, sub 600, gst 30, total 630
      { base, pizza, toppings: [{ price: 50 }], quantity: 1 }, // unit 350, sub 350, gst 17.5, total 367.5
    ])
    expect(order.totalQuantity).toBe(3)
    expect(order.subtotal).toBe(950)
    expect(order.discount).toBe(0)
    expect(order.gst).toBe(47.5) // 5% of 950
    expect(order.total).toBe(997.5)
    expect(order.lines).toHaveLength(2)
  })

  it('discounts EVERY line once the overall quantity qualifies (>= 5)', () => {
    const order = computeOrderBill([
      { base, pizza, toppings: [], quantity: 5 }, // sub 1500, disc 150
      { base, pizza, toppings: [], quantity: 2 }, // sub 600, disc 60 (order total 7 >= 5)
    ])
    expect(order.totalQuantity).toBe(7)
    expect(order.subtotal).toBe(2100)
    expect(order.discount).toBe(210) // 10% of both lines, not just the qty-5 line
    expect(order.gst).toBe(94.5) // 5% of (2100 - 210) = 5% of 1890
    expect(order.total).toBe(1984.5)
    expect(order.discountApplied).toBe(true)
    expect(order.lines.every((l) => l.discountApplied)).toBe(true)
  })

  it('applies the discount at the exact boundary of 5 pizzas across lines', () => {
    const order = computeOrderBill([
      { base, pizza, toppings: [], quantity: 3 }, // sub 900, disc 90
      { base, pizza, toppings: [], quantity: 2 }, // sub 600, disc 60 (order total 5)
    ])
    expect(order.totalQuantity).toBe(5)
    expect(order.discount).toBe(150) // 10% of 1500
    expect(order.discountApplied).toBe(true)
  })

  it('gives NO discount when the overall quantity is below 5, even across lines', () => {
    const order = computeOrderBill([
      { base, pizza, toppings: [], quantity: 2 }, // sub 600
      { base, pizza, toppings: [], quantity: 2 }, // sub 600 (order total 4 < 5)
    ])
    expect(order.totalQuantity).toBe(4)
    expect(order.discount).toBe(0)
    expect(order.gst).toBe(60) // 5% of 1200
    expect(order.discountApplied).toBe(false)
  })

  it('empty cart yields zeroes', () => {
    const order = computeOrderBill([])
    expect(order).toMatchObject({ subtotal: 0, discount: 0, gst: 0, total: 0, totalQuantity: 0 })
  })
})

describe('parseTaxConfig (defensive, customizable rates)', () => {
  it('falls back to defaults for missing/garbage input', () => {
    expect(parseTaxConfig(null)).toEqual(DEFAULT_TAX_CONFIG)
    expect(parseTaxConfig('nope')).toEqual(DEFAULT_TAX_CONFIG)
  })

  it('accepts a valid custom config', () => {
    const cfg = parseTaxConfig({
      serviceType: 'hotel_restaurant',
      gst: { label: 'GST', rate: 0.18, cgst: 0.09, sgst: 0.09, inputTaxCredit: true },
      discount: { rate: 0.15, minQuantity: 3 },
    })
    expect(cfg.gst.rate).toBe(0.18)
    expect(cfg.gst.inputTaxCredit).toBe(true)
    expect(cfg.discount).toEqual({ rate: 0.15, minQuantity: 3 })
  })

  it('derives an even CGST/SGST split when they do not sum to the rate', () => {
    const cfg = parseTaxConfig({ gst: { rate: 0.05, cgst: 0.04, sgst: 0.04 } })
    expect(cfg.gst.cgst).toBe(0.025)
    expect(cfg.gst.sgst).toBe(0.025)
  })

  it('rejects out-of-range rates and a non-integer threshold', () => {
    const cfg = parseTaxConfig({
      gst: { rate: 5 }, // 500% -> invalid, default 0.05
      discount: { rate: -1, minQuantity: 2.5 },
    })
    expect(cfg.gst.rate).toBe(0.05)
    expect(cfg.discount.rate).toBe(0.1)
    expect(cfg.discount.minQuantity).toBe(5)
  })
})

describe('parseMenuText (defensive)', () => {
  it('parses good lines and skips malformed ones', () => {
    const text = [
      '1;Thin Crust;120',
      '', // blank
      '2;Bad;abc', // non-numeric price
      '3;Missing Price', // too few fields
      '  4  ;  Spaced  ;  150  ', // whitespace trimmed
      '5;Negative;-10', // non-positive
    ].join('\n')
    const items = parseMenuText(text, 'test')
    expect(items).toEqual([
      { id: '1', name: 'Thin Crust', price: 120 },
      { id: '4', name: 'Spaced', price: 150 },
    ])
  })

  it('returns [] for non-string', () => expect(parseMenuText(null)).toEqual([]))
})
