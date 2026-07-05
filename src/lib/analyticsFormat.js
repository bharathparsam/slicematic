/** Pure formatters for analytics KPI display (tested in Vitest). */

export function formatKpiPrimary(category, primary) {
  if (!primary || primary.value == null) return '—'
  const v = primary.value
  const fmt = primary.format
  if (fmt === 'currency') return '₹' + Math.round(Number(v)).toLocaleString('en-IN')
  if (fmt === 'percent') return `${v}%`
  if (fmt === 'minutes') return `${v} min`
  return String(v)
}

export function formatKpiSecondary(category, secondary, details) {
  if (!secondary) return null
  if (category === 'order_times' && secondary.slowest_pizza) {
    return `Slowest: ${secondary.slowest_pizza}`
  }
  if (category === 'cancellations') {
    const parts = []
    if (secondary.count != null) parts.push(`${secondary.count} cancels`)
    if (secondary.top_stage && secondary.top_stage_pct != null) {
      parts.push(`Most at: ${capitalize(secondary.top_stage)} (${secondary.top_stage_pct}%)`)
    }
    return parts.join(' · ') || null
  }
  if (category === 'table_utilisation' && secondary.sessions_per_table != null) {
    return `${secondary.sessions_per_table} sessions/table avg`
  }
  if (category === 'sales' && secondary.orders != null) {
    return `${secondary.orders} orders`
  }
  return null
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** Kitchen progress label for admin orders table. */
export function kitchenProgressLabel(items) {
  if (!items?.length) return null
  const withStatus = items.filter((it) => it.status_code)
  if (!withStatus.length) return null
  const ready = withStatus.filter((it) => it.status_code === 'ready' || it.status_code === 'served').length
  const preparing = withStatus.some((it) => it.status_code === 'preparing')
  if (preparing) return `Preparing (${ready}/${withStatus.length} ready)`
  if (ready === withStatus.length) return `Ready (${ready}/${withStatus.length})`
  return `${ready}/${withStatus.length} ready`
}
