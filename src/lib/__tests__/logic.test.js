import { describe, it, expect } from 'vitest'
import { validateName, validatePhone, validateQuantity } from '../validators'
import { unitPrice, subtotal, discount, gst, finalTotal, computeBill, computeOrderBill } from '../billing'
import { parseMenuText } from '../menuLoader'

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

  it('GST is 18% of POST-discount amount', () => {
    const sub = 2250
    const disc = 225
    expect(gst(sub, disc)).toBe(364.5) // 18% of 2025
  })

  it('final total = subtotal - discount + gst', () => {
    expect(finalTotal(2250, 225, 364.5)).toBe(2389.5)
  })

  it('computeBill end-to-end at qty 5', () => {
    const bill = computeBill(base, pizza, toppings, 5)
    expect(bill).toMatchObject({
      unit: 450,
      subtotal: 2250,
      discount: 225,
      gst: 364.5,
      total: 2389.5,
      discountApplied: true,
    })
  })

  it('computeBill at qty 2 has no discount', () => {
    const bill = computeBill(base, pizza, toppings, 2)
    expect(bill.discount).toBe(0)
    expect(bill.gst).toBe(162) // 18% of 900
    expect(bill.total).toBe(1062)
  })
})

describe('computeOrderBill (multi-combo cart)', () => {
  const base = { id: 'B1', price: 100 }
  const pizza = { id: 'P1', price: 200 }

  it('sums multiple line items', () => {
    const order = computeOrderBill([
      { base, pizza, toppings: [], quantity: 2 }, // unit 300, sub 600, gst 108, total 708
      { base, pizza, toppings: [{ price: 50 }], quantity: 1 }, // unit 350, sub 350, gst 63, total 413
    ])
    expect(order.totalQuantity).toBe(3)
    expect(order.subtotal).toBe(950)
    expect(order.discount).toBe(0)
    expect(order.gst).toBe(171) // 18% of 950
    expect(order.total).toBe(1121)
    expect(order.lines).toHaveLength(2)
  })

  it('applies discount per qualifying line only', () => {
    const order = computeOrderBill([
      { base, pizza, toppings: [], quantity: 5 }, // sub 1500, disc 150
      { base, pizza, toppings: [], quantity: 2 }, // sub 600, disc 0
    ])
    expect(order.subtotal).toBe(2100)
    expect(order.discount).toBe(150)
    expect(order.gst).toBe(351) // 18% of (2100 - 150)
    expect(order.total).toBe(2301)
    expect(order.discountApplied).toBe(true)
  })

  it('empty cart yields zeroes', () => {
    const order = computeOrderBill([])
    expect(order).toMatchObject({ subtotal: 0, discount: 0, gst: 0, total: 0, totalQuantity: 0 })
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
