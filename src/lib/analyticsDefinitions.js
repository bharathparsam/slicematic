/** One-line KPI definitions for Admin analytics (face, detail, chart panels). */

export const CATEGORY_KEYS = ['order_times', 'cancellations', 'table_utilisation', 'sales']

export const DETAIL_KEYS = [
  'prep_p90',
  'backlog_now',
  'promote',
  'protect_optimize',
  'stars',
  'fix_or_drop',
  'revenue_lost',
  'top_cancelled',
  'cancel_stage',
  'recent_cancel',
  'busiest_table',
  'tables_in_use_now',
  'avg_ticket',
  'top_pizza',
]

export const PANEL_KEYS = ['sales_7d', 'payment_mix', 'top_pizzas', 'custom_range']

const CATEGORY_DEFINITIONS = {
  order_times: 'Average minutes from queued to ready per item, last 7 days.',
  cancellations: 'Cancelled orders as a % of all non-active orders, last 7 days.',
  table_utilisation: 'Average minutes from seated to table closed, last 7 days.',
  sales: 'Net sales after discounts, last 7 business days.',
}

const DETAIL_DEFINITIONS = {
  prep_p90: '90% of items were ready within this many minutes.',
  backlog_now: 'Items still queued or in prep right now.',
  promote: 'Fast prep and high revenue — worth promoting.',
  protect_optimize: 'High revenue but slow prep — protect and speed up.',
  stars: 'Fast prep but low revenue — hidden gems.',
  fix_or_drop: 'Slow and low revenue — fix or drop from the menu.',
  revenue_lost: 'Sum of order totals on cancelled orders in the window.',
  top_cancelled: 'Most-cancelled pizzas on orders marked cancelled.',
  cancel_stage: 'Share of cancels at each order stage before cancel.',
  recent_cancel: 'Latest cancelled orders for a quick audit.',
  busiest_table: 'Table with the most sessions in the window.',
  tables_in_use_now: 'Tables with an open session right now.',
  avg_ticket: 'Average net total per settled order.',
  top_pizza: 'Best-selling pizza by units in the window.',
}

const PANEL_DEFINITIONS = {
  sales_7d: 'Net sales per business day for the last 7 days.',
  payment_mix: 'Share of settled orders by payment method.',
  top_pizzas: 'Top sellers by units across all orders.',
  custom_range: 'Pick any date range for day-wise gross, discount, and net.',
}

const QUADRANT_DETAIL_KEYS = {
  Promote: 'promote',
  'Protect & optimize prep': 'protect_optimize',
  Stars: 'stars',
  'Fix or drop': 'fix_or_drop',
}

export function getCategoryDefinition(category) {
  return CATEGORY_DEFINITIONS[category] ?? null
}

export function getDetailDefinition(key) {
  return DETAIL_DEFINITIONS[key] ?? null
}

export function getPanelDefinition(key) {
  return PANEL_DEFINITIONS[key] ?? null
}

/** Map a product-matrix quadrant label to a detail definition key. */
export function detailKeyFromQuadrant(quadrant) {
  return QUADRANT_DETAIL_KEYS[quadrant] ?? null
}

const DETAIL_TITLE_KEYS = {
  'Prep p90': 'prep_p90',
  'Backlog now': 'backlog_now',
  'Revenue lost': 'revenue_lost',
  'Top cancelled': 'top_cancelled',
  'Cancel stage': 'cancel_stage',
  'Recent cancel': 'recent_cancel',
  'Busiest table': 'busiest_table',
  'Tables in use now': 'tables_in_use_now',
  'Avg ticket': 'avg_ticket',
  'Top pizza': 'top_pizza',
}

/** Resolve a detail-card title (or key) to its one-liner. */
export function getDetailDefinitionByTitle(title) {
  const key = DETAIL_TITLE_KEYS[title] ?? title
  return getDetailDefinition(key)
}
