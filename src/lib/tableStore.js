// tableStore.js
// Persistence seam for dine-in tables — backed by store_tables via the Python API.

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

  if (res.status === 204) return null
  return res.json()
}

/** List active tables from the API. Returns [] on failure. */
export async function listTables() {
  try {
    const rows = await apiFetch('/api/tables')
    return Array.isArray(rows) ? rows : []
  } catch (err) {
    console.warn('[tableStore] could not fetch tables — returning empty', err)
    return []
  }
}

/** Create a new store_tables row. tableNumber = the numeric part only. */
export async function createTable(tableNumber) {
  try {
    const created = await apiFetch('/api/new_table', {
      method: 'POST',
      body: JSON.stringify({ table_number: String(tableNumber).trim() }),
    })
    return { ok: true, table: created }
  } catch (err) {
    console.error('[tableStore] failed to create table', err)
    return { ok: false, message: err.message }
  }
}

/** Reserve / un-reserve a table by label. */
export async function setTableBlocked(label, blocked) {
  try {
    const row = await apiFetch('/api/block_table', {
      method: 'POST',
      body: JSON.stringify({ label, blocked }),
    })
    return { ok: true, table: row }
  } catch (err) {
    return { ok: false, message: err.message }
  }
}

/** Remove (soft-delete) a table by label. Fails if a guest is seated. */
export async function removeTable(label) {
  try {
    const row = await apiFetch('/api/remove_table', {
      method: 'POST',
      body: JSON.stringify({ label }),
    })
    return { ok: true, table: row }
  } catch (err) {
    return { ok: false, message: err.message }
  }
}

/** Merge config file tables with API tables, de-duplicated and naturally sorted. */
export function mergeTableLabels(configTables, apiTables, labelPrefix = 'Table') {
  const fromApi = (apiTables ?? []).map((t) => t.label).filter(Boolean)
  const merged = [...new Set([...(configTables ?? []), ...fromApi])]
  return sortTableLabels(merged, labelPrefix)
}

/**
 * Derive the customer-facing table list + the set of blocked (reserved) labels
 * from the config file and the API rows. A table the admin removed (is_active
 * false) is subtracted even if it's still in the config file.
 * @returns {{ tables: string[], blocked: string[] }}
 */
export function mergeTablesWithState(configTables, apiRows, labelPrefix = 'Table') {
  const rows = apiRows ?? []
  const removed = new Set(rows.filter((r) => r.is_active === false).map((r) => r.label))
  const activeApi = rows.filter((r) => r.is_active !== false).map((r) => r.label).filter(Boolean)
  const all = [...new Set([...(configTables ?? []), ...activeApi])].filter((l) => !removed.has(l))
  const blocked = rows
    .filter((r) => r.is_active !== false && r.is_blocked && !removed.has(r.label))
    .map((r) => r.label)
  return {
    tables: sortTableLabels(all, labelPrefix),
    blocked: sortTableLabels(blocked, labelPrefix),
  }
}

export function sortTableLabels(names, labelPrefix = 'Table') {
  const prefix = `${labelPrefix} `
  return [...names].sort((a, b) => {
    const na = a.startsWith(prefix) ? parseInt(a.slice(prefix.length), 10) : NaN
    const nb = b.startsWith(prefix) ? parseInt(b.slice(prefix.length), 10) : NaN
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
    return a.localeCompare(b, undefined, { numeric: true })
  })
}
