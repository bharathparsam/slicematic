const API_BASE = import.meta.env.VITE_API_URL ?? ''

async function apiFetch(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
    } catch { /* keep */ }
    return { ok: false, message: detail }
  }
  const data = await res.json()
  return { ok: true, data }
}

export async function getQueue() {
  const res = await apiFetch('/api/kitchen/queue')
  if (!res.ok) {
    console.warn('[kitchenStore] queue failed', res.message)
    return []
  }
  return res.data ?? []
}

export async function assignItem(itemId, staffId) {
  return apiFetch(`/api/kitchen/items/${itemId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ staff_id: staffId }),
  })
}

export async function transitionItem(itemId, toStatus, staffId) {
  return apiFetch(`/api/kitchen/items/${itemId}/transition`, {
    method: 'POST',
    body: JSON.stringify({ to_status: toStatus, staff_id: staffId }),
  })
}

export function formatElapsed(seconds) {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function slaLevel(elapsedSeconds, slaMinutes) {
  if (elapsedSeconds == null || !slaMinutes) return 'ok'
  const mins = elapsedSeconds / 60
  if (mins >= slaMinutes * 1.25) return 'critical'
  if (mins >= slaMinutes) return 'warning'
  return 'ok'
}
