/** Normalise API/UI order status to active | completed | cancelled. */
export function normOrderStatus(status) {
  return status === 'completed' || status === 'cancelled' ? status : 'active'
}

/** Short human summary of an order's pizzas, defensive against partial records. */
export function summariseOrderItems(o) {
  if (Array.isArray(o.items) && o.items.length > 0) {
    return o.items
      .map((it) => {
        const name = it.pizza?.name ?? '—'
        return it.quantity > 1 ? `${name} ×${it.quantity}` : name
      })
      .join(', ')
  }
  const parts = []
  if (o.base?.name) parts.push(o.base.name)
  if (o.pizza?.name) parts.push(o.pizza.name)
  return parts.join(' · ') || '—'
}
