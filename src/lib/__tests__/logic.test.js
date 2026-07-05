import { describe, it, expect } from 'vitest'
import { validateName, validatePhone, validateQuantity } from '../validators'
import { unitPrice, subtotal, discount, gst, gstBreakdown, finalTotal, computeBill, computeOrderBill } from '../billing'
import { parseMenuText } from '../menuLoader'
import { parseTaxConfig, DEFAULT_TAX_CONFIG } from '../taxConfig'
import { formatOrderCode } from '../orderStore'

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

describe('formatOrderCode', () => {
  it('zero-pads to a SM-#### tracking code', () => {
    expect(formatOrderCode(1)).toBe('SM-0001')
    expect(formatOrderCode(42)).toBe('SM-0042')
    expect(formatOrderCode(1042)).toBe('SM-1042')
  })
  it('is defensive about bad input', () => {
    expect(formatOrderCode(0)).toBe('SM-0000')
    expect(formatOrderCode(-3)).toBe('SM-0000')
    expect(formatOrderCode(undefined)).toBe('SM-0000')
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

describe('parseOpsConfig', () => {
  it('uses defaults for missing config', async () => {
    const { parseOpsConfig, DEFAULT_OPS_CONFIG } = await import('@/lib/opsConfig')
    expect(parseOpsConfig(null)).toEqual({ ...DEFAULT_OPS_CONFIG })
  })
  it('parses valid ops config', async () => {
    const { parseOpsConfig } = await import('@/lib/opsConfig')
    expect(parseOpsConfig({ prep_sla_minutes: 15, queue_poll_ms: 10000 })).toEqual({
      prep_sla_minutes: 15,
      queue_poll_ms: 10000,
      store_open_hour: 11,
      store_close_hour: 23,
    })
  })
})

describe('analyticsFormat', () => {
  it('formats KPI primary values', async () => {
    const { formatKpiPrimary, kitchenProgressLabel } = await import('@/lib/analyticsFormat')
    expect(formatKpiPrimary('sales', { value: 42000, format: 'currency' })).toBe('₹42,000')
    expect(formatKpiPrimary('order_times', { value: 11.2, format: 'minutes' })).toBe('11.2 min')
    expect(formatKpiPrimary('cancellations', { value: 4.2, format: 'percent' })).toBe('4.2%')
    expect(formatKpiPrimary('order_times', { value: null, format: 'minutes' })).toBe('—')
    expect(kitchenProgressLabel([
      { status_code: 'ready' },
      { status_code: 'preparing' },
    ])).toBe('Preparing (1/2 ready)')
  })
})

describe('parseOpsConfig', () => {
  it('uses defaults for missing config', async () => {
    const { parseOpsConfig, DEFAULT_OPS_CONFIG } = await import('@/lib/opsConfig')
    expect(parseOpsConfig(null)).toEqual({ ...DEFAULT_OPS_CONFIG })
  })
  it('parses valid ops config', async () => {
    const { parseOpsConfig } = await import('@/lib/opsConfig')
    expect(parseOpsConfig({ prep_sla_minutes: 15, queue_poll_ms: 10000 })).toEqual({
      prep_sla_minutes: 15,
      queue_poll_ms: 10000,
      store_open_hour: 11,
      store_close_hour: 23,
    })
  })
})

describe('analyticsFormat', () => {
  it('formats KPI primary values', async () => {
    const { formatKpiPrimary, kitchenProgressLabel } = await import('@/lib/analyticsFormat')
    expect(formatKpiPrimary('sales', { value: 4200, format: 'currency' })).toBe('₹4,200')
    expect(formatKpiPrimary('order_times', { value: 11.2, format: 'minutes' })).toBe('11.2 min')
    expect(formatKpiPrimary('cancellations', { value: 4.2, format: 'percent' })).toBe('4.2%')
    expect(kitchenProgressLabel([
      { status_code: 'ready' },
      { status_code: 'preparing' },
    ])).toBe('Preparing (1/2 ready)')
  })
})

describe('parseOpsConfig', () => {
  it('uses defaults for missing config', async () => {
    const { parseOpsConfig, DEFAULT_OPS_CONFIG } = await import('@/lib/opsConfig')
    expect(parseOpsConfig(null)).toEqual({ ...DEFAULT_OPS_CONFIG })
  })
  it('parses valid ops config', async () => {
    const { parseOpsConfig } = await import('@/lib/opsConfig')
    expect(parseOpsConfig({ prep_sla_minutes: 15, queue_poll_ms: 10000 })).toEqual({
      prep_sla_minutes: 15,
      queue_poll_ms: 10000,
      store_open_hour: 11,
      store_close_hour: 23,
    })
  })
})

describe('analyticsFormat', () => {
  it('formats KPI primary values', async () => {
    const { formatKpiPrimary, kitchenProgressLabel } = await import('@/lib/analyticsFormat')
    expect(formatKpiPrimary('sales', { value: 42000, format: 'currency' })).toBe('₹42,000')
    expect(formatKpiPrimary('order_times', { value: 11.2, format: 'minutes' })).toBe('11.2 min')
    expect(formatKpiPrimary('cancellations', { value: 4.2, format: 'percent' })).toBe('4.2%')
    expect(
      kitchenProgressLabel([
        { status_code: 'ready' },
        { status_code: 'preparing' },
      ])
    ).toBe('Preparing (1/2 ready)')
  })
})

describe('suggestionStore', () => {
  it('getBhayyaRuleIntro returns friendly copy per rule', async () => {
    const { getBhayyaRuleIntro } = await import('@/lib/suggestionStore')
    expect(getBhayyaRuleIntro('pairing')).toContain('Customers love adding')
    expect(getBhayyaRuleIntro('hour_bucket')).toContain('around this time')
    expect(getBhayyaRuleIntro('top_seller')).toContain('best seller')
    expect(getBhayyaRuleIntro('attach_rate')).toContain('Most customers add')
    expect(getBhayyaRuleIntro('bulk_discount', { message: 'Add 1 more pizza for 10% off your whole order.' }))
      .toBe('Add 1 more pizza for 10% off your whole order.')
    expect(getBhayyaRuleIntro('unknown', { message: 'Fallback line.' })).toBe('Fallback line.')
  })

  it('buildBulkDiscountSuggestion when one pizza short of min qty', async () => {
    const { buildBulkDiscountSuggestion, DEFAULT_SUGGESTION_CONFIG } = await import('@/lib/suggestionStore')
    const taxConfig = { discount: { rate: 0.1, minQuantity: 5 } }
    const hit = buildBulkDiscountSuggestion({
      cartTotalQty: 3,
      lineQty: 1,
      taxConfig,
      config: DEFAULT_SUGGESTION_CONFIG,
    })
    expect(hit?.rule).toBe('bulk_discount')
    expect(hit?.message).toContain('10%')
    expect(buildBulkDiscountSuggestion({ cartTotalQty: 2, lineQty: 1, taxConfig, config: DEFAULT_SUGGESTION_CONFIG })).toBeNull()
  })

  it('mergeSuggestions filters sold-out and selected toppings', async () => {
    const { mergeSuggestions, DEFAULT_SUGGESTION_CONFIG } = await import('@/lib/suggestionStore')
    const toppings = [{ id: 'T1', name: 'Extra Cheese', price: 40 }]
    const api = [{
      rule: 'pairing',
      message: 'x',
      action: { type: 'add_topping', item_id: 'T1', item_name: 'Extra Cheese' },
    }]
    const soldOut = new Set(['T1'])
    expect(mergeSuggestions(api, { toppings, soldOutToppings: soldOut, config: DEFAULT_SUGGESTION_CONFIG }).length).toBe(0)

    const merged = mergeSuggestions(api, {
      toppings,
      soldOutToppings: new Set(),
      selectedToppingIds: [],
      config: DEFAULT_SUGGESTION_CONFIG,
    })
    expect(merged).toHaveLength(1)
    expect(merged[0].action.item_id).toBe('T1')
  })

  it('suggestionKey includes action type for pizza vs topping', async () => {
    const { suggestionKey } = await import('@/lib/suggestionStore')
    expect(
      suggestionKey({ rule: 'hour_bucket', action: { type: 'add_pizza', item_id: 'P5' } })
    ).toBe('hour_bucket-add_pizza-P5')
    expect(
      suggestionKey({ rule: 'pairing', action: { type: 'add_topping', item_id: 'T1' } })
    ).toBe('pairing-add_topping-T1')
  })

  it('mergeSuggestions filters add_pizza for current or sold-out pizza', async () => {
    const { mergeSuggestions, DEFAULT_SUGGESTION_CONFIG } = await import('@/lib/suggestionStore')
    const pizzas = [
      { id: 'P1', name: 'Margherita', price: 200 },
      { id: 'P5', name: 'Farm House', price: 280 },
    ]
    const api = [{
      rule: 'hour_bucket',
      message: 'Popular this lunch: Farm House.',
      action: { type: 'add_pizza', item_id: 'P5', item_name: 'Farm House' },
    }]

    expect(
      mergeSuggestions(api, {
        pizzas,
        currentPizzaId: 'P5',
        config: DEFAULT_SUGGESTION_CONFIG,
      }).length
    ).toBe(0)

    expect(
      mergeSuggestions(api, {
        pizzas,
        currentPizzaId: 'P1',
        soldOutPizzas: new Set(['P5']),
        config: DEFAULT_SUGGESTION_CONFIG,
      }).length
    ).toBe(0)

    const merged = mergeSuggestions(api, {
      pizzas,
      currentPizzaId: 'P1',
      config: DEFAULT_SUGGESTION_CONFIG,
    })
    expect(merged).toHaveLength(1)
    expect(merged[0].action.item_id).toBe('P5')
  })

  it('mergeSuggestions resolves add_pizza by name when item_id is null', async () => {
    const { mergeSuggestions, DEFAULT_SUGGESTION_CONFIG } = await import('@/lib/suggestionStore')
    const pizzas = [
      { id: 'P1', name: 'Margherita', price: 200 },
      { id: 'P5', name: 'Farm House', price: 280 },
    ]
    const api = [{
      rule: 'hour_bucket',
      message: 'Popular this lunch: Farm House.',
      action: { type: 'add_pizza', item_id: null, item_name: 'Farm House' },
    }]

    const merged = mergeSuggestions(api, {
      pizzas,
      currentPizzaId: 'P1',
      config: DEFAULT_SUGGESTION_CONFIG,
    })
    expect(merged).toHaveLength(1)
    expect(merged[0].action.item_id).toBe('P5')
  })

  it('mergeMenuSuggestions resolves add_pizza by name when item_id is null', async () => {
    const { mergeMenuSuggestions, DEFAULT_SUGGESTION_CONFIG } = await import('@/lib/suggestionStore')
    const pizzas = [
      { id: 'P1', name: 'Margherita', price: 200 },
      { id: 'P5', name: 'Farm House', price: 280 },
    ]
    const api = [{
      rule: 'top_seller',
      message: 'Popular: Farm House.',
      action: { type: 'add_pizza', item_id: null, item_name: 'Farm House' },
    }]

    const merged = mergeMenuSuggestions(api, {
      pizzas,
      config: DEFAULT_SUGGESTION_CONFIG,
    })
    expect(merged).toHaveLength(1)
    expect(merged[0].action.item_id).toBe('P5')
  })

  it('mergeMenuSuggestions filters cart and sold-out pizzas', async () => {
    const { mergeMenuSuggestions, DEFAULT_SUGGESTION_CONFIG } = await import('@/lib/suggestionStore')
    const pizzas = [
      { id: 'P1', name: 'Margherita', price: 200 },
      { id: 'P5', name: 'Farm House', price: 280 },
    ]
    const api = [
      {
        rule: 'hour_bucket',
        message: 'Popular this lunch: Farm House.',
        action: { type: 'add_pizza', item_id: 'P5', item_name: 'Farm House' },
      },
      {
        rule: 'top_seller',
        message: 'Popular: Margherita.',
        action: { type: 'add_pizza', item_id: 'P1', item_name: 'Margherita' },
      },
    ]

    expect(
      mergeMenuSuggestions(api, {
        pizzas,
        cartPizzaIds: ['P5'],
        config: DEFAULT_SUGGESTION_CONFIG,
      })
    ).toHaveLength(1)

    expect(
      mergeMenuSuggestions(api, {
        pizzas,
        soldOutPizzas: new Set(['P1']),
        config: DEFAULT_SUGGESTION_CONFIG,
      })
    ).toHaveLength(1)
  })
})

describe('staffRoles', () => {
  it('allows manager and admin to manage orders', async () => {
    const { canManageOrders } = await import('../staffRoles')
    expect(canManageOrders('manager')).toBe(true)
    expect(canManageOrders('admin')).toBe(true)
    expect(canManageOrders('Manager')).toBe(true)
  })

  it('denies regular staff', async () => {
    const { canManageOrders } = await import('../staffRoles')
    expect(canManageOrders('staff')).toBe(false)
    expect(canManageOrders('')).toBe(false)
  })
})

describe('orderDisplay', () => {
  it('normalises order status', async () => {
    const { normOrderStatus } = await import('../orderDisplay')
    expect(normOrderStatus('completed')).toBe('completed')
    expect(normOrderStatus('cancelled')).toBe('cancelled')
    expect(normOrderStatus('placed')).toBe('active')
  })

  it('summarises line items', async () => {
    const { summariseOrderItems } = await import('../orderDisplay')
    expect(
      summariseOrderItems({
        items: [{ pizza: { name: 'Margherita' }, quantity: 2 }],
      })
    ).toBe('Margherita ×2')
  })
})

describe('analyticsDefinitions', () => {
  it('has non-empty definitions for every category, detail, and panel key', async () => {
    const {
      CATEGORY_KEYS,
      DETAIL_KEYS,
      PANEL_KEYS,
      getCategoryDefinition,
      getDetailDefinition,
      getPanelDefinition,
      detailKeyFromQuadrant,
    } = await import('@/lib/analyticsDefinitions')

    for (const key of CATEGORY_KEYS) {
      expect(getCategoryDefinition(key), key).toMatch(/\S/)
    }
    for (const key of DETAIL_KEYS) {
      expect(getDetailDefinition(key), key).toMatch(/\S/)
    }
    for (const key of PANEL_KEYS) {
      expect(getPanelDefinition(key), key).toMatch(/\S/)
    }

    expect(detailKeyFromQuadrant('Promote')).toBe('promote')
    expect(getDetailDefinition(detailKeyFromQuadrant('Stars'))).toMatch(/hidden gems/i)
  })
})
