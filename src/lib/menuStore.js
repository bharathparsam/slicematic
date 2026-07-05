// menuStore.js
// API seam for the menu availability overlay (sold-out toggles).
// The menu itself still comes from menuLoader (public/data/*.txt); this seam
// only carries the mutable "sold out" flag per item id, persisted in Postgres.

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

  return res.json()
}

/**
 * READ seam — self-defaulting: returns a Set of sold-out item ids for the given
 * type. Never throws into the UI; on any error the order page just shows every
 * item as available.
 * @param {string} itemType
 * @returns {Promise<Set<string>>}
 */
export async function getSoldOutIds(itemType = 'pizza') {
  try {
    const data = await apiFetch(`/api/menu/availability?item_type=${itemType}`)
    const ids = (data.items ?? []).filter((it) => it.is_sold_out).map((it) => it.item_id)
    return new Set(ids)
  } catch (err) {
    console.warn('[menuStore] could not fetch availability', err)
    return new Set()
  }
}

/**
 * READ seam — fetch the sold-out sets for all three menu types in parallel.
 * Each call self-defaults, so a partial failure just yields an empty set for
 * that type; the order flow never breaks.
 * @returns {Promise<{ pizzas: Set<string>, bases: Set<string>, toppings: Set<string> }>}
 */
export async function getAllSoldOut() {
  const [pizzas, bases, toppings] = await Promise.all([
    getSoldOutIds('pizza'),
    getSoldOutIds('base'),
    getSoldOutIds('topping'),
  ])
  return { pizzas, bases, toppings }
}

/**
 * Admin mutation — flip one item's sold-out flag. Returns a result object
 * (never throws) so the caller can surface a message instead of crashing.
 * @param {{ id: string, name?: string }} item
 * @param {boolean} isSoldOut
 * @param {string} itemType
 * @returns {Promise<{ ok: boolean, soldOut?: Set<string>, message?: string }>}
 */
export async function setSoldOut(item, isSoldOut, itemType = 'pizza') {
  try {
    const data = await apiFetch('/api/menu/set_availability', {
      method: 'POST',
      body: JSON.stringify({
        item_id: item.id,
        item_name: item.name ?? null,
        is_sold_out: isSoldOut,
        item_type: itemType,
      }),
    })
    const ids = (data.items ?? []).filter((it) => it.is_sold_out).map((it) => it.item_id)
    return { ok: true, soldOut: new Set(ids) }
  } catch (err) {
    return { ok: false, message: err.message || 'Could not update availability.' }
  }
}
