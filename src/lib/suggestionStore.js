// suggestionStore.js
// Read seam for rule-based upsell suggestions during pizza customization.

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export const SUGGESTION_CONFIG_FILE = '/config/suggestion_config.json'

export const DEFAULT_SUGGESTION_CONFIG = Object.freeze({
  lookback_days: { pairing: 30, hour_bucket: 14, attach_rate: 30 },
  min_attach_rate: 0.25,
  min_orders_for_suggestions: 2,
  max_suggestions: 2,
  hour_buckets: {
    morning: [[10, 11]],
    lunch: [[11, 15]],
    evening: [[17, 21]],
    late: [[21, 23]],
  },
  rules_enabled: {
    pairing: true,
    hour_bucket: true,
    attach_rate: true,
    bulk_discount: true,
  },
})

const isPosInt = (n) => Number.isInteger(n) && n > 0
const isRate = (n) => Number.isFinite(n) && n >= 0 && n <= 1

/**
 * Validate + normalise suggestion config. Pure; never throws.
 * @param {any} raw
 * @returns {typeof DEFAULT_SUGGESTION_CONFIG}
 */
export function parseSuggestionConfig(raw) {
  const d = DEFAULT_SUGGESTION_CONFIG
  if (!raw || typeof raw !== 'object') {
    console.warn('[suggestionStore] config missing — using defaults')
    return d
  }

  const rawLookback = raw.lookback_days ?? {}
  const lookback = {
    pairing: isPosInt(rawLookback.pairing) ? rawLookback.pairing : d.lookback_days.pairing,
    hour_bucket: isPosInt(rawLookback.hour_bucket) ? rawLookback.hour_bucket : d.lookback_days.hour_bucket,
    attach_rate: isPosInt(rawLookback.attach_rate) ? rawLookback.attach_rate : d.lookback_days.attach_rate,
  }

  let minAttach = raw.min_attach_rate
  if (!isRate(minAttach)) minAttach = d.min_attach_rate

  let minOrders = raw.min_orders_for_suggestions
  if (!isPosInt(minOrders)) minOrders = d.min_orders_for_suggestions

  let maxSuggestions = raw.max_suggestions
  if (!isPosInt(maxSuggestions)) maxSuggestions = d.max_suggestions

  const hour_buckets = { ...d.hour_buckets }
  if (raw.hour_buckets && typeof raw.hour_buckets === 'object') {
    for (const [key, ranges] of Object.entries(raw.hour_buckets)) {
      if (!Array.isArray(ranges)) continue
      const valid = ranges.filter(
        (r) => Array.isArray(r) && r.length >= 2 && Number.isFinite(r[0]) && Number.isFinite(r[1])
      )
      if (valid.length) hour_buckets[key] = valid
    }
  }

  const rules_enabled = { ...d.rules_enabled }
  if (raw.rules_enabled && typeof raw.rules_enabled === 'object') {
    for (const key of Object.keys(rules_enabled)) {
      if (typeof raw.rules_enabled[key] === 'boolean') {
        rules_enabled[key] = raw.rules_enabled[key]
      }
    }
  }

  return {
    lookback_days: lookback,
    min_attach_rate: minAttach,
    min_orders_for_suggestions: minOrders,
    max_suggestions: maxSuggestions,
    hour_buckets,
    rules_enabled,
  }
}

/** Fetch + parse suggestion config. Self-defaults on error. */
export async function loadSuggestionConfig() {
  try {
    const res = await fetch(SUGGESTION_CONFIG_FILE)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return parseSuggestionConfig(await res.json())
  } catch (err) {
    console.warn(`[suggestionStore] could not load ${SUGGESTION_CONFIG_FILE} (${err.message}) — using defaults`)
    return DEFAULT_SUGGESTION_CONFIG
  }
}

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

/**
 * Fetch ranked DB-backed suggestions for the current customize context.
 * @param {{ pizzaId: string, pizzaName?: string, toppingIds?: string[], cartQty?: number }} ctx
 * @returns {Promise<{ suggestions: Array }>}
 */
export async function getSuggestions({ pizzaId, pizzaName, toppingIds = [], cartQty = 0 }) {
  if (!pizzaId) return { suggestions: [] }
  try {
    const tops = toppingIds.filter(Boolean).join(',')
    const params = new URLSearchParams({
      pizza_id: pizzaId,
      topping_ids: tops,
      cart_qty: String(Math.max(0, cartQty)),
    })
    if (pizzaName) params.set('pizza_name', pizzaName)
    return await apiFetch(`/api/suggestions?${params}`)
  } catch (err) {
    console.warn('[suggestionStore] could not fetch suggestions', err)
    return { suggestions: [] }
  }
}

/**
 * Fetch popular pizza suggestions for the order menu screen.
 * @param {{ cartQty?: number, excludePizzaIds?: string[] }} ctx
 * @returns {Promise<{ suggestions: Array }>}
 */
export async function getMenuSuggestions({ cartQty = 0, excludePizzaIds = [] } = {}) {
  try {
    const params = new URLSearchParams({
      cart_qty: String(Math.max(0, cartQty)),
    })
    const excluded = excludePizzaIds.filter(Boolean).join(',')
    if (excluded) params.set('exclude_pizza_ids', excluded)
    return await apiFetch(`/api/suggestions/menu?${params}`)
  } catch (err) {
    console.warn('[suggestionStore] could not fetch menu suggestions', err)
    return { suggestions: [] }
  }
}

const DISMISS_KEY = 'slicematic-bhayya-dismissed'

/** Read dismissed suggestion keys for this browser session. */
export function getDismissedKeys() {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Persist a dismissed suggestion key for this session. */
export function dismissSuggestion(key) {
  if (!key) return
  const set = new Set(getDismissedKeys())
  set.add(key)
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...set]))
  } catch {
    /* quota / private mode */
  }
}

/** Friendly one-liner intro copy per suggestion rule (UI voice). */
export function getBhayyaRuleIntro(rule, suggestion = {}) {
  switch (rule) {
    case 'pairing':
      return 'Customers love adding this with their pizza from recent orders.'
    case 'hour_bucket':
      return 'Popular with customers ordering around this time.'
    case 'top_seller':
      return 'A best seller from recent orders.'
    case 'attach_rate':
      return 'Most customers add this — worth a try.'
    case 'bulk_discount':
      return suggestion?.message ?? 'Add one more pizza for a bulk discount on your order.'
    default:
      return suggestion?.message ?? ''
  }
}

/** Stable key for dedupe + dismiss tracking. */
export function suggestionKey(s) {
  const action = s?.action ?? {}
  const kind = action.type ?? 'info'
  const item = action.item_id ?? action.item_name ?? s?.message ?? ''
  return `${s?.rule ?? 'unknown'}-${kind}-${item}`
}

/**
 * R4 — bulk discount nudge (frontend-only, from taxConfig).
 * @param {{ cartTotalQty: number, lineQty: number, taxConfig: object, config: object }} opts
 * @returns {object|null}
 */
export function buildBulkDiscountSuggestion({ cartTotalQty, lineQty, taxConfig, config = DEFAULT_SUGGESTION_CONFIG }) {
  if (config?.rules_enabled?.bulk_discount === false) return null
  const minQty = taxConfig?.discount?.minQuantity ?? 5
  const rate = taxConfig?.discount?.rate ?? 0.1
  if (cartTotalQty + lineQty !== minQty - 1) return null
  const pct = Math.round(rate * 100)
  return {
    rule: 'bulk_discount',
    message: `Add 1 more pizza for ${pct}% off your whole order.`,
    action: { type: 'info' },
  }
}

/**
 * Merge API suggestions with R4, filter dismissed/sold-out, cap at max.
 * @param {object[]} apiSuggestions
 * @param {object} opts
 * @returns {object[]}
 */
export function mergeSuggestions(apiSuggestions, opts) {
  const {
    cartTotalQty = 0,
    lineQty = 1,
    taxConfig,
    config = DEFAULT_SUGGESTION_CONFIG,
    soldOutToppings,
    soldOutPizzas,
    currentPizzaId,
    selectedToppingIds = [],
    toppings = [],
    pizzas = [],
  } = opts

  const dismissed = new Set(getDismissedKeys())
  const soldOutTops = soldOutToppings ?? new Set()
  const soldOutPz = soldOutPizzas ?? new Set()
  const selected = new Set(selectedToppingIds)
  const maxN = config.max_suggestions ?? 2

  const topByName = new Map(toppings.map((t) => [t.name.toLowerCase(), t.id]))
  const topById = new Map(toppings.map((t) => [t.id, t]))
  const pizzaById = new Map(pizzas.map((p) => [p.id, p]))
  const pizzaByName = new Map(pizzas.map((p) => [p.name.toLowerCase(), p.id]))

  function resolveToppingId(s) {
    const action = s?.action ?? {}
    if (action.type !== 'add_topping') return action.item_id ?? null
    if (action.item_id && topById.has(action.item_id)) return action.item_id
    const name = action.item_name
    if (name && topByName.has(name.toLowerCase())) return topByName.get(name.toLowerCase())
    return action.item_id ?? null
  }

  function resolvePizzaId(s) {
    const action = s?.action ?? {}
    if (action.type !== 'add_pizza') return action.item_id ?? null
    if (action.item_id && pizzaById.has(action.item_id)) return action.item_id
    const name = action.item_name
    if (name && pizzaByName.has(name.toLowerCase())) return pizzaByName.get(name.toLowerCase())
    return action.item_id ?? null
  }

  function isBlocked(s) {
    if (dismissed.has(suggestionKey(s))) return true
    const action = s?.action ?? {}
    if (action.type === 'add_topping') {
      const id = resolveToppingId(s)
      if (!id || soldOutTops.has(id) || selected.has(id)) return true
    }
    if (action.type === 'add_pizza') {
      const id = resolvePizzaId(s)
      if (!id || soldOutPz.has(id) || id === currentPizzaId) return true
    }
    return false
  }

  const out = []
  for (const s of apiSuggestions ?? []) {
    if (out.length >= maxN) break
    if (isBlocked(s)) continue
    const resolved = { ...s, action: { ...s.action } }
    if (resolved.action.type === 'add_topping') {
      const id = resolveToppingId(resolved)
      if (!id) continue
      resolved.action.item_id = id
    }
    if (resolved.action.type === 'add_pizza') {
      const id = resolvePizzaId(resolved)
      if (!id) continue
      resolved.action.item_id = id
    }
    out.push(resolved)
  }

  const bulk = buildBulkDiscountSuggestion({ cartTotalQty, lineQty, taxConfig, config })
  if (bulk && out.length < maxN && !dismissed.has(suggestionKey(bulk))) {
    out.push(bulk)
  }

  return out.slice(0, maxN)
}

/**
 * Merge menu-level pizza suggestions — filters dismissed, sold-out, and cart pizzas.
 * @param {object[]} apiSuggestions
 * @param {object} opts
 * @returns {object[]}
 */
export function mergeMenuSuggestions(apiSuggestions, opts) {
  const {
    config = DEFAULT_SUGGESTION_CONFIG,
    soldOutPizzas,
    cartPizzaIds = [],
    pizzas = [],
  } = opts

  const dismissed = new Set(getDismissedKeys())
  const soldOut = soldOutPizzas ?? new Set()
  const inCart = new Set(cartPizzaIds)
  const maxN = config.max_suggestions ?? 2
  const pizzaById = new Map(pizzas.map((p) => [p.id, p]))
  const pizzaByName = new Map(pizzas.map((p) => [p.name.toLowerCase(), p.id]))

  function resolvePizzaId(s) {
    const action = s?.action ?? {}
    if (action.type !== 'add_pizza') return action.item_id ?? null
    if (action.item_id && pizzaById.has(action.item_id)) return action.item_id
    const name = action.item_name
    if (name && pizzaByName.has(name.toLowerCase())) return pizzaByName.get(name.toLowerCase())
    return action.item_id ?? null
  }

  function isBlocked(s) {
    if (dismissed.has(suggestionKey(s))) return true
    const action = s?.action ?? {}
    if (action.type !== 'add_pizza') return true
    const id = resolvePizzaId(s)
    if (!id || soldOut.has(id) || inCart.has(id)) return true
    return false
  }

  const out = []
  for (const s of apiSuggestions ?? []) {
    if (out.length >= maxN) break
    if (isBlocked(s)) continue
    const resolved = { ...s, action: { ...s.action } }
    const id = resolvePizzaId(resolved)
    if (!id) continue
    resolved.action.item_id = id
    out.push(resolved)
  }

  return out.slice(0, maxN)
}
